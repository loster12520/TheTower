package com.thetower.executor

import com.microsoft.playwright.Browser
import com.microsoft.playwright.BrowserContext
import com.microsoft.playwright.BrowserType
import com.microsoft.playwright.Page
import com.microsoft.playwright.Playwright
import com.microsoft.playwright.PlaywrightException
import com.thetower.models.StepNode
import com.thetower.utils.BadRequestException
import com.thetower.utils.RunExecutionException
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

data class PlaywrightExecutorConfig(
    val browser: String = "chromium",
    val headless: Boolean = true,
    val defaultTimeoutMs: Double = 10_000.0
)

class PlaywrightRunExecutor(
    private val config: PlaywrightExecutorConfig
) {
    fun <T> withPage(block: (Page) -> T): T {
        val playwright = Playwright.create()
        val browser = launchBrowser(playwright)
        val context = browser.newContext()
        val page = context.newPage().also {
            it.setDefaultTimeout(config.defaultTimeoutMs)
        }

        try {
            return block(page)
        } catch (ex: PlaywrightException) {
            throw RunExecutionException("Playwright 执行失败: ${ex.message}")
        } finally {
            closeQuietly(page)
            closeQuietly(context)
            closeQuietly(browser)
            closeQuietly(playwright)
        }
    }

    fun executeStep(page: Page, step: StepNode): Map<String, String> {
        return when (step.type) {
            "openUrl" -> {
                val url = requiredText(step.data.config, "url")
                page.navigate(url)
                emptyMap()
            }

            "click" -> {
                val selector = requiredText(step.data.config, "selector")
                page.click(selector)
                emptyMap()
            }

            "type" -> {
                val selector = requiredText(step.data.config, "selector")
                val text = requiredText(step.data.config, "text")
                page.fill(selector, text)
                emptyMap()
            }

            "waitFor" -> {
                val selector = optionalText(step.data.config, "selector")
                val waitMs = optionalInt(step.data.config, "waitMs")
                if (selector.isNullOrBlank() && waitMs == null) {
                    throw BadRequestException("waitFor 节点必须提供 selector 或 waitMs")
                }
                if (!selector.isNullOrBlank()) {
                    page.waitForSelector(selector)
                }
                if (waitMs != null) {
                    page.waitForTimeout(waitMs.toDouble())
                }
                emptyMap()
            }

            "extract" -> {
                val selector = requiredText(step.data.config, "selector")
                val outputName = requiredText(step.data.config, "as")
                val mode = optionalText(step.data.config, "mode") ?: "text"
                val locator = page.locator(selector).first()

                val value = when (mode) {
                    "text" -> locator.innerText()
                    "attribute" -> {
                        val attrName = requiredText(step.data.config, "attributeName")
                        locator.getAttribute(attrName) ?: ""
                    }

                    else -> throw BadRequestException("extract.mode 不支持: $mode")
                }

                mapOf(outputName to value)
            }

            else -> throw BadRequestException("不支持的步骤类型: ${step.type}")
        }
    }

    private fun launchBrowser(playwright: Playwright): Browser {
        val options = BrowserType.LaunchOptions().setHeadless(config.headless)
        return when (config.browser.lowercase()) {
            "chromium", "chrome" -> playwright.chromium().launch(options)
            "firefox" -> playwright.firefox().launch(options)
            "webkit", "edge" -> playwright.webkit().launch(options)
            else -> throw BadRequestException("不支持的浏览器类型: ${config.browser}")
        }
    }

    private fun requiredText(config: JsonObject, key: String): String {
        return optionalText(config, key)
            ?.takeIf { it.isNotBlank() }
            ?: throw BadRequestException("缺少必要参数: $key", mapOf("field" to key))
    }

    private fun optionalText(config: JsonObject, key: String): String? {
        return config[key]?.jsonPrimitive?.contentOrNull
    }

    private fun optionalInt(config: JsonObject, key: String): Int? {
        return config[key]?.jsonPrimitive?.intOrNull
    }

    private fun closeQuietly(target: Any) {
        runCatching {
            when (target) {
                is Page -> target.close()
                is BrowserContext -> target.close()
                is Browser -> target.close()
                is Playwright -> target.close()
            }
        }
    }
}
