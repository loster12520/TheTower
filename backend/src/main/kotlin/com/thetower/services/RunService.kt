package com.thetower.services

import com.thetower.executor.OpenedPlaywrightRunSession
import com.thetower.executor.PlaywrightRunSession
import com.thetower.executor.PlaywrightRunExecutor
import com.thetower.executor.StepExecutionResult
import com.thetower.models.EventType
import com.thetower.models.LastRun
import com.thetower.models.Run
import com.thetower.models.RunArtifact
import com.thetower.models.RunDebugOptions
import com.thetower.models.RunDebugContextSnapshot
import com.thetower.models.RunDebugSession
import com.thetower.models.RunError
import com.thetower.models.RunEvent
import com.thetower.models.RunStatus
import com.thetower.models.StepNode
import com.thetower.models.StartRunData
import com.thetower.models.DebugSessionStatus
import com.thetower.repository.RunRepository
import com.thetower.utils.ApiException
import com.thetower.utils.BadRequestException
import com.thetower.utils.ErrorCodes
import com.thetower.utils.RunNotFoundException
import com.thetower.utils.TtlCache
import com.thetower.utils.newId
import com.thetower.utils.nowIso
import io.ktor.http.HttpStatusCode
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

class RunService(
    private val runRepository: RunRepository,
    private val templateService: TemplateService,
    private val playwrightExecutor: PlaywrightRunExecutor
) {
    private companion object {
        const val MAX_CALL_WORKFLOW_DEPTH = 5
    }

    private val logger = KotlinLogging.logger {}
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val runningJobs = ConcurrentHashMap<String, Job>()
    private val eventFlows = ConcurrentHashMap<String, MutableSharedFlow<RunEvent>>()
    private val seqCounters = ConcurrentHashMap<String, AtomicLong>()
    private val runRequestIds = ConcurrentHashMap<String, String>()
    private val runDebugOptions = ConcurrentHashMap<String, RunDebugOptions>()
    private val runDebugSessions = ConcurrentHashMap<String, RunDebugSession>()
    private val debugExecutionGate = DebugExecutionGate()
    private val closedDebugRuns = ConcurrentHashMap.newKeySet<String>()
    private val debugPreviewLocks = ConcurrentHashMap<String, Any>()
    private val activeDebugSessions = ConcurrentHashMap<String, OpenedPlaywrightRunSession>()
    private val debugPreviewJobs = ConcurrentHashMap<String, Job>()
    private val runByIdCache = TtlCache<String, Run>(ttlMs = 10_000)
    private val runListCache = TtlCache<String, Pair<List<Run>, Int>>(ttlMs = 10_000)
    private val json = Json { ignoreUnknownKeys = true }

    private fun wsSafeMessage(message: String, limit: Int = 2_000): String {
        if (message.length <= limit) return message
        return message.take(limit) + "\n...(truncated, see GET /api/v1/runs/{id})"
    }

    fun startRun(templateId: String, dryRun: Boolean, requestId: String? = null, debug: RunDebugOptions? = null): StartRunData {
        val template = templateService.getTemplateById(templateId)
        if (template.steps.isEmpty() && !dryRun) {
            throw BadRequestException("steps 不能为空", mapOf("field" to "steps"))
        }

        val normalizedDebug = normalizeDebugOptions(debug)

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
        if (normalizedDebug != null) {
            runDebugOptions[runId] = normalizedDebug
            runDebugSessions[runId] = normalizedDebug.toSession(status = DebugSessionStatus.IDLE)
            debugExecutionGate.register(runId, normalizedDebug)
            closedDebugRuns.remove(runId)
        }

        val job = scope.launch {
            executeRun(runId, templateId, dryRun, normalizedDebug)
        }
        runningJobs[runId] = job

        return StartRunData(
            run = initialRun,
            wsUrl = "/ws/v1/runs/$runId",
            debug = runDebugSessions[runId]
        )
    }

    fun restartRun(runId: String): StartRunData {
        val run = getRunById(runId)
        val requestId = runRequestIds[runId]
        return startRun(run.templateId, dryRun = false, requestId = requestId, debug = runDebugOptions[runId])
    }

    fun getDebugSession(runId: String): RunDebugSession {
        getRunById(runId)
        return runDebugSessions[runId]
            ?: throw BadRequestException("运行 $runId 当前没有调试会话", mapOf("code" to ErrorCodes.DEBUG_SESSION_NOT_FOUND))
    }

    fun getDebugContext(runId: String): RunDebugContextSnapshot {
        val run = getRunById(runId)
        val session = runDebugSessions[runId]
            ?: throw BadRequestException("运行 $runId 当前没有调试会话", mapOf("code" to ErrorCodes.DEBUG_SESSION_NOT_FOUND))
        return session.latestContext ?: RunDebugContextSnapshot(
            stepId = session.currentStepId ?: run.currentStepId,
            stepPath = session.currentStepPath,
            pageAlias = session.pageAlias,
            contextId = session.contextId,
            variables = run.outputs,
            updatedAt = session.lastFrameTs ?: run.startedAt ?: nowIso()
        )
    }

    fun continueDebug(runId: String): RunDebugSession {
        getRunById(runId)
        val current = runDebugSessions[runId]
            ?: throw BadRequestException("运行 $runId 当前没有调试会话", mapOf("code" to ErrorCodes.DEBUG_SESSION_NOT_FOUND))
        if (!debugExecutionGate.isPaused(runId)) {
            throw BadRequestException("运行 $runId 当前不处于暂停态", mapOf("code" to ErrorCodes.DEBUG_CONTROL_INVALID))
        }
        val resume = debugExecutionGate.continueRun(runId)
        val updated = current.copy(
            status = DebugSessionStatus.STREAMING,
            currentStepId = resume.stepId ?: current.currentStepId,
            currentStepPath = resume.stepPath.ifEmpty { current.currentStepPath }
        )
        runDebugSessions[runId] = updated
        emit(
            runId,
            EventType.DEBUG_RESUMED,
            buildJsonObject {
                put("stepId", resume.stepId?.let(::JsonPrimitive) ?: JsonNull)
                put("stepPath", resume.stepPath.toJsonArray())
                put("action", JsonPrimitive(resume.action.name))
            }
        )
        emitDebugStatus(runId, DebugSessionStatus.STREAMING, "debug resumed", updated.pageAlias, updated.contextId, updated.lastError)
        return runDebugSessions[runId] ?: updated
    }

    fun stepDebug(runId: String): RunDebugSession {
        getRunById(runId)
        val current = runDebugSessions[runId]
            ?: throw BadRequestException("运行 $runId 当前没有调试会话", mapOf("code" to ErrorCodes.DEBUG_SESSION_NOT_FOUND))
        if (!debugExecutionGate.isPaused(runId)) {
            throw BadRequestException("运行 $runId 当前不处于暂停态", mapOf("code" to ErrorCodes.DEBUG_CONTROL_INVALID))
        }
        val resume = debugExecutionGate.stepRun(runId)
        val updated = current.copy(
            status = DebugSessionStatus.STREAMING,
            currentStepId = resume.stepId ?: current.currentStepId,
            currentStepPath = resume.stepPath.ifEmpty { current.currentStepPath }
        )
        runDebugSessions[runId] = updated
        emit(
            runId,
            EventType.DEBUG_STEPPED,
            buildJsonObject {
                put("stepId", resume.stepId?.let(::JsonPrimitive) ?: JsonNull)
                put("stepPath", resume.stepPath.toJsonArray())
                put("action", JsonPrimitive(resume.action.name))
            }
        )
        emitDebugStatus(runId, DebugSessionStatus.STREAMING, "debug stepped", updated.pageAlias, updated.contextId, updated.lastError)
        return runDebugSessions[runId] ?: updated
    }

    fun openDebugBrowser(runId: String): RunDebugSession {
        val run = getRunById(runId)
        val options = runDebugOptions[runId]
            ?: throw BadRequestException("运行 $runId 当前没有调试会话", mapOf("code" to ErrorCodes.DEBUG_SESSION_NOT_FOUND))

        if (!(options.openVisibleBrowser || options.openDevtools)) {
            throw ApiException(
                status = HttpStatusCode.Conflict,
                code = ErrorCodes.DEBUG_BROWSER_OPEN_ERROR,
                message = "当前调试运行未以可见浏览器模式启动，无法在运行中切换打开；请重新以调试运行启动"
            )
        }

        val session = activeDebugSessions[runId]
            ?: throw ApiException(
                status = HttpStatusCode.Conflict,
                code = ErrorCodes.DEBUG_BROWSER_OPEN_ERROR,
                message = if (run.status == RunStatus.RUNNING || run.status == RunStatus.PENDING) {
                    "调试浏览器尚未准备完成，请稍后重试"
                } else {
                    "运行已结束，无法再打开宿主机浏览器调试"
                }
            )

        closedDebugRuns.remove(runId)
        session.bringDebugBrowserToFront()
        ensureDebugPreviewLoop(runId, session, options)
        val current = runDebugSessions[runId] ?: options.toSession(status = DebugSessionStatus.STARTING)
        val nextStatus = if (current.status == DebugSessionStatus.CLOSED || current.status == DebugSessionStatus.IDLE) {
            DebugSessionStatus.STREAMING
        } else {
            current.status
        }
        val reopened = current.copy(
            status = nextStatus,
            pageAlias = session.currentPageAlias(),
            contextId = session.currentContextId()
        )
        runDebugSessions[runId] = reopened
        emitDebugStatus(runId, nextStatus, "host browser debug requested", reopened.pageAlias, reopened.contextId, reopened.lastError)
        emitDebugPreview(runId, session.session, options)
        return runDebugSessions[runId] ?: reopened
    }

    fun closeDebugChannel(runId: String): RunDebugSession {
        val run = getRunById(runId)
        val options = runDebugOptions[runId]
            ?: throw BadRequestException("运行 $runId 当前没有调试会话", mapOf("code" to ErrorCodes.DEBUG_SESSION_NOT_FOUND))
        val current = runDebugSessions[runId] ?: options.toSession(status = DebugSessionStatus.CLOSED)
        val lock = debugPreviewLocks.computeIfAbsent(runId) { Any() }
        synchronized(lock) {
            closedDebugRuns.add(runId)
            stopDebugPreviewLoop(runId)
            if (run.status != RunStatus.RUNNING && run.status != RunStatus.PENDING) {
                activeDebugSessions.remove(runId)?.closeQuietly()
            }
            val closed = current.copy(status = DebugSessionStatus.CLOSED)
            runDebugSessions[runId] = closed
            emit(
                runId,
                EventType.DEBUG_SESSION_CLOSED,
                buildJsonObject {
                    put("status", JsonPrimitive(DebugSessionStatus.CLOSED.name))
                    put("summary", JsonPrimitive("debug preview closed by user"))
                    put("pageAlias", closed.pageAlias?.let(::JsonPrimitive) ?: JsonNull)
                    put("contextId", closed.contextId?.let(::JsonPrimitive) ?: JsonNull)
                    put("lastFrameTs", closed.lastFrameTs?.let(::JsonPrimitive) ?: JsonNull)
                    put("error", closed.lastError?.let(::JsonPrimitive) ?: JsonNull)
                }
            )
            return closed
        }
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
        debugExecutionGate.cancel(runId)
        val canceled = run.copy(
            status = RunStatus.CANCELED,
            finishedAt = nowIso(),
            currentStepId = null
        )
        persistRun(canceled)
        closeDebugSession(runId, "run canceled")
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
        debugExecutionGate.unregister(runId)
        cleanupRuntime(runId)
        val deleted = runRepository.delete(runId)
        invalidateRunCaches(runId)
        return deleted
    }

    fun eventFlow(runId: String): SharedFlow<RunEvent>? = eventFlows[runId]

    private suspend fun executeRun(runId: String, templateId: String, dryRun: Boolean, debug: RunDebugOptions?) {
        var openedSession: OpenedPlaywrightRunSession? = null
        try {
            val runningRun = getRunById(runId).copy(status = RunStatus.RUNNING)
            persistRun(runningRun)
            emit(
                runId,
                EventType.RUN_STARTED,
                buildJsonObject {
                    put("templateId", JsonPrimitive(templateId))
                    put("debugEnabled", JsonPrimitive(debug?.enabled == true))
                }
            )

            if (debug?.enabled == true) {
                emitDebugSessionStarted(runId, debug)
                emitDebugStatus(runId, DebugSessionStatus.STARTING, "debug session created")
            }

            if (dryRun) {
                val succeeded = runningRun.copy(status = RunStatus.SUCCEEDED, finishedAt = nowIso())
                persistRun(succeeded)
                closeDebugSession(runId, "dry-run")
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
                openedSession = playwrightExecutor.openSession(runId, debug)
                val session = openedSession!!.session
                activeDebugSessions[runId] = openedSession!!
                val previewJob = if (debug?.enabled == true) {
                    ensureDebugPreviewLoop(runId, openedSession!!, debug)
                } else {
                    null
                }
                if (debug?.enabled == true) {
                    emitDebugStatus(
                        runId,
                        DebugSessionStatus.STREAMING,
                        "preview ready",
                        session.currentPageAlias(),
                        session.currentContextId()
                    )
                    emitDebugPreview(runId, session, debug)
                }
                try {
                    executeSteps(runId, template.steps, session, mutableMapOf(), mutableListOf(), emptyList(), loopDepth = 0, debug = debug)
                } finally {
                    previewJob?.cancel()
                    debugPreviewJobs.remove(runId)
                }
            }

            val finalRun = getRunById(runId)
            val succeeded = finalRun.copy(
                status = RunStatus.SUCCEEDED,
                currentStepId = null,
                finishedAt = nowIso(),
                error = null
            )
            persistRun(succeeded)
            emit(
                runId,
                EventType.RUN_SUCCEEDED,
                buildJsonObject {
                    put("summary", JsonPrimitive("ok"))
                    putOutputs(finalRun.outputs)
                    putArtifacts(finalRun.artifacts)
                }
            )
            templateService.updateLastRun(
                templateId,
                LastRun(runId = runId, status = RunStatus.SUCCEEDED.name, finishedAt = succeeded.finishedAt)
            )
            transitionDebugSessionAfterRun(runId, RunStatus.SUCCEEDED, "run finished")
            finalizeDebugResources(runId, openedSession)
        } catch (_: CancellationException) {
            val canceled = runRepository.findById(runId)?.copy(
                status = RunStatus.CANCELED,
                finishedAt = nowIso(),
                currentStepId = null
            )
            if (canceled != null) {
                persistRun(canceled)
            }
            transitionDebugSessionAfterRun(runId, RunStatus.CANCELED, "run canceled")
            finalizeDebugResources(runId, openedSession)
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
            emitDebugError(runId, ex.message ?: "调试运行失败")
            transitionDebugSessionAfterRun(runId, RunStatus.FAILED, "run failed", ex.message)
            finalizeDebugResources(runId, openedSession)
        } finally {
            runningJobs.remove(runId)
        }
    }

    private fun executeSteps(
        runId: String,
        steps: List<StepNode>,
        session: PlaywrightRunSession,
        outputs: MutableMap<String, String>,
        artifacts: MutableList<RunArtifact>,
        pathPrefix: List<String>,
        loopDepth: Int,
        debug: RunDebugOptions?
    ) {
        for (step in steps) {
            val current = getRunById(runId)
            if (current.status == RunStatus.CANCELED) {
                return
            }

            val stepPath = pathPrefix + step.id
            if (debug?.enabled == true) {
                maybePauseBeforeStep(runId, step, stepPath, outputs, session, debug)
            }
            persistRun(current.copy(currentStepId = step.id, status = RunStatus.RUNNING))
            emit(runId, EventType.STEP_STARTED, buildStepPayload(step, stepPath))
            if (debug?.enabled == true) {
                emitDebugStatus(runId, DebugSessionStatus.STREAMING, "step started", session.currentPageAlias(), session.currentContextId())
                emitDebugContext(runId, step.id, step.data.label, step.type, stepPath, outputs, session)
                emitDebugPreview(runId, session, debug)
            }
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
                val result = executeStepNode(runId, step, session, outputs, artifacts, stepPath, loopDepth, debug)
                outputs.putAll(result.first.outputs)
                artifacts.addAll(result.first.artifacts)
                persistStepProgress(runId, step.id, outputs, artifacts)
                emit(
                    runId,
                    EventType.STEP_SUCCEEDED,
                    buildJsonObject {
                        put("stepId", JsonPrimitive(step.id))
                        put("stepName", JsonPrimitive(step.data.label))
                        put("stepType", JsonPrimitive(step.type))
                        put("stepPath", stepPath.toJsonArray())
                        putParentPayload(stepPath)
                        putOutputs(result.first.outputs)
                        putArtifacts(result.first.artifacts)
                        put("pageAlias", result.first.pageAlias?.let(::JsonPrimitive) ?: JsonNull)
                        put("contextId", result.first.contextId?.let(::JsonPrimitive) ?: JsonNull)
                    }
                )
                if (debug?.enabled == true) {
                    emitDebugContext(runId, step.id, step.data.label, step.type, stepPath, outputs, session)
                    emitDebugStatus(
                        runId,
                        DebugSessionStatus.STREAMING,
                        "step succeeded",
                        result.first.pageAlias ?: session.currentPageAlias(),
                        result.first.contextId ?: session.currentContextId()
                    )
                    emitDebugPreview(runId, session, debug)
                }
                if (debug?.enabled == true) {
                    debugExecutionGate.onStepCompleted(runId, step.id)
                }
                if (result.second) {
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
                        put("stepName", JsonPrimitive(step.data.label))
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
                if (debug?.enabled == true) {
                    emitDebugError(runId, message, stepPath, step.id, session.currentPageAlias(), session.currentContextId())
                }
                throw ex
            }
        }
    }

    private fun executeStepNode(
        runId: String,
        step: StepNode,
        session: PlaywrightRunSession,
        outputs: MutableMap<String, String>,
        artifacts: MutableList<RunArtifact>,
        stepPath: List<String>,
        loopDepth: Int,
        debug: RunDebugOptions?
    ): Pair<StepExecutionResult, Boolean> {
        return when (step.type) {
            "if" -> {
                val branch = if (evaluateCondition(step.data.config, outputs)) "then" else "else"
                emitControlFlowLog(runId, stepPath, "IF 命中分支: $branch")
                executeSteps(runId, getBranchSteps(step.data.config, branch), session, outputs, artifacts, stepPath + branch, loopDepth, debug)
                StepExecutionResult(contextId = session.currentContextId()) to false
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
                        executeSteps(runId, getRequiredBranchSteps(step, "body"), session, outputs, artifacts, stepPath + "body", loopDepth + 1, debug)
                    } catch (_: LoopBreakSignal) {
                        break
                    }
                }
                StepExecutionResult(contextId = session.currentContextId()) to false
            }

            "while" -> {
                val maxIterations = resolveIntConfig(step.data.config, "maxIterations", outputs)
                var iteration = 0
                while (iteration < maxIterations && evaluateCondition(step.data.config, outputs)) {
                    emitControlFlowLog(runId, stepPath, "While 第 ${iteration + 1}/$maxIterations 次执行")
                    try {
                        executeSteps(runId, getRequiredBranchSteps(step, "body"), session, outputs, artifacts, stepPath + "body", loopDepth + 1, debug)
                    } catch (_: LoopBreakSignal) {
                        break
                    }
                    iteration++
                }
                StepExecutionResult(contextId = session.currentContextId()) to false
            }

            "forEachElement" -> {
                val itemVar = resolveRequiredText(step.data.config, "itemVar", outputs)
                val indexVar = resolveOptionalText(step.data.config, "indexVar", outputs)
                val items = session.collectForEachElement(step.data.config, outputs)
                for ((index, item) in items.withIndex()) {
                    outputs[itemVar] = item
                    if (!indexVar.isNullOrBlank()) {
                        outputs[indexVar] = index.toString()
                    }
                    emitControlFlowLog(runId, stepPath, "ForEachElement 第 ${index + 1}/${items.size} 次执行")
                    try {
                        executeSteps(runId, getRequiredBranchSteps(step, "body"), session, outputs, artifacts, stepPath + "body", loopDepth + 1, debug)
                    } catch (_: LoopBreakSignal) {
                        break
                    }
                }
                StepExecutionResult(contextId = session.currentContextId()) to false
            }

            "forEachData" -> {
                val dataVar = resolveRequiredText(step.data.config, "dataVar", outputs)
                val itemVar = resolveRequiredText(step.data.config, "itemVar", outputs)
                val indexVar = resolveOptionalText(step.data.config, "indexVar", outputs)
                val items = resolveLoopData(outputs[dataVar])
                for ((index, item) in items.withIndex()) {
                    outputs[itemVar] = item
                    if (!indexVar.isNullOrBlank()) {
                        outputs[indexVar] = index.toString()
                    }
                    emitControlFlowLog(runId, stepPath, "ForEachData 第 ${index + 1}/${items.size} 次执行")
                    try {
                        executeSteps(runId, getRequiredBranchSteps(step, "body"), session, outputs, artifacts, stepPath + "body", loopDepth + 1, debug)
                    } catch (_: LoopBreakSignal) {
                        break
                    }
                }
                StepExecutionResult(contextId = session.currentContextId()) to false
            }

            "callWorkflow" -> {
                if (workflowCallDepth(stepPath) >= MAX_CALL_WORKFLOW_DEPTH) {
                    throw BadRequestException(
                        "callWorkflow 嵌套层数超过限制: $MAX_CALL_WORKFLOW_DEPTH",
                        mapOf("code" to ErrorCodes.WORKFLOW_REFERENCE_INVALID, "field" to "workflowId")
                    )
                }
                val workflowId = resolveRequiredText(step.data.config, "workflowId", outputs)
                val targetTemplate = templateService.getTemplateById(workflowId)
                val childOutputs = outputs.toMutableMap()
                applyWorkflowInputMapping(step.data.config, outputs, childOutputs)
                emitControlFlowLog(runId, stepPath, "CallWorkflow 调用模板: ${targetTemplate.name}")
                executeSteps(
                    runId,
                    targetTemplate.steps,
                    session,
                    childOutputs,
                    artifacts,
                    stepPath + "callWorkflow",
                    loopDepth,
                    debug
                )
                val outputVar = resolveOptionalText(step.data.config, "outputVar", outputs)
                    ?: resolveOptionalText(step.data.config, "saveAs", outputs)
                val childDelta = buildWorkflowOutputDelta(outputs, childOutputs)
                val outputMap = if (!outputVar.isNullOrBlank()) {
                    mapOf(
                        outputVar to serializeWorkflowOutput(childDelta)
                    )
                } else {
                    emptyMap()
                }
                StepExecutionResult(outputs = outputMap, contextId = session.currentContextId()) to false
            }

            "startBrowser" -> {
                val onError = (resolveOptionalText(step.data.config, "onError", outputs) ?: "abort").lowercase()
                val onComplete = (resolveOptionalText(step.data.config, "onComplete", outputs) ?: "close").lowercase()
                val contextId = session.pushBrowserContext()
                try {
                    executeSteps(runId, getRequiredBranchSteps(step, "body"), session, outputs, artifacts, stepPath + "body", loopDepth + 1, debug)
                } catch (ex: LoopBreakSignal) {
                    throw ex
                } catch (ex: Exception) {
                    if (onError == "skip") {
                        emitControlFlowLog(runId, stepPath, "StartBrowser 已跳过错误: ${ex.message}")
                    } else {
                        throw ex
                    }
                } finally {
                    session.restorePreviousContext(closeCurrent = onComplete != "keep")
                }
                StepExecutionResult(contextId = contextId) to false
            }

            "break" -> StepExecutionResult(contextId = session.currentContextId()) to true

            else -> session.executeStep(step, outputs) to false
        }
    }

    private fun buildStepPayload(step: StepNode, stepPath: List<String>) = buildJsonObject {
        put("stepId", JsonPrimitive(step.id))
        put("stepName", JsonPrimitive(step.data.label))
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

    private fun persistStepProgress(
        runId: String,
        currentStepId: String,
        outputs: Map<String, String>,
        artifacts: List<RunArtifact>
    ) {
        val current = getRunById(runId)
        persistRun(
            current.copy(
                currentStepId = currentStepId,
                outputs = outputs.toMap(),
                artifacts = artifacts.toList()
            )
        )
    }

    private fun resolveLoopData(raw: String?): List<String> {
        if (raw.isNullOrBlank()) return emptyList()
        val parsed = runCatching { json.parseToJsonElement(raw) }.getOrNull()
        if (parsed != null) {
            return when {
                parsed is JsonArray -> parsed.map { element ->
                    if (element is JsonPrimitive && element.isString) element.content else element.toString()
                }

                parsed is kotlinx.serialization.json.JsonObject -> parsed.entries.map { (key, value) ->
                    buildJsonObject {
                        put("key", JsonPrimitive(key))
                        put("value", value)
                    }.toString()
                }

                parsed is JsonPrimitive && parsed.isString -> listOf(parsed.content)
                else -> listOf(parsed.toString())
            }
        }
        return raw.lines().map { it.trim() }.filter { it.isNotEmpty() }
    }

    private fun kotlinx.serialization.json.JsonObjectBuilder.putOutputs(outputs: Map<String, String>) {
        put(
            "outputs",
            buildJsonObject {
                outputs.forEach { (key, value) ->
                    put(key, JsonPrimitive(value))
                }
            }
        )
    }

    private fun kotlinx.serialization.json.JsonObjectBuilder.putArtifacts(artifacts: List<RunArtifact>) {
        put(
            "artifacts",
            buildJsonArray {
                artifacts.forEach { artifact ->
                    add(
                        buildJsonObject {
                            put("artifactId", JsonPrimitive(artifact.artifactId))
                            put("name", JsonPrimitive(artifact.name))
                            put("kind", JsonPrimitive(artifact.kind))
                            put("relativePath", JsonPrimitive(artifact.relativePath))
                            put("createdAt", JsonPrimitive(artifact.createdAt))
                        }
                    )
                }
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
        stopDebugPreviewLoop(runId)
        debugExecutionGate.unregister(runId)
        activeDebugSessions.remove(runId)
        debugPreviewLocks.remove(runId)
        eventFlows.remove(runId)
        seqCounters.remove(runId)
        runRequestIds.remove(runId)
        runDebugOptions.remove(runId)
        runDebugSessions.remove(runId)
        closedDebugRuns.remove(runId)
    }

    private fun normalizeDebugOptions(debug: RunDebugOptions?): RunDebugOptions? {
        if (debug?.enabled != true) return null
        if (debug.previewFps !in 1..4) {
            throw BadRequestException("previewFps 必须在 1 到 4 之间", mapOf("code" to ErrorCodes.DEBUG_OPTIONS_INVALID, "field" to "debug.previewFps"))
        }
        if (debug.previewQuality !in 20..90) {
            throw BadRequestException("previewQuality 必须在 20 到 90 之间", mapOf("code" to ErrorCodes.DEBUG_OPTIONS_INVALID, "field" to "debug.previewQuality"))
        }
        return debug
    }

    private fun ensureDebugPreviewLoop(runId: String, session: OpenedPlaywrightRunSession, debug: RunDebugOptions): Job {
        debugPreviewJobs[runId]?.let { existing ->
            if (existing.isActive) {
                return existing
            }
        }

        val frameIntervalMs = (1_000L / debug.previewFps.coerceAtLeast(1)).coerceAtLeast(250L)
        val job = scope.launch(Dispatchers.IO) {
            while (isActive && activeDebugSessions[runId] === session) {
                if (!closedDebugRuns.contains(runId)) {
                    emitDebugPreview(runId, session.session, debug)
                }
                delay(frameIntervalMs)
            }
        }
        debugPreviewJobs[runId] = job
        return job
    }

    private fun stopDebugPreviewLoop(runId: String) {
        val job = debugPreviewJobs.remove(runId) ?: return
        runBlocking {
            job.cancelAndJoin()
        }
    }

    private fun RunDebugOptions.toSession(
        status: DebugSessionStatus,
        pageAlias: String? = null,
        contextId: String? = null,
        lastFrameTs: String? = null,
        lastError: String? = null,
        currentStepId: String? = null,
        currentStepName: String? = null,
        currentStepPath: List<String> = emptyList(),
        latestContext: RunDebugContextSnapshot? = null
    ): RunDebugSession {
        return RunDebugSession(
            enabled = enabled,
            openVisibleBrowser = openVisibleBrowser,
            openDevtools = openDevtools,
            previewFps = previewFps,
            previewQuality = previewQuality,
            pauseOnStart = pauseOnStart,
            breakpoints = breakpoints,
            keepBrowserOnFinish = keepBrowserOnFinish,
            status = status,
            currentStepId = currentStepId,
            currentStepName = currentStepName,
            currentStepPath = currentStepPath,
            pageAlias = pageAlias,
            contextId = contextId,
            lastFrameTs = lastFrameTs,
            lastError = lastError,
            latestContext = latestContext
        )
    }

    private fun emitDebugSessionStarted(runId: String, debug: RunDebugOptions) {
        runDebugSessions[runId] = debug.toSession(status = DebugSessionStatus.STARTING)
        emit(
            runId,
            EventType.DEBUG_SESSION_STARTED,
            buildJsonObject {
                put("enabled", JsonPrimitive(true))
                put("status", JsonPrimitive(DebugSessionStatus.STARTING.name))
                put("openVisibleBrowser", JsonPrimitive(debug.openVisibleBrowser))
                put("openDevtools", JsonPrimitive(debug.openDevtools))
                put("previewFps", JsonPrimitive(debug.previewFps))
                put("previewQuality", JsonPrimitive(debug.previewQuality))
                put("pauseOnStart", JsonPrimitive(debug.pauseOnStart))
                put("keepBrowserOnFinish", JsonPrimitive(debug.keepBrowserOnFinish))
                put("breakpoints", buildJsonArray {
                    debug.breakpoints.forEach { add(JsonPrimitive(it)) }
                })
            }
        )
    }

    private fun emitDebugStatus(
        runId: String,
        status: DebugSessionStatus,
        message: String,
        pageAlias: String? = null,
        contextId: String? = null,
        lastError: String? = null
    ) {
        val options = runDebugOptions[runId] ?: return
        val now = nowIso()
        val current = runDebugSessions[runId]
        val session = options.toSession(
            status = status,
            pageAlias = pageAlias,
            contextId = contextId,
            lastFrameTs = current?.lastFrameTs,
            lastError = lastError,
            currentStepId = current?.currentStepId,
            currentStepName = current?.currentStepName,
            currentStepPath = current?.currentStepPath ?: emptyList(),
            latestContext = current?.latestContext
        )
        runDebugSessions[runId] = session
        emit(
            runId,
            EventType.DEBUG_STATUS_CHANGED,
            buildJsonObject {
                put("status", JsonPrimitive(status.name))
                put("message", JsonPrimitive(message))
                put("pageAlias", pageAlias?.let(::JsonPrimitive) ?: JsonNull)
                put("contextId", contextId?.let(::JsonPrimitive) ?: JsonNull)
                put("currentStepId", session.currentStepId?.let(::JsonPrimitive) ?: JsonNull)
                put("currentStepName", session.currentStepName?.let(::JsonPrimitive) ?: JsonNull)
                put("ts", JsonPrimitive(now))
            }
        )
    }

    private fun emitDebugPreview(runId: String, session: PlaywrightRunSession, debug: RunDebugOptions) {
        val lock = debugPreviewLocks.computeIfAbsent(runId) { Any() }
        synchronized(lock) {
            if (closedDebugRuns.contains(runId)) return
            val frame = session.capturePreviewFrame(debug.previewQuality) ?: return
            val now = nowIso()
            val current = runDebugSessions[runId]
            runDebugSessions[runId] = debug.toSession(
                status = DebugSessionStatus.STREAMING,
                pageAlias = frame.pageAlias,
                contextId = frame.contextId,
                lastFrameTs = now,
                lastError = current?.lastError,
                currentStepId = current?.currentStepId,
                currentStepName = current?.currentStepName,
                currentStepPath = current?.currentStepPath ?: emptyList(),
                latestContext = current?.latestContext
            )
            emit(
                runId,
                EventType.DEBUG_FRAME,
                buildJsonObject {
                    put("mimeType", JsonPrimitive(frame.mimeType))
                    put("frameBase64", JsonPrimitive(frame.frameBase64))
                    put("width", JsonPrimitive(frame.width))
                    put("height", JsonPrimitive(frame.height))
                    put("pageAlias", frame.pageAlias?.let(::JsonPrimitive) ?: JsonNull)
                    put("contextId", JsonPrimitive(frame.contextId))
                    put("ts", JsonPrimitive(now))
                }
            )
        }
    }

    private fun emitDebugError(
        runId: String,
        message: String,
        stepPath: List<String>? = null,
        stepId: String? = null,
        pageAlias: String? = null,
        contextId: String? = null
    ) {
        val options = runDebugOptions[runId] ?: return
        val current = runDebugSessions[runId]
        runDebugSessions[runId] = options.toSession(
            status = DebugSessionStatus.ERROR,
            pageAlias = pageAlias,
            contextId = contextId,
            lastFrameTs = current?.lastFrameTs,
            lastError = message,
            currentStepId = current?.currentStepId,
            currentStepName = current?.currentStepName,
            currentStepPath = current?.currentStepPath ?: emptyList(),
            latestContext = current?.latestContext
        )
        emit(
            runId,
            EventType.DEBUG_ERROR,
            buildJsonObject {
                put("message", JsonPrimitive(message))
                put("stepId", stepId?.let(::JsonPrimitive) ?: JsonNull)
                put("pageAlias", pageAlias?.let(::JsonPrimitive) ?: JsonNull)
                put("contextId", contextId?.let(::JsonPrimitive) ?: JsonNull)
                put("stepPath", stepPath?.toJsonArray() ?: buildJsonArray { })
            }
        )
    }

    private fun closeDebugSession(runId: String, summary: String, errorMessage: String? = null) {
        val options = runDebugOptions[runId] ?: return
        val current = runDebugSessions[runId]
        activeDebugSessions.remove(runId)?.closeQuietly()
        runDebugSessions[runId] = options.toSession(
            status = if (errorMessage == null) DebugSessionStatus.CLOSED else DebugSessionStatus.ERROR,
            pageAlias = current?.pageAlias,
            contextId = current?.contextId,
            lastFrameTs = current?.lastFrameTs,
            lastError = errorMessage,
            currentStepId = current?.currentStepId,
            currentStepName = current?.currentStepName,
            currentStepPath = current?.currentStepPath ?: emptyList(),
            latestContext = current?.latestContext
        )
        emit(
            runId,
            EventType.DEBUG_SESSION_CLOSED,
            buildJsonObject {
                put("status", JsonPrimitive(runDebugSessions[runId]?.status?.name ?: DebugSessionStatus.CLOSED.name))
                put("summary", JsonPrimitive(summary))
                put("pageAlias", current?.pageAlias?.let(::JsonPrimitive) ?: JsonNull)
                put("contextId", current?.contextId?.let(::JsonPrimitive) ?: JsonNull)
                put("lastFrameTs", current?.lastFrameTs?.let(::JsonPrimitive) ?: JsonNull)
                put("error", errorMessage?.let(::JsonPrimitive) ?: JsonNull)
            }
        )
    }

    private fun emitDebugContext(
        runId: String,
        stepId: String,
        stepName: String,
        stepType: String,
        stepPath: List<String>,
        outputs: Map<String, String>,
        session: PlaywrightRunSession
    ) {
        val options = runDebugOptions[runId] ?: return
        val snapshot = RunDebugContextSnapshot(
            stepId = stepId,
            stepName = stepName,
            stepType = stepType,
            stepPath = stepPath,
            pageAlias = session.currentPageAlias(),
            contextId = session.currentContextId(),
            variables = outputs.toMap(),
            updatedAt = nowIso()
        )
        val current = runDebugSessions[runId]
        runDebugSessions[runId] = options.toSession(
            status = current?.status ?: DebugSessionStatus.STREAMING,
            pageAlias = snapshot.pageAlias,
            contextId = snapshot.contextId,
            lastFrameTs = current?.lastFrameTs,
            lastError = current?.lastError,
            currentStepId = stepId,
            currentStepName = stepName,
            currentStepPath = stepPath,
            latestContext = snapshot
        )
        emit(
            runId,
            EventType.DEBUG_CONTEXT_UPDATED,
            buildJsonObject {
                put("stepId", stepId.let(::JsonPrimitive))
                put("stepName", JsonPrimitive(stepName))
                put("stepType", JsonPrimitive(stepType))
                put("stepPath", stepPath.toJsonArray())
                put("pageAlias", snapshot.pageAlias?.let(::JsonPrimitive) ?: JsonNull)
                put("contextId", snapshot.contextId?.let(::JsonPrimitive) ?: JsonNull)
                put("variables", buildJsonObject {
                    snapshot.variables.forEach { (key, value) ->
                        put(key, JsonPrimitive(value))
                    }
                })
                put("ts", JsonPrimitive(snapshot.updatedAt))
            }
        )
    }

    private fun maybePauseBeforeStep(
        runId: String,
        step: StepNode,
        stepPath: List<String>,
        outputs: Map<String, String>,
        session: PlaywrightRunSession,
        debug: RunDebugOptions
    ) {
        val pauseReason = debugExecutionGate.preparePause(runId, step.id, stepPath) ?: return
        val reasonText = when (pauseReason.reasonType) {
            DebugPauseReasonType.PAUSE_ON_START -> "pause on start"
            DebugPauseReasonType.BREAKPOINT -> "breakpoint hit"
            DebugPauseReasonType.STEP_COMPLETE -> "step completed, paused again"
        }
        emitDebugContext(runId, step.id, step.data.label, step.type, stepPath, outputs, session)
        val current = runDebugSessions[runId]
        runDebugSessions[runId] = (current ?: debug.toSession(status = DebugSessionStatus.PAUSED)).copy(
            status = DebugSessionStatus.PAUSED,
            currentStepId = step.id,
            currentStepName = step.data.label,
            currentStepPath = stepPath,
            pageAlias = session.currentPageAlias(),
            contextId = session.currentContextId()
        )
        emit(
            runId,
            EventType.DEBUG_BREAKPOINT_HIT,
            buildJsonObject {
                put("stepId", JsonPrimitive(step.id))
                put("stepName", JsonPrimitive(step.data.label))
                put("stepType", JsonPrimitive(step.type))
                put("stepPath", stepPath.toJsonArray())
                put("reason", JsonPrimitive(reasonText))
                put("reasonType", JsonPrimitive(pauseReason.reasonType.name))
                put("pageAlias", session.currentPageAlias()?.let(::JsonPrimitive) ?: JsonNull)
                put("contextId", JsonPrimitive(session.currentContextId()))
                putParentPayload(stepPath)
            }
        )
        emitDebugStatus(runId, DebugSessionStatus.PAUSED, reasonText, session.currentPageAlias(), session.currentContextId(), current?.lastError)
        emitDebugPreview(runId, session, debug)
        debugExecutionGate.awaitResume(runId)
    }

    private fun transitionDebugSessionAfterRun(
        runId: String,
        runStatus: RunStatus,
        summary: String,
        errorMessage: String? = null
    ) {
        val options = runDebugOptions[runId] ?: return
        val current = runDebugSessions[runId]
        val shouldRetain = options.keepBrowserOnFinish && (runStatus == RunStatus.SUCCEEDED || runStatus == RunStatus.FAILED)
        if (!shouldRetain) {
            closeDebugSession(runId, summary, errorMessage)
            return
        }

        val nextStatus = if (runStatus == RunStatus.SUCCEEDED) {
            DebugSessionStatus.COMPLETED_WAITING_CLOSE
        } else {
            DebugSessionStatus.FAILED_WAITING_CLOSE
        }
        runDebugSessions[runId] = options.toSession(
            status = nextStatus,
            pageAlias = current?.pageAlias,
            contextId = current?.contextId,
            lastFrameTs = current?.lastFrameTs,
            lastError = errorMessage,
            currentStepId = current?.currentStepId,
            currentStepName = current?.currentStepName,
            currentStepPath = current?.currentStepPath ?: emptyList(),
            latestContext = current?.latestContext
        )
        emitDebugStatus(runId, nextStatus, summary, current?.pageAlias, current?.contextId, errorMessage)
    }

    private fun finalizeDebugResources(runId: String, openedSession: OpenedPlaywrightRunSession?) {
        val run = runRepository.findById(runId)
        val keepSession = openedSession != null && runDebugOptions[runId]?.keepBrowserOnFinish == true &&
            (run?.status == RunStatus.SUCCEEDED || run?.status == RunStatus.FAILED)
        if (keepSession) {
            activeDebugSessions[runId] = openedSession!!
            return
        }

        activeDebugSessions.remove(runId)?.closeQuietly()
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
