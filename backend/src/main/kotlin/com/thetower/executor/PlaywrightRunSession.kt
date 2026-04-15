package com.thetower.executor

import com.microsoft.playwright.Browser
import com.microsoft.playwright.BrowserContext
import com.microsoft.playwright.Download
import com.microsoft.playwright.Locator
import com.microsoft.playwright.Page
import com.microsoft.playwright.PlaywrightException
import com.microsoft.playwright.Request
import com.microsoft.playwright.Response
import com.microsoft.playwright.options.MouseButton
import com.microsoft.playwright.options.WaitForSelectorState
import com.thetower.models.RunArtifact
import com.thetower.models.StepNode
import com.thetower.services.resolveOptionalBoolean
import com.thetower.services.resolveOptionalInt
import com.thetower.services.resolveOptionalText
import com.thetower.services.resolveRequiredText
import com.thetower.services.resolveStringList
import com.thetower.services.resolveTextTemplate
import com.thetower.services.convertJsonValue
import com.thetower.services.extractJsonKey
import com.thetower.services.randomGetFromJsonArray
import com.thetower.utils.BadRequestException
import com.thetower.utils.ErrorCodes
import com.thetower.utils.RunExecutionException
import com.thetower.utils.newId
import com.thetower.utils.nowIso
import java.net.URI
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.Base64
import java.util.function.Consumer
import org.apache.poi.ss.usermodel.CellType
import org.apache.poi.ss.usermodel.DataFormatter
import org.apache.poi.ss.usermodel.WorkbookFactory
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.math.max
import kotlin.math.min
import kotlin.random.Random
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class StepExecutionResult(
    val outputs: Map<String, String> = emptyMap(),
    val artifacts: List<RunArtifact> = emptyList(),
    val pageAlias: String? = null,
    val contextId: String? = null
)

data class DebugPreviewFrame(
    val mimeType: String,
    val frameBase64: String,
    val width: Int,
    val height: Int,
    val pageAlias: String?,
    val contextId: String
)

internal fun clampDebugCoordinate(value: Int, upperBoundExclusive: Int): Int {
    if (upperBoundExclusive <= 0) {
        return 0
    }
    return value.coerceIn(0, upperBoundExclusive - 1)
}

