package com.thetower.services

import com.thetower.models.EventType
import com.thetower.models.LastRun
import com.thetower.models.Run
import com.thetower.models.RunError
import com.thetower.models.RunEvent
import com.thetower.models.RunStatus
import com.thetower.models.StartRunData
import com.thetower.repository.RunRepository
import com.thetower.utils.BadRequestException
import com.thetower.utils.NotFoundException
import com.thetower.utils.newId
import com.thetower.utils.nowIso
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

class RunService(
    private val runRepository: RunRepository,
    private val templateService: TemplateService
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val runningJobs = ConcurrentHashMap<String, Job>()
    private val eventFlows = ConcurrentHashMap<String, MutableSharedFlow<RunEvent>>()
    private val seqCounters = ConcurrentHashMap<String, AtomicLong>()

    fun start(templateId: String, dryRun: Boolean): StartRunData {
        val template = templateService.get(templateId)
        if (template.steps.isEmpty() && !dryRun) {
            throw BadRequestException("steps 不能为空", mapOf("field" to "steps"))
        }

        val runId = newId()
        val now = nowIso()
        val initialRun = Run(
            id = runId,
            templateId = templateId,
            status = RunStatus.PENDING,
            currentStepId = null,
            startedAt = now,
            finishedAt = null,
            error = null
        )
        runRepository.save(initialRun)

        eventFlows[runId] = MutableSharedFlow(replay = 32, extraBufferCapacity = 128)
        seqCounters[runId] = AtomicLong(0)

        val job = scope.launch {
            executeRun(runId, templateId, dryRun)
        }
        runningJobs[runId] = job

        return StartRunData(
            run = initialRun,
            wsUrl = "/ws/v1/runs/$runId"
        )
    }

    fun restart(runId: String): StartRunData {
        val run = get(runId)
        return start(run.templateId, dryRun = false)
    }

    fun get(runId: String): Run = runRepository.findById(runId)
        ?: throw NotFoundException("运行 $runId 不存在")

    fun list(
        templateId: String?,
        status: RunStatus?,
        from: String?,
        to: String?,
        limit: Int?,
        offset: Int?
    ): Pair<List<Run>, Int> {
        val fromInstant = from?.let { Instant.parse(it) }
        val toInstant = to?.let { Instant.parse(it) }
        return runRepository.list(templateId, status, fromInstant, toInstant, limit, offset)
    }

    fun cancel(runId: String): Run {
        val run = get(runId)
        if (run.status != RunStatus.PENDING && run.status != RunStatus.RUNNING) {
            throw BadRequestException("运行状态为 ${run.status}，无法取消")
        }
        runningJobs[runId]?.cancel(CancellationException("Canceled by user"))
        val canceled = run.copy(
            status = RunStatus.CANCELED,
            finishedAt = nowIso(),
            currentStepId = null
        )
        runRepository.save(canceled)
        emit(
            runId,
            EventType.RUN_CANCELED,
            buildJsonObject {
                put("summary", JsonPrimitive("canceled"))
            }
        )
        templateService.updateLastRun(
            templateId = run.templateId,
            lastRun = LastRun(runId = runId, status = RunStatus.CANCELED.name, finishedAt = canceled.finishedAt)
        )
        return canceled
    }

    fun delete(runId: String): Boolean {
        val run = runRepository.findById(runId) ?: throw NotFoundException("运行 $runId 不存在")
        if (run.status == RunStatus.RUNNING || run.status == RunStatus.PENDING) {
            runningJobs[runId]?.cancel(CancellationException("Deleted by user"))
        }
        cleanupRuntime(runId)
        return runRepository.delete(runId)
    }

    fun eventFlow(runId: String): SharedFlow<RunEvent>? = eventFlows[runId]

    private suspend fun executeRun(runId: String, templateId: String, dryRun: Boolean) {
        try {
            val runningRun = get(runId).copy(status = RunStatus.RUNNING)
            runRepository.save(runningRun)
            emit(
                runId,
                EventType.RUN_STARTED,
                buildJsonObject {
                    put("templateId", JsonPrimitive(templateId))
                }
            )

            if (dryRun) {
                val succeeded = runningRun.copy(status = RunStatus.SUCCEEDED, finishedAt = nowIso())
                runRepository.save(succeeded)
                emit(runId, EventType.RUN_SUCCEEDED, buildJsonObject { put("summary", JsonPrimitive("dry-run")) })
                templateService.updateLastRun(
                    templateId,
                    LastRun(runId = runId, status = RunStatus.SUCCEEDED.name, finishedAt = succeeded.finishedAt)
                )
                return
            }

            val template = templateService.get(templateId)
            for (step in template.steps) {
                val current = get(runId)
                if (current.status == RunStatus.CANCELED) {
                    return
                }

                runRepository.save(current.copy(currentStepId = step.id, status = RunStatus.RUNNING))
                emit(
                    runId,
                    EventType.STEP_STARTED,
                    buildJsonObject {
                        put("stepId", JsonPrimitive(step.id))
                        put("stepType", JsonPrimitive(step.type))
                    }
                )

                emit(
                    runId,
                    EventType.LOG,
                    buildJsonObject {
                        put("level", JsonPrimitive("INFO"))
                        put("message", JsonPrimitive("执行步骤 ${step.data.label}"))
                    }
                )

                delay(300)

                if (step.type !in setOf("openUrl", "click", "type", "waitFor", "extract")) {
                    throw BadRequestException("不支持的步骤类型: ${step.type}")
                }

                val outputs = buildJsonObject {
                    if (step.type == "extract") {
                        val asVar = step.data.config["as"]?.jsonPrimitive?.contentOrNull
                        if (!asVar.isNullOrBlank()) {
                            put(asVar, JsonPrimitive("mock-value"))
                        }
                    }
                }
                emit(
                    runId,
                    EventType.STEP_SUCCEEDED,
                    buildJsonObject {
                        put("stepId", JsonPrimitive(step.id))
                        put("outputs", outputs)
                    }
                )
            }

            val succeeded = get(runId).copy(
                status = RunStatus.SUCCEEDED,
                currentStepId = null,
                finishedAt = nowIso(),
                error = null
            )
            runRepository.save(succeeded)
            emit(runId, EventType.RUN_SUCCEEDED, buildJsonObject { put("summary", JsonPrimitive("ok")) })
            templateService.updateLastRun(
                templateId,
                LastRun(runId = runId, status = RunStatus.SUCCEEDED.name, finishedAt = succeeded.finishedAt)
            )
        } catch (_: CancellationException) {
            val canceled = runRepository.findById(runId)?.copy(
                status = RunStatus.CANCELED,
                finishedAt = nowIso(),
                currentStepId = null
            )
            if (canceled != null) {
                runRepository.save(canceled)
            }
        } catch (ex: Exception) {
            val failed = get(runId).copy(
                status = RunStatus.FAILED,
                finishedAt = nowIso(),
                currentStepId = null,
                error = RunError(
                    code = if (ex is BadRequestException) ex.code else "INTERNAL_ERROR",
                    message = ex.message ?: "执行失败"
                )
            )
            runRepository.save(failed)
            emit(
                runId,
                EventType.RUN_FAILED,
                buildJsonObject {
                    put(
                        "error",
                        buildJsonObject {
                            put("code", JsonPrimitive(failed.error?.code ?: "INTERNAL_ERROR"))
                            put("message", JsonPrimitive(failed.error?.message ?: "执行失败"))
                        }
                    )
                }
            )
            templateService.updateLastRun(
                templateId,
                LastRun(runId = runId, status = RunStatus.FAILED.name, finishedAt = failed.finishedAt)
            )
        } finally {
            runningJobs.remove(runId)
        }
    }

    private fun emit(runId: String, type: EventType, payload: kotlinx.serialization.json.JsonObject) {
        val flow = eventFlows[runId] ?: return
        val seq = seqCounters[runId]?.incrementAndGet() ?: 1
        val event = RunEvent(
            runId = runId,
            seq = seq,
            ts = nowIso(),
            type = type,
            payload = payload
        )
        flow.tryEmit(event)
    }

    private fun cleanupRuntime(runId: String) {
        runningJobs.remove(runId)
        eventFlows.remove(runId)
        seqCounters.remove(runId)
    }
}
