package com.thetower.services

import com.thetower.models.StepNode
import com.thetower.utils.InvalidStepConfigException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.encodeToJsonElement

import kotlinx.serialization.json.buildJsonObject
private val stepTreeJson = Json { ignoreUnknownKeys = true }
private val variablePattern = Regex("\\$\\{([a-zA-Z_][a-zA-Z0-9_]*)}")

internal class LoopBreakSignal : RuntimeException(null, null, false, false)

internal fun countStepsRecursively(steps: List<StepNode>): Int {
    return steps.sumOf { step ->
        1 + when (step.type) {
            "if" -> getBranchSteps(step.data.config, "then").let { thenSteps ->
                thenSteps.size + countChildren(thenSteps) + getBranchSteps(step.data.config, "else").let { elseSteps ->
                    elseSteps.size + countChildren(elseSteps)
                }
            }

            "forEachElement", "forTimes", "forEachData", "while", "startBrowser" -> {
                val bodySteps = getBranchSteps(step.data.config, "body")
                bodySteps.size + countChildren(bodySteps)
            }

            else -> 0
        }
    }
}

private fun countChildren(steps: List<StepNode>): Int = steps.sumOf { step ->
    when (step.type) {
        "if" -> {
            val thenSteps = getBranchSteps(step.data.config, "then")
            val elseSteps = getBranchSteps(step.data.config, "else")
            thenSteps.size + countChildren(thenSteps) + elseSteps.size + countChildren(elseSteps)
        }

        "forEachElement", "forTimes", "forEachData", "while", "startBrowser" -> {
            val bodySteps = getBranchSteps(step.data.config, "body")
            bodySteps.size + countChildren(bodySteps)
        }

        else -> 0
    }
}

internal fun validateStepTree(steps: List<StepNode>, loopDepth: Int = 0) {
    steps.forEach { step ->
        when (step.type) {
            "if" -> {
                val thenSteps = getRequiredBranchSteps(step, "then")
                if (thenSteps.isEmpty()) {
                    throw InvalidStepConfigException("if.then 不能为空", mapOf("stepId" to step.id, "field" to "then"))
                }
                validateStepTree(thenSteps, loopDepth)
                validateStepTree(getBranchSteps(step.data.config, "else"), loopDepth)
            }

            "forEachElement" -> {
                validateNonBlankText(step, "itemVar")
                validateSelectorOrElementRef(step)
                val extractType = step.data.config["extractType"]?.jsonPrimitive?.contentOrNull?.lowercase()
                if (extractType == "attribute") {
                    validateNonBlankText(step, "attributeName")
                }
                val bodySteps = getRequiredBranchSteps(step, "body")
                if (bodySteps.isEmpty()) {
                    throw InvalidStepConfigException("forEachElement.body 不能为空", mapOf("stepId" to step.id, "field" to "body"))
                }
                validateStepTree(bodySteps, loopDepth + 1)
            }

            "forTimes" -> {
                val times = step.data.config["times"]?.jsonPrimitive?.intOrNull
                if (times == null || times <= 0) {
                    throw InvalidStepConfigException("forTimes.times 必须为正整数", mapOf("stepId" to step.id, "field" to "times"))
                }
                validateStepTree(getRequiredBranchSteps(step, "body"), loopDepth + 1)
            }

            "forEachData" -> {
                validateNonBlankText(step, "dataVar")
                validateNonBlankText(step, "itemVar")
                val bodySteps = getRequiredBranchSteps(step, "body")
                if (bodySteps.isEmpty()) {
                    throw InvalidStepConfigException("forEachData.body 不能为空", mapOf("stepId" to step.id, "field" to "body"))
                }
                validateStepTree(bodySteps, loopDepth + 1)
            }

            "startBrowser" -> {
                validateEnum(step, "onError", setOf("skip", "abort"))
                validateEnum(step, "onComplete", setOf("keep", "close"))
                validateStepTree(getRequiredBranchSteps(step, "body"), loopDepth + 1)
            }

            "while" -> {
                val maxIterations = step.data.config["maxIterations"]?.jsonPrimitive?.intOrNull
                if (maxIterations == null || maxIterations <= 0) {
                    throw InvalidStepConfigException(
                        "while.maxIterations 必须为正整数",
                        mapOf("stepId" to step.id, "field" to "maxIterations")
                    )
                }
                validateStepTree(getRequiredBranchSteps(step, "body"), loopDepth + 1)
            }

            "break" -> {
                if (loopDepth <= 0) {
                    throw InvalidStepConfigException("break 仅允许出现在循环体内", mapOf("stepId" to step.id))
                }
            }

            "callWorkflow" -> {
                validateNonBlankText(step, "workflowId")
                val inputMapping = step.data.config["inputMapping"]
                if (inputMapping != null && inputMapping !is JsonObject) {
                    throw InvalidStepConfigException("callWorkflow.inputMapping 必须为对象", mapOf("stepId" to step.id, "field" to "inputMapping"))
                }
            }

            "convertJson" -> {
                validateNonBlankText(step, "value")
                validateNonBlankText(step, "saveAs")
                validateEnum(step, "direction", setOf("parse", "stringify"))
            }

            "extractKey" -> {
                validateNonBlankText(step, "inputVar")
                validateNonBlankText(step, "keyPath")
                validateNonBlankText(step, "saveAs")
            }

            "randomGet" -> {
                validateNonBlankText(step, "inputVar")
                validateNonBlankText(step, "saveAs")
            }
        }
    }
}

