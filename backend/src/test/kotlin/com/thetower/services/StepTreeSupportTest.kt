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
import kotlin.test.assertContentEquals
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
    fun `validateStepTree accepts 0_0_7 data steps and callWorkflow`() {
        validateStepTree(
            listOf(
                step(
                    "call-1",
                    "callWorkflow",
                    buildJsonObject {
                        put("workflowId", "wf-child")
                    }
                ),
                step(
                    "json-1",
                    "convertJson",
                    buildJsonObject {
                        put("value", "{\"a\":1}")
                        put("direction", "parse")
                        put("saveAs", "normalized")
                    }
                ),
                step(
                    "extract-1",
                    "extractKey",
                    buildJsonObject {
                        put("inputVar", "payload")
                        put("keyPath", "data.items[0].title")
                        put("saveAs", "title")
                    }
                ),
                step(
                    "random-1",
                    "randomGet",
                    buildJsonObject {
                        put("inputVar", "items")
                        put("saveAs", "pick")
                    }
                )
            )
        )
    }

    @Test
    fun `extractReferencedWorkflowIds collects nested callWorkflow nodes`() {
        val references = extractReferencedWorkflowIds(
            listOf(
                step(
                    "if-1",
                    "if",
                    buildJsonObject {
                        put("condition", buildJsonObject {
                            put("left", "1")
                            put("op", "equals")
                            put("right", "1")
                        })
                        putJsonSteps(
                            "then",
                            listOf(
                                step("call-1", "callWorkflow", buildJsonObject { put("workflowId", "wf-a") }),
                                step(
                                    "for-1",
                                    "forEachData",
                                    buildJsonObject {
                                        put("dataVar", "items")
                                        put("itemVar", "item")
                                        putJsonSteps("body", listOf(step("call-2", "callWorkflow", buildJsonObject { put("workflowId", "wf-b") })))
                                    }
                                )
                            )
                        )
                        putJsonSteps("else", emptyList())
                    }
                )
            )
        )

        assertContentEquals(listOf("wf-a", "wf-b"), references.toList())
    }

    @Test
    fun `applyWorkflowInputMapping resolves template values into child outputs`() {
        val childOutputs = mutableMapOf("existing" to "1")
        applyWorkflowInputMapping(
            buildJsonObject {
                put("inputMapping", buildJsonObject {
                    put("token", "${'$'}{parentToken}")
                    put("fixed", "hello")
                })
            },
            parentOutputs = mapOf("parentToken" to "abc"),
            baseOutputs = childOutputs
        )

        assertEquals("abc", childOutputs["token"])
        assertEquals("hello", childOutputs["fixed"])
        assertEquals("1", childOutputs["existing"])
    }

    @Test
    fun `buildWorkflowOutputDelta only keeps changed values`() {
        val delta = buildWorkflowOutputDelta(
            parentOutputs = mapOf("same" to "1", "old" to "x"),
            childOutputs = mapOf("same" to "1", "old" to "y", "new" to "z")
        )

        assertEquals(mapOf("old" to "y", "new" to "z"), delta)
        assertEquals("{\"old\":\"y\",\"new\":\"z\"}", serializeWorkflowOutput(delta))
    }

    @Test
    fun `workflowCallDepth counts nested call markers`() {
        assertEquals(0, workflowCallDepth(listOf("step-1")))
        assertEquals(2, workflowCallDepth(listOf("root", "callWorkflow", "child-1", "callWorkflow", "child-2")))
    }

    @Test
    fun `convertJsonValue parse normalizes json`() {
        assertEquals("{\"a\":1,\"b\":[2,3]}", convertJsonValue("{\n  \"a\": 1, \"b\": [2, 3]\n}", "parse"))
        assertEquals("\"hello\"", convertJsonValue("hello", "stringify"))
    }

    @Test
    fun `extractJsonKey supports object and array path`() {
        val raw = "{\"data\":{\"items\":[{\"title\":\"A\"},{\"title\":\"B\"}]}}"
        assertEquals("A", extractJsonKey(raw, "data.items[0].title"))
    }

    @Test
    fun `randomGetFromJsonArray returns selected element`() {
        assertEquals("b", randomGetFromJsonArray("[\"a\",\"b\",\"c\"]", randomIndex = 1))
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