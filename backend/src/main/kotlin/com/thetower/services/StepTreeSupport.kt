package com.thetower.services

import com.thetower.models.StepNode
import com.thetower.utils.InvalidStepConfigException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

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

            "forEachElement", "forTimes", "forEachData", "startBrowser" -> {
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
        }
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