internal fun extractReferencedWorkflowIds(steps: List<StepNode>): Set<String> {
    val workflowIds = linkedSetOf<String>()

    fun collect(nodes: List<StepNode>) {
        nodes.forEach { step ->
            if (step.type == "callWorkflow") {
                step.data.config["workflowId"]?.jsonPrimitive?.contentOrNull?.trim()
                    ?.takeIf { it.isNotEmpty() }
                    ?.let(workflowIds::add)
            }
            when (step.type) {
                "if" -> {
                    collect(getBranchSteps(step.data.config, "then"))
                    collect(getBranchSteps(step.data.config, "else"))
                }

                "forEachElement", "forTimes", "forEachData", "while", "startBrowser" -> {
                    collect(getBranchSteps(step.data.config, "body"))
                }
            }
        }
    }

    collect(steps)
    return workflowIds
}

private fun validateNonBlankText(step: StepNode, field: String) {
    val value = step.data.config[field]?.jsonPrimitive?.contentOrNull?.trim()
    if (value.isNullOrEmpty()) {
        throw InvalidStepConfigException("${step.type}.$field 不能为空", mapOf("stepId" to step.id, "field" to field))
    }
}

private fun validateSelectorOrElementRef(step: StepNode) {
    val selector = step.data.config["selector"]?.jsonPrimitive?.contentOrNull?.trim()
    val elementRefVar = step.data.config["elementRefVar"]?.jsonPrimitive?.contentOrNull?.trim()
    if (selector.isNullOrEmpty() && elementRefVar.isNullOrEmpty()) {
        throw InvalidStepConfigException(
            "${step.type} 必须提供 selector 或 elementRefVar",
            mapOf("stepId" to step.id, "field" to "selector")
        )
    }
}

private fun validateEnum(step: StepNode, field: String, allowedValues: Set<String>) {
    val value = step.data.config[field]?.jsonPrimitive?.contentOrNull?.trim()?.lowercase() ?: return
    if (value !in allowedValues) {
        throw InvalidStepConfigException(
            "${step.type}.$field 不支持: $value",
            mapOf("stepId" to step.id, "field" to field)
        )
    }
}