class PlaywrightRunSession(
    private val runId: String,
    private val browser: Browser,
    private val config: PlaywrightExecutorConfig
) {
    private data class ContextScope(
        val id: String,
        val context: BrowserContext,
        val pages: MutableList<Page>,
        val pageAliases: MutableMap<String, Page>,
        var currentPage: Page
    )

    private data class ElementTarget(
        val selector: String,
        val order: JsonObject?
    )

    private class RequestListenerState(
        val listenerId: String,
        val page: Page,
        val pageAlias: String?,
        val contextId: String,
        private val urlPattern: String,
        private val matchType: String,
        private val method: String?,
        val requestHandler: Consumer<Request>,
        val responseHandler: Consumer<Response>,
        val requestFailedHandler: Consumer<Request>
    ) {
        private var active = true
        private var requestCount = 0
        private var responseCount = 0
        private var failedCount = 0
        private var lastUpdatedAt: String? = null
        private var latestRequest: JsonObject? = null
        private var latestResponse: JsonObject? = null
        private var latestFailure: JsonObject? = null

        @Synchronized
        fun matches(request: Request): Boolean {
            val methodMatched = method.isNullOrBlank() || request.method().equals(method, ignoreCase = true)
            val urlMatched = when (matchType) {
                "equals" -> request.url() == urlPattern
                else -> request.url().contains(urlPattern)
            }
            return active && methodMatched && urlMatched
        }

        @Synchronized
        fun recordRequest(request: Request) {
            requestCount += 1
            latestRequest = buildJsonObject {
                put("url", JsonPrimitive(request.url()))
                put("method", JsonPrimitive(request.method()))
                put("resourceType", JsonPrimitive(request.resourceType()))
                put("postData", JsonPrimitive(request.postData() ?: ""))
                put("headers", buildJsonObject {
                    request.headers().forEach { (key, value) -> put(key, JsonPrimitive(value)) }
                })
            }
            lastUpdatedAt = nowIso()
        }

        @Synchronized
        fun recordResponse(response: Response) {
            responseCount += 1
            latestResponse = buildJsonObject {
                put("url", JsonPrimitive(response.url()))
                put("status", JsonPrimitive(response.status()))
                put("statusText", JsonPrimitive(response.statusText()))
                put("ok", JsonPrimitive(response.ok()))
                put("headers", buildJsonObject {
                    response.headers().forEach { (key, value) -> put(key, JsonPrimitive(value)) }
                })
            }
            lastUpdatedAt = nowIso()
        }

        @Synchronized
        fun recordFailure(request: Request) {
            failedCount += 1
            latestFailure = buildJsonObject {
                put("url", JsonPrimitive(request.url()))
                put("method", JsonPrimitive(request.method()))
                put("failure", JsonPrimitive(request.failure()))
            }
            lastUpdatedAt = nowIso()
        }

        @Synchronized
        fun snapshot(): String {
            return buildJsonObject {
                put("listenerId", JsonPrimitive(listenerId))
                put("pageAlias", JsonPrimitive(pageAlias ?: ""))
                put("contextId", JsonPrimitive(contextId))
                put("urlPattern", JsonPrimitive(urlPattern))
                put("matchType", JsonPrimitive(matchType))
                put("method", JsonPrimitive(method ?: ""))
                put("active", JsonPrimitive(active))
                put("requestCount", JsonPrimitive(requestCount))
                put("responseCount", JsonPrimitive(responseCount))
                put("failedCount", JsonPrimitive(failedCount))
                put("lastUpdatedAt", JsonPrimitive(lastUpdatedAt ?: ""))
                put("latestRequest", latestRequest ?: buildJsonObject { })
                put("latestResponse", latestResponse ?: buildJsonObject { })
                put("latestFailure", latestFailure ?: buildJsonObject { })
            }.toString()
        }

        @Synchronized
        fun clearLatest() {
            latestRequest = null
            latestResponse = null
            latestFailure = null
            lastUpdatedAt = null
        }

        @Synchronized
        fun deactivate() {
            active = false
        }
    }

    private val json = Json { ignoreUnknownKeys = true }
    private val contextStack = mutableListOf(createScope())
    private val retainedContexts = mutableListOf<ContextScope>()
    private val sequenceState = mutableMapOf<String, Int>()
    private val requestListeners = mutableMapOf<String, RequestListenerState>()
    private val artifactRoot: Path = Paths.get("data", "runs", runId, "artifacts")

    init {
        Files.createDirectories(artifactRoot)
    }

    fun currentContextId(): String = currentScope().id

    fun currentPageAlias(): String? = findAlias(currentScope(), currentPage())

    fun bringDebugBrowserToFront(): StepExecutionResult {
        val page = currentPage()
        page.bringToFront()
        return StepExecutionResult(
            pageAlias = currentPageAlias(),
            contextId = currentContextId()
        )
    }

    fun capturePreviewFrame(quality: Int = 60): DebugPreviewFrame? {
        val page = runCatching { currentPage() }.getOrNull() ?: return null
        return try {
            val bytes = page.screenshot(Page.ScreenshotOptions())
            val viewport = page.viewportSize()
            DebugPreviewFrame(
                mimeType = "image/png",
                frameBase64 = Base64.getEncoder().encodeToString(bytes),
                width = viewport?.width ?: 0,
                height = viewport?.height ?: 0,
                pageAlias = currentPageAlias(),
                contextId = currentContextId()
            )
        } catch (_: Exception) {
            null
        }
    }

        fun debugClickAt(x: Int, y: Int): StepExecutionResult {
                val page = currentPage()
                val viewport = page.viewportSize()
                val safeX = clampDebugCoordinate(x, viewport?.width ?: Int.MAX_VALUE)
                val safeY = clampDebugCoordinate(y, viewport?.height ?: Int.MAX_VALUE)
                page.mouse().click(safeX.toDouble(), safeY.toDouble())
                return StepExecutionResult(pageAlias = currentPageAlias(), contextId = currentContextId())
        }

        fun debugTypeText(text: String, clearBeforeType: Boolean): StepExecutionResult {
                val page = currentPage()
                if (clearBeforeType) {
                        page.evaluate(
                                """
                                () => {
                                    const active = document.activeElement;
                                    if (!active) return;
                                    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
                                        active.value = '';
                                        active.dispatchEvent(new Event('input', { bubbles: true }));
                                        return;
                                    }
                                    if (active instanceof HTMLElement && active.isContentEditable) {
                                        active.textContent = '';
                                    }
                                }
                                """.trimIndent()
                        )
                }
                page.keyboard().insertText(text)
                return StepExecutionResult(pageAlias = currentPageAlias(), contextId = currentContextId())
        }

    fun executeStep(step: StepNode, outputs: MutableMap<String, String>): StepExecutionResult {
        return when (step.type) {
            "openUrl" -> executeOpenUrl(step.data.config, outputs)
            "click" -> executeClick(step, outputs)
            "type" -> executeType(step, outputs)
            "waitFor" -> executeWaitFor(step.data.config, outputs)
            "extract" -> executeExtract(step.data.config, outputs)
            "newPage" -> executeNewPage(step.data.config, outputs)
            "closePage" -> executeClosePage(step.data.config, outputs)
            "switchPage" -> executeSwitchPage(step.data.config, outputs)
            "reloadPage" -> executeReloadPage(step.data.config, outputs)
            "screenshotPage" -> executeScreenshot(step.data.config, outputs)
            "hover" -> executeHover(step.data.config, outputs)
            "focus" -> executeFocus(step.data.config, outputs)
            "selectOption" -> executeSelectOption(step.data.config, outputs)
            "scrollPage" -> executeScrollPage(step.data.config, outputs)
            "uploadFiles" -> executeUploadFiles(step.data.config, outputs)
            "executeJs" -> executeJs(step.data.config, outputs)
            "waitForResponse" -> executeWaitForResponse(step.data.config, outputs)
            "listenRequestTrigger" -> executeListenRequestTrigger(step.data.config, outputs)
            "listenRequestResult" -> executeListenRequestResult(step.data.config, outputs)
            "stopPageListen" -> executeStopPageListen(step.data.config, outputs)
            "getUrl" -> executeGetUrl(step.data.config, outputs)
            "downloadFile" -> executeDownloadFile(step.data.config, outputs)
            "importText" -> executeImportText(step.data.config, outputs)
            "saveData" -> executeSaveData(step.data.config, outputs)
            "saveExcel" -> executeSaveExcel(step.data.config, outputs)
            "importExcel" -> executeImportExcel(step.data.config, outputs)
            "extractActiveElement" -> executeExtractActiveElement(step.data.config, outputs)
            "getClipboardText" -> executeGetClipboardText(step.data.config, outputs)
            "totp" -> executeTotp(step.data.config, outputs)
            "getCookies" -> executeGetCookies(step.data.config, outputs)
            "clearCookies" -> executeClearCookies()
            "closeBrowser" -> executeCloseBrowser()
            "convertJson" -> executeConvertJson(step.data.config, outputs)
            "extractKey" -> executeExtractKey(step.data.config, outputs)
            "randomGet" -> executeRandomGet(step.data.config, outputs)
            "keyboardPress" -> executeKeyboardPress(step.data.config, outputs)
            "keyboardHotkey" -> executeKeyboardHotkey(step.data.config, outputs)
            "textExtract" -> executeTextExtract(step.data.config, outputs)
            "goBack" -> executeGoBack(step.data.config, outputs)
            "closeOtherPages" -> executeCloseOtherPages(step.data.config, outputs)
            else -> throw BadRequestException("不支持的步骤类型: ${step.type}")
        }
    }

    fun collectForEachElement(config: JsonObject, outputs: MutableMap<String, String>): List<String> {
        val target = resolveElementTarget(config, outputs)
        val locator = currentPage().locator(target.selector)
        val count = locator.count()
        if (count <= 0) return emptyList()

        val extractType = (resolveOptionalText(config, "extractType", outputs) ?: "text").lowercase()
        val attributeName = resolveOptionalText(config, "attributeName", outputs)
        val indices = resolveIndices(count, target.order, iterateAllByDefault = true)

        return indices.map { index ->
            val item = locator.nth(index)
            when (extractType) {
                "text" -> item.innerText()
                "attribute" -> {
                    val attr = attributeName?.takeIf { it.isNotBlank() }
                        ?: throw BadRequestException("extractType=attribute 时必须提供 attributeName")
                    item.getAttribute(attr) ?: ""
                }

                "html" -> item.innerHTML()
                else -> throw BadRequestException("forEachElement.extractType 不支持: $extractType")
            }
        }
    }

    fun pushBrowserContext(): String {
        val scope = createScope()
        contextStack.add(scope)
        return scope.id
    }

    fun restorePreviousContext(closeCurrent: Boolean): String {
        if (contextStack.size <= 1) {
            if (closeCurrent) {
                closeCurrentScopeAndReplace()
            }
            return currentContextId()
        }

        val current = contextStack.removeAt(contextStack.lastIndex)
        if (closeCurrent) {
            closeScope(current)
        } else {
            retainedContexts.add(current)
        }
        return currentContextId()
    }

    fun closeQuietly() {
        requestListeners.keys.toList().forEach(::stopRequestListener)
        retainedContexts.forEach(::closeScope)
        retainedContexts.clear()
        while (contextStack.isNotEmpty()) {
            closeScope(contextStack.removeAt(contextStack.lastIndex))
        }
    }

    private fun executeOpenUrl(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val url = resolveRequiredText(config, "url", outputs)
        val timeoutMs = resolveOptionalInt(config, "timeoutMs", outputs)?.toDouble()
        if (timeoutMs != null) {
            currentPage().navigate(url, Page.NavigateOptions().setTimeout(timeoutMs))
        } else {
            currentPage().navigate(url)
        }
        return StepExecutionResult(pageAlias = findAlias(currentScope(), currentPage()), contextId = currentContextId())
    }

    private fun executeClick(step: StepNode, outputs: MutableMap<String, String>): StepExecutionResult {
        val locator = resolveActionLocator(step.data.config, outputs)
        val clickAction = (resolveOptionalText(step.data.config, "clickAction", outputs) ?: "single").lowercase()
        val mouseButton = when ((resolveOptionalText(step.data.config, "mouseButton", outputs) ?: "left").lowercase()) {
            "left" -> MouseButton.LEFT
            "middle" -> MouseButton.MIDDLE
            "right" -> MouseButton.RIGHT
            else -> throw BadRequestException("mouseButton 不支持")
        }
        val timeoutMs = resolveOptionalInt(step.data.config, "timeoutMs", outputs)?.toDouble()
        val options = Locator.ClickOptions().setButton(mouseButton)
        if (clickAction == "double") {
            options.setClickCount(2)
        }
        if (timeoutMs != null) {
            options.setTimeout(timeoutMs)
        }
        locator.click(options)
        return StepExecutionResult(pageAlias = findAlias(currentScope(), currentPage()), contextId = currentContextId())
    }

    private fun executeType(step: StepNode, outputs: MutableMap<String, String>): StepExecutionResult {
        val locator = resolveActionLocator(step.data.config, outputs)
        val text = resolveTypeText(step, outputs)
        val clearBeforeType = resolveOptionalBoolean(step.data.config, "clearBeforeType", outputs) ?: false
        val intervalMs = resolveOptionalInt(step.data.config, "intervalMsPerChar", outputs)?.toDouble()
        val timeoutMs = resolveOptionalInt(step.data.config, "timeoutMs", outputs)?.toDouble()

        if (clearBeforeType) {
            locator.fill("")
        }

        if (intervalMs != null && intervalMs > 0) {
            val options = Locator.TypeOptions().setDelay(intervalMs)
            if (timeoutMs != null) {
                options.setTimeout(timeoutMs)
            }
            locator.type(text, options)
        } else if (clearBeforeType) {
            locator.fill(text)
        } else {
            val options = Locator.TypeOptions()
            if (timeoutMs != null) {
                options.setTimeout(timeoutMs)
            }
            locator.type(text, options)
        }

        return StepExecutionResult(pageAlias = findAlias(currentScope(), currentPage()), contextId = currentContextId())
    }

    private fun executeWaitFor(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val selector = resolveOptionalText(config, "selector", outputs)
        val waitMs = resolveOptionalInt(config, "waitMs", outputs)
        val minMs = resolveOptionalInt(config, "minMs", outputs)
        val maxMs = resolveOptionalInt(config, "maxMs", outputs)
        val timeoutMs = resolveOptionalInt(config, "timeoutMs", outputs)?.toDouble()
        val visible = resolveOptionalBoolean(config, "visible", outputs) ?: false
        val saveAs = resolveOptionalText(config, "saveAs", outputs)

        if (selector.isNullOrBlank() && waitMs == null && (minMs == null || maxMs == null)) {
            throw BadRequestException("waitFor 节点必须提供 selector、waitMs 或 minMs/maxMs")
        }

        val outputsMap = mutableMapOf<String, String>()

        if (!selector.isNullOrBlank()) {
            try {
                val options = Page.WaitForSelectorOptions().setState(
                    if (visible) WaitForSelectorState.VISIBLE else WaitForSelectorState.ATTACHED
                )
                if (timeoutMs != null) {
                    options.setTimeout(timeoutMs)
                }
                currentPage().waitForSelector(selector, options)
                if (!saveAs.isNullOrBlank()) {
                    outputsMap[saveAs] = "true"
                }
            } catch (ex: PlaywrightException) {
                if (!saveAs.isNullOrBlank()) {
                    outputsMap[saveAs] = "false"
                    return StepExecutionResult(outputs = outputsMap, contextId = currentContextId())
                }
                throw ex
            }
        }

        val duration = when {
            waitMs != null -> waitMs
            minMs != null && maxMs != null -> {
                val start = min(minMs, maxMs)
                val end = max(minMs, maxMs)
                Random.nextInt(start, end + 1)
            }

            else -> null
        }

        if (duration != null) {
            currentPage().waitForTimeout(duration.toDouble())
        }

        return StepExecutionResult(outputs = outputsMap, contextId = currentContextId())
    }

    private fun executeExtract(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val locator = resolveActionLocator(config, outputs)
        val outputName = resolveOptionalText(config, "saveAs", outputs)
            ?: resolveRequiredText(config, "as", outputs)
        val mode = (resolveOptionalText(config, "extractType", outputs)
            ?: resolveOptionalText(config, "mode", outputs)
            ?: "text").lowercase()

        val value = when (mode) {
            "text" -> locator.innerText()
            "attribute" -> {
                val attributeName = resolveRequiredText(config, "attributeName", outputs)
                locator.getAttribute(attributeName) ?: ""
            }

            "html" -> locator.innerHTML()
            "source" -> locator.evaluate("element => element.outerHTML")?.toString() ?: ""
            "elementref", "iframeref" -> buildJsonObject {
                put("selector", JsonPrimitive(resolveElementTarget(config, outputs).selector))
                put("selectorType", JsonPrimitive("css"))
                config["elementOrder"]?.let { put("elementOrder", it) }
            }.toString()

            "childelement" -> {
                val childTagName = resolveRequiredText(config, "childTagName", outputs)
                locator.locator(childTagName).first().innerText()
            }

            else -> throw BadRequestException("extract 类型不支持: $mode")
        }

        return StepExecutionResult(outputs = mapOf(outputName to value), contextId = currentContextId())
    }

    private fun executeNewPage(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val alias = resolveOptionalText(config, "pageAlias", outputs)
        val switchToNew = resolveOptionalBoolean(config, "switchToNew", outputs) ?: true
        val page = currentScope().context.newPage().also(::applyPageDefaults)
        currentScope().pages.add(page)
        if (!alias.isNullOrBlank()) {
            currentScope().pageAliases[alias] = page
        }
        if (switchToNew) {
            currentScope().currentPage = page
        }
        return StepExecutionResult(pageAlias = alias, contextId = currentContextId())
    }

    private fun executeClosePage(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val alias = resolveOptionalText(config, "pageAlias", outputs)
        val scope = currentScope()
        val target = if (!alias.isNullOrBlank()) {
            scope.pageAliases[alias] ?: throw BadRequestException("未找到页面别名: $alias", mapOf("field" to "pageAlias"))
        } else {
            scope.currentPage
        }

        removePage(scope, target)
        runCatching { target.close() }

        if (scope.pages.isEmpty()) {
            val replacement = scope.context.newPage().also(::applyPageDefaults)
            scope.pages.add(replacement)
            scope.currentPage = replacement
        } else if (scope.currentPage == target) {
            scope.currentPage = scope.pages.last()
        }

        return StepExecutionResult(pageAlias = findAlias(scope, scope.currentPage), contextId = currentContextId())
    }

    private fun executeSwitchPage(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val scope = currentScope()
        val matchBy = (resolveOptionalText(config, "matchBy", outputs) ?: "alias").lowercase()
        val matchType = (resolveOptionalText(config, "matchType", outputs) ?: "equals").lowercase()
        val value = resolveRequiredText(config, "value", outputs)
        val target = when (matchBy) {
            "alias" -> scope.pageAliases[value]
            "title" -> scope.pages.firstOrNull { matchesText(runCatching { it.title() }.getOrDefault(""), value, matchType) }
            "url" -> scope.pages.firstOrNull { matchesText(it.url(), value, matchType) }
            else -> throw BadRequestException("switchPage.matchBy 不支持: $matchBy")
        } ?: throw BadRequestException("未找到匹配页面: $value", mapOf("field" to "value", "code" to ErrorCodes.PAGE_TARGET_INVALID))

        scope.currentPage = target
        return StepExecutionResult(pageAlias = findAlias(scope, target), contextId = currentContextId())
    }

    private fun executeReloadPage(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val timeoutMs = resolveOptionalInt(config, "timeoutMs", outputs)?.toDouble()
        if (timeoutMs != null) {
            currentPage().reload(Page.ReloadOptions().setTimeout(timeoutMs))
        } else {
            currentPage().reload()
        }
        return StepExecutionResult(pageAlias = findAlias(currentScope(), currentPage()), contextId = currentContextId())
    }

    private fun executeScreenshot(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val name = resolveOptionalText(config, "name", outputs)
        val format = (resolveOptionalText(config, "format", outputs) ?: "png").lowercase()
        val fullPage = resolveOptionalBoolean(config, "fullPage", outputs) ?: false
        val quality = resolveOptionalInt(config, "quality", outputs)
        val targetPath = artifactRoot.resolve(safeFileName(name ?: "screenshot-${System.currentTimeMillis()}", format))

        val options = Page.ScreenshotOptions().setPath(targetPath).setFullPage(fullPage)
        if (format == "jpeg" && quality != null) {
            options.setQuality(quality)
        }

        try {
            currentPage().screenshot(options)
        } catch (ex: Exception) {
            throw RunExecutionException("截图失败: ${ex.message}")
        }

        val artifact = buildArtifact(targetPath, targetPath.fileName.toString(), "screenshot")
        return StepExecutionResult(artifacts = listOf(artifact), contextId = currentContextId())
    }

    private fun executeHover(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        resolveActionLocator(config, outputs).hover()
        return StepExecutionResult(contextId = currentContextId())
    }

    private fun executeFocus(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        resolveActionLocator(config, outputs).focus()
        return StepExecutionResult(contextId = currentContextId())
    }

    private fun executeSelectOption(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val value = resolveRequiredText(config, "value", outputs)
        resolveActionLocator(config, outputs).selectOption(value)
        return StepExecutionResult(contextId = currentContextId())
    }

    private fun executeScrollPage(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val scrollMode = (resolveOptionalText(config, "scrollMode", outputs) ?: "position").lowercase()
        if (scrollMode == "pixel") {
            val pixels = resolveOptionalInt(config, "pixels", outputs) ?: 0
            currentPage().evaluate("value => window.scrollBy(0, value)", pixels)
        } else {
            val position = (resolveOptionalText(config, "position", outputs) ?: "bottom").lowercase()
            val script = when (position) {
                "top" -> "() => window.scrollTo({ top: 0, behavior: 'instant' })"
                "middle" -> "() => window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'instant' })"
                else -> "() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })"
            }
            currentPage().evaluate(script)
        }
        return StepExecutionResult(contextId = currentContextId())
    }

    private fun executeUploadFiles(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val locator = resolveActionLocator(config, outputs)
        val source = (resolveOptionalText(config, "source", outputs) ?: "localFile").lowercase()
        val pathOrUrl = resolveRequiredText(config, "pathOrUrl", outputs)
        val targetPath = when (source) {
            "localfile" -> resolveFilesystemPath(pathOrUrl)
            "url" -> downloadSupportFile(pathOrUrl)
            else -> throw BadRequestException("uploadFiles.source 不支持: $source")
        }
        locator.setInputFiles(targetPath)
        return StepExecutionResult(contextId = currentContextId())
    }

    private fun executeJs(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val javascript = resolveRequiredText(config, "javascript", outputs)
        val injectVars = resolveStringList(config, "injectVars", outputs)
        val saveAs = resolveOptionalText(config, "saveAs", outputs)
        val args = injectVars.associateWith { outputs[it].orEmpty() }
        val result = if (args.isEmpty()) {
            currentPage().evaluate(javascript)
        } else {
            currentPage().evaluate(javascript, args)
        }
        val serialized = serializeJsValue(result)
        val outputMap = if (!saveAs.isNullOrBlank()) mapOf(saveAs to serialized) else emptyMap()
        return StepExecutionResult(outputs = outputMap, contextId = currentContextId())
    }

    private fun executeWaitForResponse(stepConfig: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val responseUrl = resolveRequiredText(stepConfig, "responseUrl", outputs)
        val matchType = (resolveOptionalText(stepConfig, "matchType", outputs) ?: "contains").lowercase()
        val timeoutMs = (resolveOptionalInt(stepConfig, "timeoutMs", outputs)?.toDouble() ?: config.defaultTimeoutMs)
        val saveAs = resolveOptionalText(stepConfig, "saveAs", outputs)

        return try {
            currentPage().waitForResponse(
                { response: Response -> matchesText(response.url(), responseUrl, matchType) },
                Page.WaitForResponseOptions().setTimeout(timeoutMs)
            ) {
                currentPage().waitForTimeout(timeoutMs)
            }
            val outputMap = if (!saveAs.isNullOrBlank()) mapOf(saveAs to "true") else emptyMap()
            StepExecutionResult(outputs = outputMap, contextId = currentContextId())
        } catch (ex: PlaywrightException) {
            if (!saveAs.isNullOrBlank()) {
                StepExecutionResult(outputs = mapOf(saveAs to "false"), contextId = currentContextId())
            } else {
                throw ex
            }
        }
    }

    private fun executeListenRequestTrigger(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val listenerId = resolveRequiredText(config, "listenerId", outputs)
        val urlPattern = resolveRequiredText(config, "urlPattern", outputs)
        val matchType = (resolveOptionalText(config, "matchType", outputs) ?: "contains").lowercase()
        val method = resolveOptionalText(config, "method", outputs)?.trim()?.uppercase()?.takeIf { it.isNotBlank() }
        val saveAs = resolveOptionalText(config, "saveAs", outputs)
        val page = currentPage()

        stopRequestListener(listenerId)

        lateinit var state: RequestListenerState
        val requestHandler = Consumer<Request> { request ->
            if (state.matches(request)) {
                state.recordRequest(request)
            }
        }
        val responseHandler = Consumer<Response> { response ->
            if (state.matches(response.request())) {
                state.recordResponse(response)
            }
        }
        val requestFailedHandler = Consumer<Request> { request ->
            if (state.matches(request)) {
                state.recordFailure(request)
            }
        }

        state = RequestListenerState(
            listenerId = listenerId,
            page = page,
            pageAlias = currentPageAlias(),
            contextId = currentContextId(),
            urlPattern = urlPattern,
            matchType = matchType,
            method = method,
            requestHandler = requestHandler,
            responseHandler = responseHandler,
            requestFailedHandler = requestFailedHandler
        )

        page.onRequest(requestHandler)
        page.onResponse(responseHandler)
        page.onRequestFailed(requestFailedHandler)
        requestListeners[listenerId] = state

        val outputMap = if (!saveAs.isNullOrBlank()) mapOf(saveAs to listenerId) else emptyMap()
        return StepExecutionResult(outputs = outputMap, contextId = currentContextId(), pageAlias = currentPageAlias())
    }

    private fun executeListenRequestResult(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val listenerId = resolveRequiredText(config, "listenerId", outputs)
        val saveAs = resolveRequiredText(config, "saveAs", outputs)
        val clearAfterRead = resolveOptionalBoolean(config, "clearAfterRead", outputs) ?: false
        val state = requestListeners[listenerId]
            ?: throw BadRequestException("找不到请求监听器: $listenerId", mapOf("field" to "listenerId", "code" to ErrorCodes.DATA_STEP_CONFIG_INVALID))
        val snapshot = state.snapshot()
        if (clearAfterRead) {
            state.clearLatest()
        }
        return StepExecutionResult(outputs = mapOf(saveAs to snapshot), contextId = currentContextId(), pageAlias = currentPageAlias())
    }

    private fun executeStopPageListen(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val stopAll = resolveOptionalBoolean(config, "stopAll", outputs) ?: false
        val listenerId = resolveOptionalText(config, "listenerId", outputs)?.trim()?.takeIf { it.isNotBlank() }

        if (stopAll || listenerId == null) {
            stopRequestListenersForPage(currentPage())
        } else {
            stopRequestListener(listenerId)
        }

        return StepExecutionResult(contextId = currentContextId(), pageAlias = currentPageAlias())
    }

    private fun executeGetUrl(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val extract = (resolveOptionalText(config, "extract", outputs) ?: "full").lowercase()
        val saveAs = resolveRequiredText(config, "saveAs", outputs)
        val currentUrl = currentPage().url()
        val uri = URI(currentUrl)
        val value = when (extract) {
            "full" -> currentUrl
            "origin" -> "${uri.scheme}://${uri.authority}"
            "queryparam" -> {
                val paramName = resolveRequiredText(config, "paramName", outputs)
                parseQueryParams(uri.rawQuery)[paramName].orEmpty()
            }

            else -> throw BadRequestException("getUrl.extract 不支持: $extract")
        }
        return StepExecutionResult(outputs = mapOf(saveAs to value), contextId = currentContextId())
    }

    private fun executeDownloadFile(stepConfig: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val url = resolveRequiredText(stepConfig, "url", outputs)
        val saveDir = resolveOptionalText(stepConfig, "saveDir", outputs)
        val fileName = resolveOptionalText(stepConfig, "fileName", outputs)
        val saveAs = resolveOptionalText(stepConfig, "saveAs", outputs)
        val timeoutMs = (resolveOptionalInt(stepConfig, "timeoutMs", outputs)?.toDouble() ?: config.defaultTimeoutMs)
        val tempPage = currentScope().context.newPage().also(::applyPageDefaults)

        try {
            val download = tempPage.waitForDownload(Page.WaitForDownloadOptions().setTimeout(timeoutMs)) {
                tempPage.navigate(url)
            }
            val actualFileName = fileName?.takeIf { it.isNotBlank() } ?: download.suggestedFilename()
            val targetDir = if (!saveDir.isNullOrBlank()) artifactRoot.resolve(saveDir) else artifactRoot
            Files.createDirectories(targetDir)
            val targetPath = targetDir.resolve(actualFileName)
            download.saveAs(targetPath)
            val artifact = buildArtifact(targetPath, actualFileName, "download")
            val outputMap = if (!saveAs.isNullOrBlank()) mapOf(saveAs to artifact.relativePath) else emptyMap()
            return StepExecutionResult(outputs = outputMap, artifacts = listOf(artifact), contextId = currentContextId())
        } catch (ex: Exception) {
            throw RunExecutionException("下载失败: ${ex.message}")
        } finally {
            runCatching { tempPage.close() }
        }
    }

    private fun executeImportText(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val path = resolveRequiredText(config, "path", outputs)
        val saveAs = resolveRequiredText(config, "saveAs", outputs)
        val filePath = resolveFilesystemPath(path)
        val lines = Files.readAllLines(filePath).filter { it.isNotBlank() }
        return StepExecutionResult(outputs = mapOf(saveAs to buildJsonArray {
            lines.forEach { add(JsonPrimitive(it)) }
        }.toString()), contextId = currentContextId())
    }

    private fun executeSaveData(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val content = resolveRequiredText(config, "content", outputs)
        val fileName = resolveRequiredText(config, "fileName", outputs)
        val saveDir = resolveOptionalText(config, "saveDir", outputs)
        val saveAs = resolveOptionalText(config, "saveAs", outputs)

        val targetDir = if (!saveDir.isNullOrBlank()) artifactRoot.resolve(saveDir) else artifactRoot
        Files.createDirectories(targetDir)

        val targetPath = targetDir.resolve(fileName.replace(Regex("[\\/:*?\"<>|]+"), "-").trim().ifBlank { "saved-data.txt" })
        try {
            Files.writeString(targetPath, content)
        } catch (ex: Exception) {
            throw RunExecutionException("保存数据失败: ${ex.message}")
        }

        val artifact = buildArtifact(targetPath, targetPath.fileName.toString(), "data")
        val outputMap = if (!saveAs.isNullOrBlank()) mapOf(saveAs to artifact.relativePath) else emptyMap()
        return StepExecutionResult(outputs = outputMap, artifacts = listOf(artifact), contextId = currentContextId())
    }

    private fun executeSaveExcel(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val inputVar = resolveRequiredText(config, "inputVar", outputs)
        val raw = outputs[inputVar]?.takeIf { it.isNotBlank() }
            ?: throw BadRequestException("saveExcel 输入变量不存在: $inputVar", mapOf("field" to "inputVar", "code" to ErrorCodes.DATA_STEP_CONFIG_INVALID))
        val fileName = resolveRequiredText(config, "fileName", outputs)
        val saveDir = resolveOptionalText(config, "saveDir", outputs)
        val sheetName = resolveOptionalText(config, "sheetName", outputs)?.takeIf { it.isNotBlank() } ?: "Sheet1"
        val saveAs = resolveOptionalText(config, "saveAs", outputs)

        val rows = parseExcelSourceRows(raw)
        val targetDir = if (!saveDir.isNullOrBlank()) artifactRoot.resolve(saveDir) else artifactRoot
        Files.createDirectories(targetDir)
        val targetPath = targetDir.resolve(safeFileName(fileName.removeSuffix(".xlsx"), "xlsx"))

        try {
            XSSFWorkbook().use { workbook ->
                val sheet = workbook.createSheet(sheetName)
                rows.forEachIndexed { rowIndex, values ->
                    val row = sheet.createRow(rowIndex)
                    values.forEachIndexed { cellIndex, value ->
                        row.createCell(cellIndex, CellType.STRING).setCellValue(value)
                    }
                }
                Files.newOutputStream(targetPath).use { outputStream ->
                    workbook.write(outputStream)
                }
            }
        } catch (ex: Exception) {
            throw RunExecutionException("保存 Excel 失败: ${ex.message}")
        }

        val artifact = buildArtifact(targetPath, targetPath.fileName.toString(), "excel")
        val outputMap = if (!saveAs.isNullOrBlank()) mapOf(saveAs to artifact.relativePath) else emptyMap()
        return StepExecutionResult(outputs = outputMap, artifacts = listOf(artifact), contextId = currentContextId())
    }

    private fun executeImportExcel(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val path = resolveRequiredText(config, "path", outputs)
        val sheetName = resolveOptionalText(config, "sheetName", outputs)
        val useHeader = resolveOptionalBoolean(config, "useHeader", outputs) ?: true
        val saveAs = resolveRequiredText(config, "saveAs", outputs)
        val formatter = DataFormatter()
        val filePath = resolveFilesystemPath(path)

        val serialized = try {
            WorkbookFactory.create(filePath.toFile()).use { workbook ->
                val sheet = if (!sheetName.isNullOrBlank()) {
                    workbook.getSheet(sheetName)
                        ?: throw BadRequestException("找不到工作表: $sheetName", mapOf("field" to "sheetName", "code" to ErrorCodes.DATA_STEP_CONFIG_INVALID))
                } else {
                    workbook.getSheetAt(0)
                }

                serializeSheetRows(sheet, formatter, useHeader)
            }
        } catch (ex: BadRequestException) {
            throw ex
        } catch (ex: Exception) {
            throw RunExecutionException("导入 Excel 失败: ${ex.message}")
        }

        return StepExecutionResult(outputs = mapOf(saveAs to serialized), contextId = currentContextId())
    }

    private fun executeExtractActiveElement(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val extractType = (resolveOptionalText(config, "extractType", outputs) ?: "value").lowercase()
        val saveAs = resolveRequiredText(config, "saveAs", outputs)
        val script = when (extractType) {
            "value" -> """
                () => {
                  const active = document.activeElement;
                  if (!active) return '';
                  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) {
                    return active.value ?? '';
                  }
                  return active.getAttribute('value') || active.textContent || '';
                }
            """.trimIndent()
            "text" -> "() => document.activeElement?.textContent || ''"
            "html" -> "() => document.activeElement?.outerHTML || ''"
            "tagname" -> "() => document.activeElement?.tagName?.toLowerCase() || ''"
            else -> throw BadRequestException("extractActiveElement.extractType 不支持: $extractType", mapOf("field" to "extractType", "code" to ErrorCodes.DATA_STEP_CONFIG_INVALID))
        }

        val result = currentPage().evaluate(script)?.toString() ?: ""
        return StepExecutionResult(outputs = mapOf(saveAs to result), contextId = currentContextId())
    }

    private fun executeGetClipboardText(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val saveAs = resolveRequiredText(config, "saveAs", outputs)
        val script =
            """
            async () => {
              if (!globalThis.navigator || !navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
                throw new Error('当前页面不支持读取剪贴板文本');
              }
              return await navigator.clipboard.readText();
            }
            """.trimIndent()

        val text = try {
            currentPage().evaluate(script)?.toString() ?: ""
        } catch (ex: Exception) {
            throw RunExecutionException("读取剪贴板失败: ${ex.message}")
        }
        return StepExecutionResult(outputs = mapOf(saveAs to text), contextId = currentContextId())
    }

    private fun parseExcelSourceRows(raw: String): List<List<String>> {
        val parsed = runCatching { json.parseToJsonElement(raw) }.getOrElse {
            throw BadRequestException("saveExcel 输入变量必须是 JSON 数组", mapOf("field" to "inputVar", "code" to ErrorCodes.DATA_STEP_CONFIG_INVALID))
        }
        val rows = parsed as? JsonArray
            ?: throw BadRequestException("saveExcel 输入变量必须是 JSON 数组", mapOf("field" to "inputVar", "code" to ErrorCodes.DATA_STEP_CONFIG_INVALID))
        if (rows.isEmpty()) {
            return listOf(emptyList())
        }

        val firstRow = rows.first()
        return when (firstRow) {
            is JsonObject -> {
                val headers = firstRow.keys.toList()
                buildList {
                    add(headers)
                    rows.forEach { row ->
                        val rowObject = row as? JsonObject
                            ?: throw BadRequestException("saveExcel 输入数组元素必须结构一致", mapOf("field" to "inputVar", "code" to ErrorCodes.DATA_STEP_CONFIG_INVALID))
                        add(headers.map { key -> jsonElementToCellText(rowObject[key]) })
                    }
                }
            }

            is JsonArray -> rows.map { row ->
                val rowArray = row as? JsonArray
                    ?: throw BadRequestException("saveExcel 输入数组元素必须结构一致", mapOf("field" to "inputVar", "code" to ErrorCodes.DATA_STEP_CONFIG_INVALID))
                rowArray.map { cell -> jsonElementToCellText(cell) }
            }

            else -> throw BadRequestException("saveExcel 输入变量必须是二维数组或对象数组", mapOf("field" to "inputVar", "code" to ErrorCodes.DATA_STEP_CONFIG_INVALID))
        }
    }

    private fun serializeSheetRows(sheet: org.apache.poi.ss.usermodel.Sheet, formatter: DataFormatter, useHeader: Boolean): String {
        val rowValues = sheet.map { row ->
            val lastCell = max(row.lastCellNum.toInt(), 0)
            (0 until lastCell).map { cellIndex ->
                formatter.formatCellValue(row.getCell(cellIndex))
            }
        }.filter { row -> row.any { cell -> cell.isNotBlank() } }

        if (rowValues.isEmpty()) {
            return "[]"
        }

        val serialized = if (useHeader) {
            val headers = rowValues.first().mapIndexed { index, value -> value.ifBlank { "column${index + 1}" } }
            buildJsonArray {
                rowValues.drop(1).forEach { row ->
                    add(buildJsonObject {
                        headers.forEachIndexed { index, key ->
                            put(key, JsonPrimitive(row.getOrElse(index) { "" }))
                        }
                    })
                }
            }
        } else {
            buildJsonArray {
                rowValues.forEach { row ->
                    add(buildJsonArray {
                        row.forEach { cell -> add(JsonPrimitive(cell)) }
                    })
                }
            }
        }
        return serialized.toString()
    }

    private fun jsonElementToCellText(element: JsonElement?): String {
        return when (element) {
            null -> ""
            is JsonPrimitive -> element.contentOrNull ?: ""
            else -> element.toString()
        }
    }

    private fun executeTotp(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val secret = resolveRequiredText(config, "secret", outputs)
        val saveAs = resolveRequiredText(config, "saveAs", outputs)
        return StepExecutionResult(outputs = mapOf(saveAs to generateTotp(secret)), contextId = currentContextId())
    }

    private fun executeGetCookies(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val saveAs = resolveRequiredText(config, "saveAs", outputs)
        val serialized = buildJsonArray {
            currentScope().context.cookies().forEach { cookie ->
                add(buildJsonObject {
                    put("name", JsonPrimitive(cookie.name))
                    put("value", JsonPrimitive(cookie.value))
                    put("domain", JsonPrimitive(cookie.domain))
                    put("path", JsonPrimitive(cookie.path))
                })
            }
        }.toString()
        return StepExecutionResult(outputs = mapOf(saveAs to serialized), contextId = currentContextId())
    }

    private fun executeClearCookies(): StepExecutionResult {
        currentScope().context.clearCookies()
        return StepExecutionResult(contextId = currentContextId())
    }

    private fun executeConvertJson(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val value = resolveRequiredText(config, "value", outputs)
        val direction = resolveOptionalText(config, "direction", outputs) ?: "parse"
        val saveAs = resolveRequiredText(config, "saveAs", outputs)
        val converted = convertJsonValue(value, direction)
        return StepExecutionResult(outputs = mapOf(saveAs to converted), contextId = currentContextId())
    }

    private fun executeExtractKey(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val inputVar = resolveRequiredText(config, "inputVar", outputs)
        val keyPath = resolveRequiredText(config, "keyPath", outputs)
        val saveAs = resolveRequiredText(config, "saveAs", outputs)
        val raw = outputs[inputVar]
            ?: throw BadRequestException("未找到变量: $inputVar", mapOf("field" to "inputVar", "code" to ErrorCodes.DATA_STEP_CONFIG_INVALID))
        val extracted = extractJsonKey(raw, keyPath)
        return StepExecutionResult(outputs = mapOf(saveAs to extracted), contextId = currentContextId())
    }

    private fun executeRandomGet(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val inputVar = resolveRequiredText(config, "inputVar", outputs)
        val saveAs = resolveRequiredText(config, "saveAs", outputs)
        val raw = outputs[inputVar]
            ?: throw BadRequestException("未找到变量: $inputVar", mapOf("field" to "inputVar", "code" to ErrorCodes.DATA_STEP_CONFIG_INVALID))
        val selected = randomGetFromJsonArray(raw)
        return StepExecutionResult(outputs = mapOf(saveAs to selected), contextId = currentContextId())
    }

    private fun executeKeyboardPress(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val key = resolveRequiredText(config, "key", outputs)
        currentPage().keyboard().press(normalizeKeyboardKey(key))
        return StepExecutionResult(pageAlias = currentPageAlias(), contextId = currentContextId())
    }

    private fun executeKeyboardHotkey(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val modifiers = resolveStringList(config, "modifiers", outputs)
        val key = resolveRequiredText(config, "key", outputs)
        val parts = modifiers.map(::normalizeKeyboardModifier) + normalizeKeyboardKey(key)
        currentPage().keyboard().press(parts.joinToString("+"))
        return StepExecutionResult(pageAlias = currentPageAlias(), contextId = currentContextId())
    }

    private fun executeTextExtract(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val input = resolveRequiredText(config, "input", outputs)
        val pattern = resolveRequiredText(config, "pattern", outputs)
        val groupIndex = resolveOptionalInt(config, "groupIndex", outputs) ?: 0
        val global = resolveOptionalBoolean(config, "global", outputs) ?: false
        val saveAs = resolveRequiredText(config, "saveAs", outputs)
        val regex = runCatching { Regex(pattern) }.getOrElse {
            throw BadRequestException(
                "textExtract.pattern 非法: ${it.message}",
                mapOf("field" to "pattern", "code" to ErrorCodes.TEXT_EXTRACT_CONFIG_INVALID)
            )
        }

        val value = if (global) {
            val matches: List<String> = regex.findAll(input).map { match ->
                requireTextExtractGroup(match.groups.size, groupIndex)
                match.groups[groupIndex]?.value.orEmpty()
            }.toList()
            buildJsonArray { matches.forEach { add(JsonPrimitive(it)) } }.toString()
        } else {
            val match = regex.find(input)
                ?: throw BadRequestException(
                    "textExtract 未匹配到结果",
                    mapOf("field" to "pattern", "code" to ErrorCodes.TEXT_EXTRACT_CONFIG_INVALID)
                )
            requireTextExtractGroup(match.groups.size, groupIndex)
            match.groups[groupIndex]?.value.orEmpty()
        }

        return StepExecutionResult(outputs = mapOf(saveAs to value), contextId = currentContextId())
    }

    private fun requireTextExtractGroup(groupCount: Int, groupIndex: Int) {
        if (groupIndex < 0 || groupIndex >= groupCount) {
            throw BadRequestException(
                "textExtract.groupIndex 越界: $groupIndex",
                mapOf("field" to "groupIndex", "code" to ErrorCodes.TEXT_EXTRACT_CONFIG_INVALID)
            )
        }
    }

    private fun executeGoBack(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val timeoutMs = resolveOptionalInt(config, "timeoutMs", outputs)?.toDouble()
        if (timeoutMs != null) {
            currentPage().goBack(Page.GoBackOptions().setTimeout(timeoutMs))
        } else {
            currentPage().goBack()
        }
        return StepExecutionResult(pageAlias = currentPageAlias(), contextId = currentContextId())
    }

    private fun executeCloseOtherPages(config: JsonObject, outputs: MutableMap<String, String>): StepExecutionResult {
        val scope = currentScope()
        val keep = (resolveOptionalText(config, "keep", outputs) ?: "current").lowercase()
        val keepPage = when (keep) {
            "current" -> scope.currentPage
            "alias" -> {
                val alias = resolveRequiredText(config, "pageAlias", outputs)
                scope.pageAliases[alias]
                    ?: throw BadRequestException(
                        "未找到页面别名: $alias",
                        mapOf("field" to "pageAlias", "code" to ErrorCodes.PAGE_STEP_CONFIG_INVALID)
                    )
            }

            else -> throw BadRequestException(
                "closeOtherPages.keep 不支持: $keep",
                mapOf("field" to "keep", "code" to ErrorCodes.PAGE_STEP_CONFIG_INVALID)
            )
        }

        val pagesToClose = scope.pages.filter { it != keepPage }
        pagesToClose.forEach { page ->
            removePage(scope, page)
            runCatching { page.close() }
        }
        if (keepPage !in scope.pages) {
            scope.pages.add(keepPage)
        }
        scope.currentPage = keepPage
        return StepExecutionResult(pageAlias = findAlias(scope, keepPage), contextId = currentContextId())
    }

    private fun executeCloseBrowser(): StepExecutionResult {
        val closedContextId = currentContextId()
        closeCurrentScopeAndReplace()
        return StepExecutionResult(contextId = closedContextId)
    }

    private fun resolveActionLocator(config: JsonObject, outputs: MutableMap<String, String>): Locator {
        val target = resolveElementTarget(config, outputs)
        val baseLocator = currentPage().locator(target.selector)
        val count = baseLocator.count()
        if (count <= 0) {
            return baseLocator.first()
        }
        val index = resolveIndices(count, target.order, iterateAllByDefault = false).first()
        return baseLocator.nth(index)
    }

    private fun resolveElementTarget(config: JsonObject, outputs: MutableMap<String, String>): ElementTarget {
        val directOrder = config["elementOrder"]?.jsonObject
        val refVar = resolveOptionalText(config, "elementRefVar", outputs)
        if (!refVar.isNullOrBlank()) {
            val raw = outputs[refVar]
                ?: throw BadRequestException("未找到元素引用变量: $refVar", mapOf("field" to "elementRefVar"))
            val parsed = runCatching { json.parseToJsonElement(raw).jsonObject }.getOrElse {
                throw BadRequestException("元素引用变量格式非法: $refVar")
            }
            val refSelector = parsed["selector"]?.jsonPrimitive?.content
                ?: throw BadRequestException("元素引用变量缺少 selector: $refVar")
            return ElementTarget(refSelector, directOrder ?: parsed["elementOrder"]?.jsonObject)
        }

        val selector = resolveOptionalText(config, "selector", outputs)
        if (!selector.isNullOrBlank()) {
            return ElementTarget(selector, directOrder)
        }

        throw BadRequestException("缺少 selector 或 elementRefVar", mapOf("code" to ErrorCodes.ELEMENT_TARGET_INVALID))
    }

    private fun resolveIndices(count: Int, order: JsonObject?, iterateAllByDefault: Boolean): List<Int> {
        if (count <= 0) return emptyList()
        if (order == null) {
            return if (iterateAllByDefault) (0 until count).toList() else listOf(0)
        }

        val mode = (order["type"]?.jsonPrimitive?.contentOrNull ?: order["mode"]?.jsonPrimitive?.contentOrNull)?.lowercase()
            ?: return if (iterateAllByDefault) {
            (0 until count).toList()
        } else {
            listOf(0)
        }

        return when (mode) {
            "first" -> listOf(0)

            "last" -> listOf(count - 1)

            "index", "fixed" -> {
                val index = order["index"]?.jsonPrimitive?.intOrNull
                    ?: throw BadRequestException(
                        "elementOrder.index 不能为空",
                        mapOf("field" to "elementOrder.index", "code" to ErrorCodes.ELEMENT_ORDER_INVALID)
                    )
                listOf(index.coerceIn(0, count - 1))
            }

            "random" -> listOf(Random.nextInt(0, count))

            "fixed" -> {
                val index = order["index"]?.jsonPrimitive?.intOrNull ?: 0
                listOf(index.coerceIn(0, count - 1))
            }

            "randomrange" -> {
                val minIndex = (order["min"]?.jsonPrimitive?.intOrNull ?: 0).coerceIn(0, count - 1)
                val maxIndex = (order["max"]?.jsonPrimitive?.intOrNull ?: count - 1).coerceIn(0, count - 1)
                val start = min(minIndex, maxIndex)
                val end = max(minIndex, maxIndex)
                if (iterateAllByDefault) {
                    (start..end).toList()
                } else {
                    listOf(Random.nextInt(start, end + 1))
                }
            }

            else -> if (iterateAllByDefault) (0 until count).toList() else listOf(0)
        }
    }

    private fun normalizeKeyboardModifier(value: String): String {
        return when (value.trim().lowercase()) {
            "control", "ctrl" -> "Control"
            "meta", "cmd", "command" -> "Meta"
            "shift" -> "Shift"
            "alt", "option" -> "Alt"
            else -> throw BadRequestException(
                "不支持的修饰键: $value",
                mapOf("field" to "modifiers", "code" to ErrorCodes.KEYBOARD_STEP_CONFIG_INVALID)
            )
        }
    }

    private fun normalizeKeyboardKey(value: String): String {
        return when (value.trim().lowercase()) {
            "backspace" -> "Backspace"
            "tab" -> "Tab"
            "enter" -> "Enter"
            "space", "spacebar" -> "Space"
            "escape", "esc" -> "Escape"
            "delete", "del" -> "Delete"
            "arrowup", "up" -> "ArrowUp"
            "arrowdown", "down" -> "ArrowDown"
            "arrowleft", "left" -> "ArrowLeft"
            "arrowright", "right" -> "ArrowRight"
            else -> value.trim().takeIf { it.isNotBlank() } ?: throw BadRequestException(
                "key 不能为空",
                mapOf("field" to "key", "code" to ErrorCodes.KEYBOARD_STEP_CONFIG_INVALID)
            )
        }
    }

    private fun resolveTypeText(step: StepNode, outputs: MutableMap<String, String>): String {
        val config = step.data.config
        val contentMode = (resolveOptionalText(config, "contentMode", outputs) ?: "fixed").lowercase()
        return when (contentMode) {
            "fixed" -> resolveOptionalText(config, "text", outputs)
                ?: resolveStringList(config, "contents", outputs).firstOrNull()
                ?: ""

            "usevar" -> {
                val varName = resolveRequiredText(config, "varName", outputs)
                outputs[varName].orEmpty()
            }

            "random" -> {
                val items = resolveStringList(config, "contents", outputs)
                if (items.isEmpty()) "" else items.random()
            }

            "sequence" -> {
                val items = resolveStringList(config, "contents", outputs)
                if (items.isEmpty()) {
                    ""
                } else {
                    val current = sequenceState.getOrDefault(step.id, 0)
                    sequenceState[step.id] = current + 1
                    items[current % items.size]
                }
            }

            "randomnumber" -> {
                val minValue = resolveOptionalInt(config, "randomMin", outputs) ?: 0
                val maxValue = resolveOptionalInt(config, "randomMax", outputs) ?: 100
                Random.nextInt(min(minValue, maxValue), max(minValue, maxValue) + 1).toString()
            }

            else -> resolveRequiredText(config, "text", outputs)
        }
    }

    private fun createScope(): ContextScope {
        val context = browser.newContext(
            Browser.NewContextOptions().setPermissions(
                listOf("clipboard-read", "clipboard-write")
            )
        )
        val page = context.newPage().also(::applyPageDefaults)
        return ContextScope(
            id = newId(),
            context = context,
            pages = mutableListOf(page),
            pageAliases = mutableMapOf(),
            currentPage = page
        )
    }

    private fun currentScope(): ContextScope = contextStack.last()

    private fun currentPage(): Page = currentScope().currentPage

    private fun applyPageDefaults(page: Page) {
        page.setDefaultTimeout(config.defaultTimeoutMs)
    }

    private fun closeCurrentScopeAndReplace() {
        val current = contextStack.removeAt(contextStack.lastIndex)
        closeScope(current)
        contextStack.add(createScope())
    }

    private fun closeScope(scope: ContextScope) {
        scope.pages.forEach(::stopRequestListenersForPage)
        scope.pages.forEach { page -> runCatching { page.close() } }
        runCatching { scope.context.close() }
    }

    private fun removePage(scope: ContextScope, page: Page) {
        scope.pages.remove(page)
        scope.pageAliases.entries.removeIf { it.value == page }
    }

    private fun findAlias(scope: ContextScope, page: Page): String? {
        return scope.pageAliases.entries.firstOrNull { it.value == page }?.key
    }

    private fun stopRequestListenersForPage(page: Page) {
        requestListeners.values
            .filter { it.page == page }
            .map { it.listenerId }
            .forEach(::stopRequestListener)
    }

    private fun stopRequestListener(listenerId: String) {
        val state = requestListeners.remove(listenerId) ?: return
        state.deactivate()
        runCatching { state.page.offRequest(state.requestHandler) }
        runCatching { state.page.offResponse(state.responseHandler) }
        runCatching { state.page.offRequestFailed(state.requestFailedHandler) }
    }

    private fun buildArtifact(path: Path, name: String, kind: String): RunArtifact {
        val normalizedPath = path.normalize().toString().replace('\\', '/')
        return RunArtifact(
            artifactId = newId(),
            name = name,
            kind = kind,
            relativePath = normalizedPath,
            createdAt = nowIso()
        )
    }

    private fun downloadSupportFile(url: String): Path {
        val tempDir = artifactRoot.resolve("uploads-temp")
        Files.createDirectories(tempDir)
        val targetPath = tempDir.resolve(safeFileName("upload-${System.currentTimeMillis()}", "tmp"))
        URI(url).toURL().openStream().use { input ->
            Files.copy(input, targetPath)
        }
        return targetPath
    }

    private fun resolveFilesystemPath(raw: String): Path {
        val path = Paths.get(raw)
        return if (path.isAbsolute) path else Paths.get("").resolve(path).normalize()
    }

    private fun safeFileName(name: String, extension: String): String {
        val cleaned = name.replace(Regex("[\\\\/:*?\"<>|]+"), "-").trim().ifBlank { "artifact" }
        return if (cleaned.endsWith(".$extension")) cleaned else "$cleaned.$extension"
    }

    private fun matchesText(actual: String, expected: String, matchType: String): Boolean {
        return when (matchType) {
            "equals" -> actual == expected
            else -> actual.contains(expected)
        }
    }

    private fun parseQueryParams(query: String?): Map<String, String> {
        if (query.isNullOrBlank()) return emptyMap()
        return query.split('&')
            .mapNotNull { pair ->
                val segments = pair.split('=', limit = 2)
                if (segments.isEmpty()) return@mapNotNull null
                val key = segments[0]
                val value = segments.getOrElse(1) { "" }
                key to value
            }
            .toMap()
    }

    private fun serializeJsValue(value: Any?): String {
        return when (value) {
            null -> ""
            is String -> value
            is Number, is Boolean -> value.toString()
            else -> value.toString()
        }
    }

    private fun generateTotp(secret: String): String {
        val normalized = secret.replace("=", "").uppercase()
        val key = decodeBase32(normalized)
        val counter = System.currentTimeMillis() / 1000 / 30
        val data = ByteArray(8)
        for (index in 7 downTo 0) {
            data[index] = (counter shr (8 * (7 - index))).toByte()
        }
        val mac = Mac.getInstance("HmacSHA1")
        mac.init(SecretKeySpec(key, "HmacSHA1"))
        val hash = mac.doFinal(data)
        val offset = hash.last().toInt() and 0x0f
        val binary = ((hash[offset].toInt() and 0x7f) shl 24) or
            ((hash[offset + 1].toInt() and 0xff) shl 16) or
            ((hash[offset + 2].toInt() and 0xff) shl 8) or
            (hash[offset + 3].toInt() and 0xff)
        val otp = binary % 1_000_000
        return otp.toString().padStart(6, '0')
    }

    private fun decodeBase32(input: String): ByteArray {
        val alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
        var buffer = 0
        var bitsLeft = 0
        val output = mutableListOf<Byte>()
        input.forEach { ch ->
            val value = alphabet.indexOf(ch)
            if (value < 0) {
                throw BadRequestException("TOTP secret 非法")
            }
            buffer = (buffer shl 5) or value
            bitsLeft += 5
            if (bitsLeft >= 8) {
                output.add(((buffer shr (bitsLeft - 8)) and 0xff).toByte())
                bitsLeft -= 8
            }
        }
        return output.toByteArray()
    }
}