package com.thetower.executor

import com.thetower.models.RunLaunchOptions
import com.thetower.utils.RunExecutionException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class PlaywrightRunExecutorTest {
    @Test
    fun `edge resolves to chromium msedge channel`() {
        val target = resolveBrowserTarget("edge")

        assertEquals("chromium", target.engine)
        assertEquals("msedge", target.channel)
    }

    @Test
    fun `chrome resolves to chromium chrome channel`() {
        val target = resolveBrowserTarget("chrome")

        assertEquals("chromium", target.engine)
        assertEquals("chrome", target.channel)
    }

    @Test
    fun `firefox stays firefox without channel`() {
        val target = resolveBrowserTarget("firefox")

        assertEquals("firefox", target.engine)
        assertEquals(null, target.channel)
    }

    @Test
    fun `unsupported browser throws`() {
        assertFailsWith<RunExecutionException> {
            resolveBrowserTarget("unknown-browser")
        }
    }

    @Test
    fun `launch options override default executor config`() {
        val executor = PlaywrightRunExecutor(
            PlaywrightExecutorConfig(browser = "chromium", headless = true, defaultTimeoutMs = 10_000.0)
        )

        val merged = executor.mergeConfig(
            RunLaunchOptions(browser = "firefox", headless = false, defaultTimeoutMs = 25_000.0)
        )

        assertEquals("firefox", merged.browser)
        assertEquals(false, merged.headless)
        assertEquals(25_000.0, merged.defaultTimeoutMs)
    }

    @Test
    fun `clamp debug coordinate keeps value within viewport`() {
        assertEquals(0, clampDebugCoordinate(-20, 800))
        assertEquals(799, clampDebugCoordinate(900, 800))
        assertEquals(120, clampDebugCoordinate(120, 800))
    }
}