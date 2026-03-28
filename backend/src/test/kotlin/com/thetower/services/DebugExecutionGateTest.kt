package com.thetower.services

import com.thetower.models.RunDebugOptions
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class DebugExecutionGateTest {
    @Test
    fun `pauseOnStart blocks until continue`() {
        val gate = DebugExecutionGate()
        gate.register("run-1", RunDebugOptions(enabled = true, pauseOnStart = true))

        val pause = gate.preparePause("run-1", "step-1", listOf("step-1"))
        assertNotNull(pause)
        assertEquals(DebugPauseReasonType.PAUSE_ON_START, pause.reasonType)
        assertTrue(gate.isPaused("run-1"))

        val resumed = CountDownLatch(1)
        val worker = thread(start = true) {
            gate.awaitResume("run-1")
            resumed.countDown()
        }

        Thread.sleep(100)
        assertEquals(1L, resumed.count)

        gate.continueRun("run-1")
        assertTrue(resumed.await(2, TimeUnit.SECONDS))
        worker.join(2_000)
        assertFalse(gate.isPaused("run-1"))
    }

    @Test
    fun `stepRun pauses again before next step`() {
        val gate = DebugExecutionGate()
        gate.register("run-2", RunDebugOptions(enabled = true, breakpoints = listOf("step-1")))

        val firstPause = gate.preparePause("run-2", "step-1", listOf("step-1"))
        assertNotNull(firstPause)
        assertEquals(DebugPauseReasonType.BREAKPOINT, firstPause.reasonType)

        val stepped = gate.stepRun("run-2")
        assertEquals(DebugResumeAction.STEP, stepped.action)
        gate.onStepCompleted("run-2", "step-1")

        val nextPause = gate.preparePause("run-2", "step-2", listOf("step-2"))
        assertNotNull(nextPause)
        assertEquals(DebugPauseReasonType.STEP_COMPLETE, nextPause.reasonType)
    }

    @Test
    fun `continueRun skips immediate rehit on same breakpoint step`() {
        val gate = DebugExecutionGate()
        gate.register("run-3", RunDebugOptions(enabled = true, breakpoints = listOf("step-1")))

        assertNotNull(gate.preparePause("run-3", "step-1", listOf("step-1")))
        gate.continueRun("run-3")

        val sameStepPause = gate.preparePause("run-3", "step-1", listOf("step-1"))
        assertEquals(null, sameStepPause)

        gate.onStepCompleted("run-3", "step-1")
        val loopedPause = gate.preparePause("run-3", "step-1", listOf("loop", "step-1"))
        assertNotNull(loopedPause)
        assertEquals(DebugPauseReasonType.BREAKPOINT, loopedPause.reasonType)
    }
}