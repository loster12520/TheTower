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
    fun `countStepsRecursively counts new 0_0_5 container branches`() {
        val steps = listOf(
            step(
                id = "start-browser-1",
                type = "startBrowser",
                config = buildJsonObject {
                    putJsonSteps(
                        "body",
                        listOf(
                            step(
                                id = "for-each-data-1",
                                type = "forEachData",
                                config = buildJsonObject {
                                    put("dataVar", "items")
                                    put("itemVar", "item")
                                    putJsonSteps("body", listOf(step("click-1", "click")))
                                }
                            )
                        )
                    )
                }
            )
        )

        assertEquals(3, countStepsRecursively(steps))
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
    fun `validateStepTree accepts break inside forEachData body`() {
        validateStepTree(
            listOf(
                step(
                    "for-each-data-1",
                    "forEachData",
                    buildJsonObject {
                        put("dataVar", "items")
                        put("itemVar", "item")
                        putJsonSteps("body", listOf(step("break-1", "break")))
                    }
                )
            )
        )
    }

    @Test
    fun `validateStepTree rejects forEachElement without selector and itemVar`() {
        assertFailsWith<InvalidStepConfigException> {
            validateStepTree(
                listOf(
                    step(
                        "for-each-element-1",
                        "forEachElement",
                        buildJsonObject {
                            putJsonSteps("body", listOf(step("click-1", "click")))
                        }
                    )
                )
            )
        }
    }

    @Test
    fun `validateStepTree rejects empty forEachData body`() {
        assertFailsWith<InvalidStepConfigException> {
            validateStepTree(
                listOf(
                    step(
                        "for-each-data-1",
                        "forEachData",
                        buildJsonObject {
                            put("dataVar", "items")
                            put("itemVar", "item")
                            putJsonSteps("body", emptyList())
                        }
                    )
                )
            )
        }
    }

    @Test
    fun `validateStepTree rejects invalid startBrowser enum`() {
        assertFailsWith<InvalidStepConfigException> {
            validateStepTree(
                listOf(
                    step(
                        "start-browser-1",
                        "startBrowser",
                        buildJsonObject {
                            put("onError", "continue")
                            putJsonSteps("body", listOf(step("open-1", "openUrl")))
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