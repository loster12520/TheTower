package com.thetower.executor

import com.microsoft.playwright.Browser
import com.microsoft.playwright.BrowserType
import com.microsoft.playwright.Playwright
import com.microsoft.playwright.PlaywrightException
import com.thetower.models.RunDebugOptions
import com.thetower.utils.RunExecutionException

internal data class ResolvedBrowserTarget(
    val engine: String,
    val channel: String? = null
)

internal fun resolveBrowserTarget(browserName: String): ResolvedBrowserTarget {
    val normalized = browserName.trim().lowercase()
    return when (normalized) {
        "chromium" -> ResolvedBrowserTarget(engine = "chromium")
        "chrome" -> ResolvedBrowserTarget(engine = "chromium", channel = "chrome")
        "edge", "msedge" -> ResolvedBrowserTarget(engine = "chromium", channel = "msedge")
        "firefox" -> ResolvedBrowserTarget(engine = "firefox")
        "webkit" -> ResolvedBrowserTarget(engine = "webkit")
        else -> throw RunExecutionException("不支持的浏览器类型: $browserName")
    }
}

class OpenedPlaywrightRunSession(
    private val playwright: Playwright,
    private val browser: Browser,
    val session: PlaywrightRunSession
) {
    fun currentPageAlias(): String? = session.currentPageAlias()

    fun currentContextId(): String = session.currentContextId()

    fun bringDebugBrowserToFront() {
        session.bringDebugBrowserToFront()
    }

    fun capturePreviewFrame(quality: Int) = session.capturePreviewFrame(quality)

    fun executeStep(step: com.thetower.models.StepNode, outputs: MutableMap<String, String>) = session.executeStep(step, outputs)

    fun collectForEachElement(config: kotlinx.serialization.json.JsonObject, outputs: MutableMap<String, String>) =
        session.collectForEachElement(config, outputs)

    fun pushBrowserContext(): String = session.pushBrowserContext()

    fun restorePreviousContext(closeCurrent: Boolean): String = session.restorePreviousContext(closeCurrent)

    fun closeQuietly() {
        session.closeQuietly()
        runCatching { browser.close() }
        runCatching { playwright.close() }
    }
}

data class PlaywrightExecutorConfig(
    val browser: String = "chromium",
    val headless: Boolean = true,
    val defaultTimeoutMs: Double = 10_000.0
)

class PlaywrightRunExecutor(
    private val config: PlaywrightExecutorConfig
) {
    fun openSession(runId: String, debugOptions: RunDebugOptions? = null): OpenedPlaywrightRunSession {
        val playwright = Playwright.create()
        val browser = launchBrowser(playwright, debugOptions)
        val session = PlaywrightRunSession(runId, browser, config)
        return OpenedPlaywrightRunSession(playwright, browser, session)
    }

    fun <T> withSession(runId: String, debugOptions: RunDebugOptions? = null, block: (PlaywrightRunSession) -> T): T {
        val opened = openSession(runId, debugOptions)

        try {
            return block(opened.session)
        } catch (ex: PlaywrightException) {
            throw RunExecutionException("Playwright 执行失败: ${ex.message}")
        } finally {
            opened.closeQuietly()
        }
    }

    private fun launchBrowser(playwright: Playwright, debugOptions: RunDebugOptions?): Browser {
        val target = resolveBrowserTarget(config.browser)
        val enableDebug = debugOptions?.enabled == true
        val useVisibleBrowser = enableDebug && (debugOptions.openVisibleBrowser || debugOptions.openDevtools)
        val options = BrowserType.LaunchOptions().setHeadless(if (useVisibleBrowser) false else config.headless)
        target.channel?.let { options.setChannel(it) }

        if (debugOptions?.openDevtools == true) {
            if (target.engine != "chromium") {
                throw RunExecutionException("只有 Chromium 内核浏览器调试运行支持自动打开 DevTools")
            }
            options.setDevtools(true)
        }

        return when (target.engine) {
            "chromium" -> playwright.chromium().launch(options)
            "firefox" -> playwright.firefox().launch(options)
            "webkit" -> playwright.webkit().launch(options)
            else -> throw RunExecutionException("不支持的浏览器类型: ${config.browser}")
        }
    }
}
