package com.thetower.services

import com.thetower.executor.PlaywrightRunExecutor
import com.thetower.models.EventType
import com.thetower.models.LastRun
import com.thetower.models.Run
import com.thetower.models.RunError
import com.thetower.models.RunEvent
import com.thetower.models.RunStatus
import com.thetower.models.StartRunData
import com.thetower.repository.RunRepository
import com.thetower.utils.BadRequestException
import com.thetower.utils.ErrorCodes
import com.thetower.utils.RunNotFoundException
import com.thetower.utils.TtlCache
import com.thetower.utils.newId
import com.thetower.utils.nowIso
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

class RunService(
    private val runRepository: RunRepository,
    private val templateService: TemplateService,
    private val playwrightExecutor: PlaywrightRunExecutor
) {
    private val logger = KotlinLogging.logger {}
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val runningJobs = ConcurrentHashMap<String, Job>()
    private val eventFlows = ConcurrentHashMap<String, MutableSharedFlow<RunEvent>>()
    private val seqCounters = ConcurrentHashMap<String, AtomicLong>()
    private val runRequestIds = ConcurrentHashMap<String, String>()
    private val runByIdCache = TtlCache<String, Run>(ttlMs = 10_000)
    private val runListCache = TtlCache<String, Pair<List<Run>, Int>>(ttlMs = 10_000)

    private fun wsSafeMessage(message: String, limit: Int = 2_000): String {
        if (message.length <= limit) return message
        return message.take(limit) + "\n...(truncated, see GET /api/v1/runs/{id})"
    }

    fun startRun(templateId: String, dryRun: Boolean, requestId: String? = null): StartRunData {
        val template = templateService.getTemplateById(templateId)
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
        persistRun(initialRun)

        eventFlows[runId] = MutableSharedFlow(replay = 32, extraBufferCapacity = 128)
        seqCounters[runId] = AtomicLong(0)
        if (!requestId.isNullOrBlank()) {
            runRequestIds[runId] = requestId
        }

        val job = scope.launch {
            executeRun(runId, templateId, dryRun)
        }
        runningJobs[runId] = job

        return StartRunData(
            run = initialRun,
            wsUrl = "/ws/v1/runs/$runId"
        )
    }

    fun restartRun(runId: String): StartRunData {
        val run = getRunById(runId)
        val requestId = runRequestIds[runId]
        return startRun(run.templateId, dryRun = false, requestId = requestId)
    }

    fun getRunById(runId: String): Run = runRepository.findById(runId)
        ?.also { runByIdCache.put(runId, it) }
        ?: runByIdCache.get(runId)
        ?: throw RunNotFoundException("运行 $runId 不存在")

    fun getRuns(
        templateId: String?,
        status: RunStatus?,
        from: String?,
        to: String?,
        limit: Int?,
        offset: Int?
    ): Pair<List<Run>, Int> {
        val cacheKey = "runs:templateId=$templateId:status=$status:from=$from:to=$to:limit=$limit:offset=$offset"
        runListCache.get(cacheKey)?.let { cached ->
            logger.debug { "cache.hit key=$cacheKey" }
            return cached
        }

        val fromInstant = from?.let { Instant.parse(it) }
        val toInstant = to?.let { Instant.parse(it) }
        val result = runRepository.list(templateId, status, fromInstant, toInstant, limit, offset)
        runListCache.put(cacheKey, result)
        logger.debug { "cache.put key=$cacheKey" }
        return result
    }

    fun cancelRun(runId: String): Run {
        val run = getRunById(runId)
        if (run.status != RunStatus.PENDING && run.status != RunStatus.RUNNING) {
            throw BadRequestException("运行状态为 ${run.status}，无法取消")
        }
        runningJobs[runId]?.cancel(CancellationException("Canceled by user"))
        val canceled = run.copy(
            status = RunStatus.CANCELED,
            finishedAt = nowIso(),
            currentStepId = null
        )
        persistRun(canceled)
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

    fun deleteRun(runId: String): Boolean {
        val run = runRepository.findById(runId) ?: throw RunNotFoundException("运行 $runId 不存在")
        if (run.status == RunStatus.RUNNING || run.status == RunStatus.PENDING) {
            runningJobs[runId]?.cancel(CancellationException("Deleted by user"))
        }
        cleanupRuntime(runId)
        val deleted = runRepository.delete(runId)
        invalidateRunCaches(runId)
        return deleted
    }

    fun eventFlow(runId: String): SharedFlow<RunEvent>? = eventFlows[runId]

    private suspend fun executeRun(runId: String, templateId: String, dryRun: Boolean) {
        try {
            val runningRun = getRunById(runId).copy(status = RunStatus.RUNNING)
            persistRun(runningRun)
            emit(
                runId,
                EventType.RUN_STARTED,
                buildJsonObject {
                    put("templateId", JsonPrimitive(templateId))
                }
            )

            if (dryRun) {
                val succeeded = runningRun.copy(status = RunStatus.SUCCEEDED, finishedAt = nowIso())
                persistRun(succeeded)
                emit(runId, EventType.RUN_SUCCEEDED, buildJsonObject { put("summary", JsonPrimitive("dry-run")) })
                templateService.updateLastRun(
                    templateId,
                    LastRun(runId = runId, status = RunStatus.SUCCEEDED.name, finishedAt = succeeded.finishedAt)
                )
                return
            }

            val template = templateService.getTemplateById(templateId)

            withContext(Dispatchers.IO) {
                playwrightExecutor.withPage { page ->
                    for (step in template.steps) {
                        val current = getRunById(runId)
                        if (current.status == RunStatus.CANCELED) {
                            return@withPage
                        }

                        persistRun(current.copy(currentStepId = step.id, status = RunStatus.RUNNING))
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

                        try {
                            val outputs = playwrightExecutor.executeStep(page, step)
                            emit(
                                runId,
                                EventType.STEP_SUCCEEDED,
                                buildJsonObject {
                                    put("stepId", JsonPrimitive(step.id))
                                    put(
                                        "outputs",
                                        buildJsonObject {
                                            outputs.forEach { (key, value) ->
                                                put(key, JsonPrimitive(value))
                                            }
                                        }
                                    )
                                }
                            )
                        } catch (ex: CancellationException) {
                            throw ex
                        } catch (ex: Exception) {
                            val code = when (ex) {
                                is com.thetower.utils.ApiException -> ex.code
                                else -> ErrorCodes.INTERNAL_ERROR
                            }
                            val message = wsSafeMessage(ex.message ?: "执行失败")
                            emit(
                                runId,
                                EventType.STEP_FAILED,
                                buildJsonObject {
                                    put("stepId", JsonPrimitive(step.id))
                                    put("stepType", JsonPrimitive(step.type))
                                    put(
                                        "error",
                                        buildJsonObject {
                                            put("code", JsonPrimitive(code))
                                            put("message", JsonPrimitive(message))
                                        }
                                    )
                                }
                            )
                            throw ex
                        }
                    }
                }
            }

            val succeeded = getRunById(runId).copy(
                status = RunStatus.SUCCEEDED,
                currentStepId = null,
                finishedAt = nowIso(),
                error = null
            )
            persistRun(succeeded)
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
                persistRun(canceled)
            }
        } catch (ex: Exception) {
            val failed = getRunById(runId).copy(
                status = RunStatus.FAILED,
                finishedAt = nowIso(),
                currentStepId = null,
                error = RunError(
                    code = when (ex) {
                        is BadRequestException -> ex.code
                        is com.thetower.utils.ApiException -> ex.code
                        else -> ErrorCodes.INTERNAL_ERROR
                    },
                    message = ex.message ?: "执行失败"
                )
            )
            persistRun(failed)
            emit(
                runId,
                EventType.RUN_FAILED,
                buildJsonObject {
                    put(
                        "error",
                        buildJsonObject {
                            put("code", JsonPrimitive(failed.error?.code ?: ErrorCodes.INTERNAL_ERROR))
                            put("message", JsonPrimitive(wsSafeMessage(failed.error?.message ?: "执行失败")))
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
            requestId = runRequestIds[runId],
            seq = seq,
            ts = nowIso(),
            type = type,
            payload = payload
        )

        val ok = flow.tryEmit(event)
        if (!ok) {
            logger.warn { "event.emit.dropped runId=$runId seq=$seq type=${type.name} (tryEmit=false), fallback to emit" }
            scope.launch {
                runCatching {
                    flow.emit(event)
                }.onFailure { ex ->
                    logger.error(ex) { "event.emit.fallback.failed runId=$runId seq=$seq type=${type.name}" }
                }
            }
        } else {
            logger.debug { "event.emit.ok runId=$runId seq=$seq type=${type.name}" }
        }
    }

    private fun cleanupRuntime(runId: String) {
        runningJobs.remove(runId)
        eventFlows.remove(runId)
        seqCounters.remove(runId)
        runRequestIds.remove(runId)
    }

    private fun persistRun(run: Run): Run {
        val saved = runRepository.save(run)
        runByIdCache.put(saved.id, saved)
        runListCache.clear()
        logger.info { "cache.invalidate scope=runs runId=${saved.id}" }
        return saved
    }

    private fun invalidateRunCaches(runId: String) {
        runByIdCache.invalidate(runId)
        runListCache.clear()
        logger.info { "cache.invalidate scope=runs runId=$runId" }
    }
}
