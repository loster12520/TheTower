package com.thetower.executor

import com.microsoft.playwright.Browser
import com.microsoft.playwright.BrowserType
import com.microsoft.playwright.Playwright
import com.microsoft.playwright.PlaywrightException
import com.thetower.models.RunDebugOptions
import com.thetower.utils.RunExecutionException

data class PlaywrightExecutorConfig(
    val browser: String = "chromium",
    val headless: Boolean = true,
    val defaultTimeoutMs: Double = 10_000.0
)

class PlaywrightRunExecutor(
    private val config: PlaywrightExecutorConfig
) {
    fun <T> withSession(runId: String, debugOptions: RunDebugOptions? = null, block: (PlaywrightRunSession) -> T): T {
        val playwright = Playwright.create()
        val browser = launchBrowser(playwright, debugOptions)
        val session = PlaywrightRunSession(runId, browser, config)

        try {
            return block(session)
        } catch (ex: PlaywrightException) {
            throw RunExecutionException("Playwright 执行失败: ${ex.message}")
        } finally {
            session.closeQuietly()
            runCatching { browser.close() }
            runCatching { playwright.close() }
        }
    }

    private fun launchBrowser(playwright: Playwright, debugOptions: RunDebugOptions?): Browser {
        val enableDebug = debugOptions?.enabled == true
        val useVisibleBrowser = enableDebug && (debugOptions.openVisibleBrowser || debugOptions.openDevtools)
        val options = BrowserType.LaunchOptions().setHeadless(if (useVisibleBrowser) false else config.headless)

        if (debugOptions?.openDevtools == true) {
            if (config.browser.lowercase() !in setOf("chromium", "chrome")) {
                throw RunExecutionException("只有 Chromium/Chrome 调试运行支持自动打开 DevTools")
            }
            options.setDevtools(true)
        }

        return when (config.browser.lowercase()) {
            "chromium", "chrome" -> playwright.chromium().launch(options)
            "firefox" -> playwright.firefox().launch(options)
            "webkit", "edge" -> playwright.webkit().launch(options)
            else -> throw RunExecutionException("不支持的浏览器类型: ${config.browser}")
        }
    }
}