internal fun evaluateCondition(config: JsonObject, outputs: Map<String, String>): Boolean {
    val condition = config["condition"]?.jsonObject
        ?: throw InvalidStepConfigException("缺少 condition 配置", mapOf("field" to "condition"))

    val left = resolveConditionValue(condition["left"], outputs)
    val op = condition["op"]?.jsonPrimitive?.content
        ?: throw InvalidStepConfigException("缺少 condition.op 配置", mapOf("field" to "condition.op"))
    val right = resolveConditionValue(condition["right"], outputs)

    return when (op) {
        "exists" -> !left.isNullOrBlank()
        "notExists" -> left.isNullOrBlank()
        "contains" -> (left ?: "").contains(right ?: "")
        "notContains" -> !(left ?: "").contains(right ?: "")
        "equals" -> (left ?: "") == (right ?: "")
        "notEquals" -> (left ?: "") != (right ?: "")
        "lt" -> compareNumeric(left, right) < 0
        "lte" -> compareNumeric(left, right) <= 0
        "gt" -> compareNumeric(left, right) > 0
        "gte" -> compareNumeric(left, right) >= 0
        else -> throw InvalidStepConfigException("不支持的 condition.op: $op", mapOf("field" to "condition.op"))
    }
}

internal fun resolveTextTemplate(raw: String?, outputs: Map<String, String>): String? {
    if (raw == null) return null
    return variablePattern.replace(raw) { match ->
        outputs[match.groupValues[1]] ?: ""
    }
}

internal fun getBranchSteps(config: JsonObject, field: String): List<StepNode> {
    val branchElement = config[field] ?: return emptyList()
    return decodeStepList(branchElement, field)
}

internal fun getRequiredBranchSteps(step: StepNode, field: String): List<StepNode> {
    val branchElement = step.data.config[field]
        ?: throw InvalidStepConfigException("缺少 $field 子步骤", mapOf("stepId" to step.id, "field" to field))
    return decodeStepList(branchElement, field)
}

internal fun resolveIntConfig(config: JsonObject, field: String, outputs: Map<String, String>): Int {
    val element = config[field]
        ?: throw InvalidStepConfigException("缺少必要参数: $field", mapOf("field" to field))

    val primitive = element as? JsonPrimitive
        ?: throw InvalidStepConfigException("参数类型非法: $field", mapOf("field" to field))

    primitive.intOrNull?.let { return it }
    val resolved = resolveTextTemplate(primitive.content, outputs)?.trim()
    return resolved?.toIntOrNull()
        ?: throw InvalidStepConfigException("参数必须为整数: $field", mapOf("field" to field))
}

internal fun resolveOptionalText(config: JsonObject, field: String, outputs: Map<String, String>): String? {
    val raw = config[field]?.jsonPrimitive?.contentOrNull ?: return null
    return resolveTextTemplate(raw, outputs)
}

internal fun resolveRequiredText(config: JsonObject, field: String, outputs: Map<String, String>): String {
    return resolveOptionalText(config, field, outputs)
        ?.takeIf { it.isNotBlank() }
        ?: throw InvalidStepConfigException("缺少必要参数: $field", mapOf("field" to field))
}

internal fun resolveOptionalBoolean(config: JsonObject, field: String, outputs: Map<String, String>): Boolean? {
    val element = config[field] ?: return null
    val primitive = element as? JsonPrimitive
        ?: throw InvalidStepConfigException("参数类型非法: $field", mapOf("field" to field))

    primitive.booleanOrNull?.let { return it }
    val resolved = resolveTextTemplate(primitive.contentOrNull, outputs)?.trim()?.lowercase() ?: return null
    return when (resolved) {
        "true", "1", "yes" -> true
        "false", "0", "no" -> false
        else -> throw InvalidStepConfigException("参数必须为布尔值: $field", mapOf("field" to field))
    }
}

internal fun resolveOptionalInt(config: JsonObject, field: String, outputs: Map<String, String>): Int? {
    val element = config[field] ?: return null
    val primitive = element as? JsonPrimitive
        ?: throw InvalidStepConfigException("参数类型非法: $field", mapOf("field" to field))

    primitive.intOrNull?.let { return it }
    val resolved = resolveTextTemplate(primitive.contentOrNull, outputs)?.trim() ?: return null
    return resolved.toIntOrNull()
        ?: throw InvalidStepConfigException("参数必须为整数: $field", mapOf("field" to field))
}

