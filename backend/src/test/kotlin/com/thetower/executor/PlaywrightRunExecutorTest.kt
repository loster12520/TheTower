package com.thetower.executor

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
}