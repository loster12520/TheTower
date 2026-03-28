package com.thetower.executor

import com.microsoft.playwright.Browser
import com.microsoft.playwright.BrowserContext
import com.microsoft.playwright.Download
import com.microsoft.playwright.Locator
import com.microsoft.playwright.Page
import com.microsoft.playwright.PlaywrightException
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
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.math.max
import kotlin.math.min
import kotlin.random.Random
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
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

    private val json = Json { ignoreUnknownKeys = true }
    private val contextStack = mutableListOf(createScope())
    private val retainedContexts = mutableListOf<ContextScope>()
    private val sequenceState = mutableMapOf<String, Int>()
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
            "getUrl" -> executeGetUrl(step.data.config, outputs)
            "downloadFile" -> executeDownloadFile(step.data.config, outputs)
            "importText" -> executeImportText(step.data.config, outputs)
            "totp" -> executeTotp(step.data.config, outputs)
            "getCookies" -> executeGetCookies(step.data.config, outputs)
            "clearCookies" -> executeClearCookies()
            "closeBrowser" -> executeCloseBrowser()
            "convertJson" -> executeConvertJson(step.data.config, outputs)
            "extractKey" -> executeExtractKey(step.data.config, outputs)
            "randomGet" -> executeRandomGet(step.data.config, outputs)
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
        val selector = resolveOptionalText(config, "selector", outputs)
        val directOrder = config["elementOrder"]?.jsonObject
        if (!selector.isNullOrBlank()) {
            return ElementTarget(selector, directOrder)
        }

        val refVar = resolveOptionalText(config, "elementRefVar", outputs)
            ?: throw BadRequestException("缺少 selector 或 elementRefVar", mapOf("code" to ErrorCodes.ELEMENT_TARGET_INVALID))
        val raw = outputs[refVar]
            ?: throw BadRequestException("未找到元素引用变量: $refVar", mapOf("field" to "elementRefVar"))
        val parsed = runCatching { json.parseToJsonElement(raw).jsonObject }.getOrElse {
            throw BadRequestException("元素引用变量格式非法: $refVar")
        }
        val refSelector = parsed["selector"]?.jsonPrimitive?.content
            ?: throw BadRequestException("元素引用变量缺少 selector: $refVar")
        return ElementTarget(refSelector, directOrder ?: parsed["elementOrder"]?.jsonObject)
    }

    private fun resolveIndices(count: Int, order: JsonObject?, iterateAllByDefault: Boolean): List<Int> {
        if (count <= 0) return emptyList()
        if (order == null) {
            return if (iterateAllByDefault) (0 until count).toList() else listOf(0)
        }

        val mode = order["mode"]?.jsonPrimitive?.contentOrNull?.lowercase() ?: return if (iterateAllByDefault) {
            (0 until count).toList()
        } else {
            listOf(0)
        }

        return when (mode) {
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
        val context = browser.newContext()
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