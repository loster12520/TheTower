package com.thetower.services

import com.thetower.models.RunDebugOptions
import java.util.concurrent.ConcurrentHashMap

internal enum class DebugPauseReasonType {
    PAUSE_ON_START,
    BREAKPOINT,
    STEP_COMPLETE
}

internal enum class DebugResumeAction {
    CONTINUE,
    STEP
}

internal data class DebugPauseReason(
    val stepId: String,
    val stepPath: List<String>,
    val reasonType: DebugPauseReasonType
)

internal data class DebugResumeSnapshot(
    val stepId: String?,
    val stepPath: List<String>,
    val action: DebugResumeAction
)

internal class DebugExecutionGate {
    private data class DebugControl(
        val lock: Object = Object(),
        val breakpoints: MutableSet<String>,
        var pauseOnStartPending: Boolean,
        var paused: Boolean = false,
        var pauseAfterCurrentStep: Boolean = false,
        var skipBreakpointStepId: String? = null,
        var latestStepId: String? = null,
        var latestStepPath: List<String> = emptyList(),
        var lastResumeAction: DebugResumeAction? = null
    )

    private val controls = ConcurrentHashMap<String, DebugControl>()

    fun register(runId: String, debug: RunDebugOptions) {
        controls[runId] = DebugControl(
            breakpoints = debug.breakpoints.toMutableSet(),
            pauseOnStartPending = debug.pauseOnStart
        )
    }

    fun unregister(runId: String) {
        controls.remove(runId)?.let { control ->
            synchronized(control.lock) {
                control.paused = false
                control.lock.notifyAll()
            }
        }
    }

    fun cancel(runId: String) {
        controls[runId]?.let { control ->
            synchronized(control.lock) {
                control.paused = false
                control.lock.notifyAll()
            }
        }
    }

    fun isPaused(runId: String): Boolean = controls[runId]?.paused == true

    fun currentStepId(runId: String): String? = controls[runId]?.latestStepId

    fun currentStepPath(runId: String): List<String> = controls[runId]?.latestStepPath ?: emptyList()

    fun preparePause(runId: String, stepId: String, stepPath: List<String>): DebugPauseReason? {
        val control = controls[runId] ?: return null
        synchronized(control.lock) {
            control.latestStepId = stepId
            control.latestStepPath = stepPath
            val reasonType = when {
                control.pauseOnStartPending -> DebugPauseReasonType.PAUSE_ON_START
                control.pauseAfterCurrentStep -> DebugPauseReasonType.STEP_COMPLETE
                stepId in control.breakpoints && control.skipBreakpointStepId != stepId -> DebugPauseReasonType.BREAKPOINT
                else -> null
            } ?: return null

            control.pauseOnStartPending = false
            control.pauseAfterCurrentStep = false
            control.paused = true
            control.lastResumeAction = null
            return DebugPauseReason(stepId = stepId, stepPath = stepPath, reasonType = reasonType)
        }
    }

    fun awaitResume(runId: String) {
        val control = controls[runId] ?: return
        synchronized(control.lock) {
            while (control.paused) {
                control.lock.wait(250L)
            }
        }
    }

    fun continueRun(runId: String): DebugResumeSnapshot {
        val control = controls[runId] ?: return DebugResumeSnapshot(null, emptyList(), DebugResumeAction.CONTINUE)
        synchronized(control.lock) {
            val snapshot = DebugResumeSnapshot(control.latestStepId, control.latestStepPath, DebugResumeAction.CONTINUE)
            control.paused = false
            control.pauseAfterCurrentStep = false
            control.skipBreakpointStepId = control.latestStepId
            control.lastResumeAction = DebugResumeAction.CONTINUE
            control.lock.notifyAll()
            return snapshot
        }
    }

    fun stepRun(runId: String): DebugResumeSnapshot {
        val control = controls[runId] ?: return DebugResumeSnapshot(null, emptyList(), DebugResumeAction.STEP)
        synchronized(control.lock) {
            val snapshot = DebugResumeSnapshot(control.latestStepId, control.latestStepPath, DebugResumeAction.STEP)
            control.paused = false
            control.pauseAfterCurrentStep = true
            control.skipBreakpointStepId = control.latestStepId
            control.lastResumeAction = DebugResumeAction.STEP
            control.lock.notifyAll()
            return snapshot
        }
    }

    fun onStepCompleted(runId: String, stepId: String) {
        val control = controls[runId] ?: return
        synchronized(control.lock) {
            if (control.skipBreakpointStepId == stepId) {
                control.skipBreakpointStepId = null
            }
        }
    }
}