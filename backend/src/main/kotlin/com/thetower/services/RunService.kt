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
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import com.microsoft.playwright.Page
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
            validateStepTree(template.steps)

            withContext(Dispatchers.IO) {
                playwrightExecutor.withPage { page ->
                    executeSteps(runId, template.steps, page, mutableMapOf(), emptyList(), loopDepth = 0)
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

    private fun executeSteps(
        runId: String,
        steps: List<com.thetower.models.StepNode>,
        page: Page,
        outputs: MutableMap<String, String>,
        pathPrefix: List<String>,
        loopDepth: Int
    ) {
        for (step in steps) {
            val current = getRunById(runId)
            if (current.status == RunStatus.CANCELED) {
                return
            }

            val stepPath = pathPrefix + step.id
            persistRun(current.copy(currentStepId = step.id, status = RunStatus.RUNNING))
            emit(runId, EventType.STEP_STARTED, buildStepPayload(step, stepPath))
            emit(
                runId,
                EventType.LOG,
                buildJsonObject {
                    put("level", JsonPrimitive("INFO"))
                    put("message", JsonPrimitive("执行步骤 ${step.data.label}"))
                    put("stepPath", stepPath.toJsonArray())
                }
            )

            try {
                val stepOutputs = executeStepNode(runId, step, page, outputs, stepPath, loopDepth)
                outputs.putAll(stepOutputs.first)
                emit(
                    runId,
                    EventType.STEP_SUCCEEDED,
                    buildJsonObject {
                        put("stepId", JsonPrimitive(step.id))
                        put("stepType", JsonPrimitive(step.type))
                        put("stepPath", stepPath.toJsonArray())
                        putParentPayload(stepPath)
                        put(
                            "outputs",
                            buildJsonObject {
                                stepOutputs.first.forEach { (key, value) ->
                                    put(key, JsonPrimitive(value))
                                }
                            }
                        )
                    }
                )
                if (stepOutputs.second) {
                    throw LoopBreakSignal()
                }
            } catch (ex: LoopBreakSignal) {
                throw ex
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
                        put("stepPath", stepPath.toJsonArray())
                        putParentPayload(stepPath)
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

    private fun executeStepNode(
        runId: String,
        step: com.thetower.models.StepNode,
        page: Page,
        outputs: MutableMap<String, String>,
        stepPath: List<String>,
        loopDepth: Int
    ): Pair<Map<String, String>, Boolean> {
        return when (step.type) {
            "if" -> {
                val branch = if (evaluateCondition(step.data.config, outputs)) "then" else "else"
                emitControlFlowLog(runId, stepPath, "IF 命中分支: $branch")
                executeSteps(runId, getBranchSteps(step.data.config, branch), page, outputs, stepPath + branch, loopDepth)
                emptyMap<String, String>() to false
            }

            "forTimes" -> {
                val times = resolveIntConfig(step.data.config, "times", outputs)
                val indexVar = resolveOptionalText(step.data.config, "indexVar", outputs)
                for (index in 0 until times) {
                    if (!indexVar.isNullOrBlank()) {
                        outputs[indexVar] = index.toString()
                    }
                    emitControlFlowLog(runId, stepPath, "ForTimes 第 ${index + 1}/$times 次执行")
                    try {
                        executeSteps(runId, getRequiredBranchSteps(step, "body"), page, outputs, stepPath + "body", loopDepth + 1)
                    } catch (_: LoopBreakSignal) {
                        break
                    }
                }
                emptyMap<String, String>() to false
            }

            "while" -> {
                val maxIterations = resolveIntConfig(step.data.config, "maxIterations", outputs)
                var iteration = 0
                while (iteration < maxIterations && evaluateCondition(step.data.config, outputs)) {
                    emitControlFlowLog(runId, stepPath, "While 第 ${iteration + 1}/$maxIterations 次执行")
                    try {
                        executeSteps(runId, getRequiredBranchSteps(step, "body"), page, outputs, stepPath + "body", loopDepth + 1)
                    } catch (_: LoopBreakSignal) {
                        break
                    }
                    iteration++
                }
                emptyMap<String, String>() to false
            }

            "break" -> emptyMap<String, String>() to true

            else -> playwrightExecutor.executeStep(page, step) to false
        }
    }

    private fun buildStepPayload(step: com.thetower.models.StepNode, stepPath: List<String>) = buildJsonObject {
        put("stepId", JsonPrimitive(step.id))
        put("stepType", JsonPrimitive(step.type))
        put("stepPath", stepPath.toJsonArray())
        putParentPayload(stepPath)
    }

    private fun kotlinx.serialization.json.JsonObjectBuilder.putParentPayload(stepPath: List<String>) {
        val parentStepId = stepPath.getOrNull(stepPath.lastIndex - 2)
        val branch = stepPath.getOrNull(stepPath.lastIndex - 1)?.takeIf { it == "then" || it == "else" || it == "body" }
        put("parentStepId", parentStepId?.let(::JsonPrimitive) ?: JsonNull)
        put("branch", branch?.let(::JsonPrimitive) ?: JsonNull)
    }

    private fun List<String>.toJsonArray(): JsonArray = buildJsonArray {
        this@toJsonArray.forEach { add(JsonPrimitive(it)) }
    }

    private fun emitControlFlowLog(runId: String, stepPath: List<String>, message: String) {
        emit(
            runId,
            EventType.LOG,
            buildJsonObject {
                put("level", JsonPrimitive("INFO"))
                put("message", JsonPrimitive(message))
                put("stepPath", stepPath.toJsonArray())
            }
        )
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