internal fun resolveStringList(config: JsonObject, field: String, outputs: Map<String, String>): List<String> {
    val element = config[field] ?: return emptyList()
    return when (element) {
        is JsonPrimitive -> {
            resolveTextTemplate(element.contentOrNull, outputs)
                ?.split(',')
                ?.map { it.trim() }
                ?.filter { it.isNotBlank() }
                ?: emptyList()
        }

        else -> element.jsonArray.mapNotNull { item ->
            val primitive = item as? JsonPrimitive ?: return@mapNotNull null
            resolveTextTemplate(primitive.contentOrNull, outputs)?.takeIf { it.isNotBlank() }
        }
    }
}

internal fun resolveSerializedList(raw: String): List<String> {
    val parsed = runCatching { stepTreeJson.parseToJsonElement(raw) }.getOrNull() ?: return listOf(raw)
    return when (parsed) {
        is JsonPrimitive -> listOf(parsed.content)
        else -> parsed.jsonArray.mapNotNull { element ->
            val primitive = element as? JsonPrimitive ?: return@mapNotNull element.toString()
            primitive.contentOrNull ?: element.toString()
        }
    }
}

internal fun serializeStringList(items: List<String>): String {
    return buildJsonArray {
        items.forEach { add(JsonPrimitive(it)) }
    }.toString()
}

internal fun applyWorkflowInputMapping(
    config: JsonObject,
    parentOutputs: Map<String, String>,
    baseOutputs: MutableMap<String, String>
) {
    val mapping = config["inputMapping"] as? JsonObject ?: return
    mapping.forEach { (targetKey, value) ->
        val raw = value.jsonPrimitive.contentOrNull ?: value.toString()
        baseOutputs[targetKey] = when {
            raw in parentOutputs -> parentOutputs[raw].orEmpty()
            else -> resolveTextTemplate(raw, parentOutputs) ?: ""
        }
    }
}

internal fun buildWorkflowOutputDelta(parentOutputs: Map<String, String>, childOutputs: Map<String, String>): Map<String, String> {
    return childOutputs.filter { (key, value) -> parentOutputs[key] != value }
}

internal fun serializeWorkflowOutput(delta: Map<String, String>): String {
    return buildJsonObject {
        delta.forEach { (key, value) ->
            put(key, JsonPrimitive(value))
        }
    }.toString()
}

internal fun workflowCallDepth(stepPath: List<String>): Int = stepPath.count { it == "callWorkflow" }

internal fun convertJsonValue(raw: String, direction: String): String {
    return when (direction.lowercase()) {
        "parse" -> stepTreeJson.parseToJsonElement(raw).toString()
        "stringify" -> stepTreeJson.encodeToJsonElement(raw).toString()
        else -> throw InvalidStepConfigException("convertJson.direction 不支持: $direction", mapOf("field" to "direction"))
    }
}

internal fun extractJsonKey(raw: String, keyPath: String): String {
    val root = stepTreeJson.parseToJsonElement(raw)
    val tokens = parseKeyPath(keyPath)
    val resolved = tokens.fold(root) { current, token ->
        when (token) {
            is PathToken.Property -> {
                val value = current.jsonObject[token.name]
                    ?: throw InvalidStepConfigException("extractKey 未找到 keyPath: $keyPath", mapOf("field" to "keyPath"))
                value
            }

            is PathToken.Index -> {
                val array = current.jsonArray
                array.getOrNull(token.index)
                    ?: throw InvalidStepConfigException("extractKey 索引越界: $keyPath", mapOf("field" to "keyPath"))
            }
        }
    }
    return serializeJsonLeaf(resolved)
}

