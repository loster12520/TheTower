package com.thetower.services

import com.thetower.models.Position
import com.thetower.models.StepData
import com.thetower.models.StepNode
import com.thetower.utils.InvalidStepConfigException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class StepTreeSupportTest {
    @Test
    fun `countStepsRecursively counts nested branches`() {
        val steps = listOf(
            step(
                id = "if-1",
                type = "if",
                config = buildJsonObject {
                    putJsonSteps("then", listOf(step("click-1", "click")))
                    putJsonSteps("else", listOf(step("type-1", "type")))
                    put("condition", buildJsonObject {
                        put("left", "1")
                        put("op", "equals")
                        put("right", "1")
                    })
                }
            ),
            step("wait-1", "waitFor")
        )

        assertEquals(4, countStepsRecursively(steps))
    }

    @Test
    fun `validateStepTree rejects break outside loop`() {
        val ex = assertFailsWith<InvalidStepConfigException> {
            validateStepTree(listOf(step("break-1", "break")))
        }

        assertTrue(ex.message!!.contains("break"))
    }

    @Test
    fun `validateStepTree requires while maxIterations`() {
        assertFailsWith<InvalidStepConfigException> {
            validateStepTree(
                listOf(
                    step(
                        "while-1",
                        "while",
                        buildJsonObject {
                            put("condition", buildJsonObject {
                                put("left", "1")
                                put("op", "equals")
                                put("right", "1")
                            })
                            putJsonSteps("body", listOf(step("click-1", "click")))
                        }
                    )
                )
            )
        }
    }

    @Test
    fun `evaluateCondition supports variable existence and compare`() {
        val existsConfig = buildJsonObject {
            put("condition", buildJsonObject {
                put("left", "${'$'}{token}")
                put("op", "exists")
                put("right", "")
            })
        }
        val compareConfig = buildJsonObject {
            put("condition", buildJsonObject {
                put("left", "${'$'}{count}")
                put("op", "gte")
                put("right", "2")
            })
        }

        assertTrue(evaluateCondition(existsConfig, mapOf("token" to "abc")))
        assertTrue(evaluateCondition(compareConfig, mapOf("count" to "3")))
        assertFalse(evaluateCondition(compareConfig, mapOf("count" to "1")))
    }

    private fun step(id: String, type: String, config: kotlinx.serialization.json.JsonObject = buildJsonObject {}): StepNode {
        return StepNode(
            id = id,
            type = type,
            position = Position(0.0, 0.0),
            data = StepData(label = id, config = config)
        )
    }
}

private fun kotlinx.serialization.json.JsonObjectBuilder.putJsonSteps(field: String, steps: List<StepNode>) {
    put(field, kotlinx.serialization.json.Json.encodeToJsonElement(ListSerializer(StepNode.serializer()), steps))
}