internal fun randomGetFromJsonArray(raw: String, randomIndex: Int? = null): String {
    val array = stepTreeJson.parseToJsonElement(raw).jsonArray
    if (array.isEmpty()) {
        throw InvalidStepConfigException("randomGet 输入数组不能为空", mapOf("field" to "inputVar"))
    }
    val index = randomIndex ?: kotlin.random.Random.nextInt(array.size)
    return serializeJsonLeaf(array[index])
}

private sealed interface PathToken {
    data class Property(val name: String) : PathToken
    data class Index(val index: Int) : PathToken
}

private fun parseKeyPath(keyPath: String): List<PathToken> {
    if (keyPath.isBlank()) {
        throw InvalidStepConfigException("extractKey.keyPath 不能为空", mapOf("field" to "keyPath"))
    }
    val tokens = mutableListOf<PathToken>()
    var buffer = StringBuilder()
    var index = 0
    while (index < keyPath.length) {
        when (val ch = keyPath[index]) {
            '.' -> {
                if (buffer.isEmpty()) {
                    throw InvalidStepConfigException("extractKey.keyPath 非法: $keyPath", mapOf("field" to "keyPath"))
                }
                tokens.add(PathToken.Property(buffer.toString()))
                buffer = StringBuilder()
                index++
            }

            '[' -> {
                if (buffer.isNotEmpty()) {
                    tokens.add(PathToken.Property(buffer.toString()))
                    buffer = StringBuilder()
                }
                val end = keyPath.indexOf(']', startIndex = index)
                if (end <= index + 1) {
                    throw InvalidStepConfigException("extractKey.keyPath 非法: $keyPath", mapOf("field" to "keyPath"))
                }
                val rawIndex = keyPath.substring(index + 1, end)
                val parsedIndex = rawIndex.toIntOrNull()
                    ?: throw InvalidStepConfigException("extractKey.keyPath 非法: $keyPath", mapOf("field" to "keyPath"))
                tokens.add(PathToken.Index(parsedIndex))
                index = end + 1
                if (index < keyPath.length && keyPath[index] == '.') {
                    index++
                }
            }

            else -> {
                buffer.append(ch)
                index++
            }
        }
    }
    if (buffer.isNotEmpty()) {
        tokens.add(PathToken.Property(buffer.toString()))
    }
    if (tokens.isEmpty()) {
        throw InvalidStepConfigException("extractKey.keyPath 不能为空", mapOf("field" to "keyPath"))
    }
    return tokens
}

private fun serializeJsonLeaf(element: JsonElement): String {
    val primitive = element as? JsonPrimitive ?: return element.toString()
    primitive.booleanOrNull?.let { return it.toString() }
    primitive.intOrNull?.let { return it.toString() }
    primitive.doubleOrNull?.let { return it.toString() }
    return primitive.contentOrNull ?: element.toString()
}

private fun decodeStepList(element: JsonElement, field: String): List<StepNode> {
    return runCatching {
        stepTreeJson.decodeFromJsonElement<List<StepNode>>(element)
    }.getOrElse {
        throw InvalidStepConfigException("$field 子步骤格式非法", mapOf("field" to field))
    }
}

private fun resolveConditionValue(element: JsonElement?, outputs: Map<String, String>): String? {
    if (element == null) return null
    val primitive = element as? JsonPrimitive ?: return element.toString()
    primitive.intOrNull?.let { return it.toString() }
    primitive.doubleOrNull?.let { return it.toString() }
    primitive.booleanOrNull?.let { return it.toString() }
    return resolveTextTemplate(primitive.contentOrNull, outputs)
}

private fun compareNumeric(left: String?, right: String?): Int {
    val leftNumber = left?.toDoubleOrNull()
        ?: throw InvalidStepConfigException("条件比较左值不是数字", mapOf("field" to "condition.left"))
    val rightNumber = right?.toDoubleOrNull()
        ?: throw InvalidStepConfigException("条件比较右值不是数字", mapOf("field" to "condition.right"))
    return leftNumber.compareTo(rightNumber)
}