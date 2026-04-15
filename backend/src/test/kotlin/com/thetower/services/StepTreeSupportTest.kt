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
                ),
                step(
                    "save-data-1",
                    "saveData",
                    buildJsonObject {
                        put("content", "${'$'}{payload}")
                        put("fileName", "payload.json")
                        put("saveAs", "savedPath")
                    }
                ),
                step(
                    "save-excel-1",
                    "saveExcel",
                    buildJsonObject {
                        put("inputVar", "tableRows")
                        put("fileName", "report.xlsx")
                        put("saveAs", "excelPath")
                    }
                ),
                step(
                    "import-excel-1",
                    "importExcel",
                    buildJsonObject {
                        put("path", "data/report.xlsx")
                        put("saveAs", "excelRows")
                    }
                ),
                step(
                    "listen-trigger-1",
                    "listenRequestTrigger",
                    buildJsonObject {
                        put("listenerId", "api-login")
                        put("urlPattern", "/api/login")
                        put("matchType", "contains")
                    }
                ),
                step(
                    "listen-result-1",
                    "listenRequestResult",
                    buildJsonObject {
                        put("listenerId", "api-login")
                        put("saveAs", "requestSnapshot")
                    }
                ),
                step(
                    "listen-stop-1",
                    "stopPageListen",
                    buildJsonObject {
                        put("listenerId", "api-login")
                    }
                ),
                step(
                    "extract-active-1",
                    "extractActiveElement",
                    buildJsonObject {
                        put("extractType", "value")
                        put("saveAs", "activeValue")
                    }
                ),
                step(
                    "clipboard-1",
                    "getClipboardText",
                    buildJsonObject {
                        put("saveAs", "clipboardText")
                    }
                )
            )
        )
    }

    @Test
    fun `validateStepTree rejects saveData without fileName`() {
        assertFailsWith<InvalidStepConfigException> {
            validateStepTree(
                listOf(
                    step(
                        "save-data-1",
                        "saveData",
                        buildJsonObject {
                            put("content", "hello")
                        }
                    )
                )
            )
        }
    }

    @Test
    fun `validateStepTree rejects saveExcel without inputVar`() {
        assertFailsWith<InvalidStepConfigException> {
            validateStepTree(
                listOf(
                    step(
                        "save-excel-1",
                        "saveExcel",
                        buildJsonObject {
                            put("fileName", "report.xlsx")
                        }
                    )
                )
            )
        }
    }

    @Test
    fun `validateStepTree rejects importExcel without path`() {
        assertFailsWith<InvalidStepConfigException> {
            validateStepTree(
                listOf(
                    step(
                        "import-excel-1",
                        "importExcel",
                        buildJsonObject {
                            put("saveAs", "excelRows")
                        }
                    )
                )
            )
        }
    }

    @Test
    fun `validateStepTree rejects listenRequestTrigger without urlPattern`() {
        assertFailsWith<InvalidStepConfigException> {
            validateStepTree(
                listOf(
                    step(
                        "listen-trigger-1",
                        "listenRequestTrigger",
                        buildJsonObject {
                            put("listenerId", "api-login")
                        }
                    )
                )
            )
        }
    }

    @Test
    fun `validateStepTree rejects stopPageListen without listenerId or stopAll`() {
        assertFailsWith<InvalidStepConfigException> {
            validateStepTree(
                listOf(
                    step(
                        "listen-stop-1",
                        "stopPageListen",
                        buildJsonObject { }
                    )
                )
            )
        }
    }

    @Test
    fun `validateStepTree rejects getClipboardText without saveAs`() {
        assertFailsWith<InvalidStepConfigException> {
            validateStepTree(
                listOf(
                    step(
                        "clipboard-1",
                        "getClipboardText",
                        buildJsonObject {}
                    )
                )
            )
        }
    }

    @Test
    fun `validateStepTree accepts 0_0_8 keyboard text and page steps`() {
        validateStepTree(
            listOf(
                step(
                    "keyboard-press-1",
                    "keyboardPress",
                    buildJsonObject {
                        put("key", "Enter")
                    }
                ),
                step(
                    "keyboard-hotkey-1",
                    "keyboardHotkey",
                    buildJsonObject {
                        put("key", "KeyP")
                    }
                ),
                step(
                    "text-extract-1",
                    "textExtract",
                    buildJsonObject {
                        put("input", "订单号:123")
                        put("pattern", "订单号:(\\d+)")
                        put("saveAs", "orderId")
                    }
                ),
                step("go-back-1", "goBack"),
                step(
                    "close-pages-1",
                    "closeOtherPages",
                    buildJsonObject {
                        put("keep", "current")
                    }
                )
            )
        )
    }

    @Test
    fun `validateStepTree accepts elementRefVar with elementOrder on selector steps`() {
        validateStepTree(
            listOf(
                step(
                    "extract-ref-1",
                    "extract",
                    buildJsonObject {
                        put("elementRefVar", "matchedElement")
                        put("saveAs", "selectedElement")
                        put("extractType", "elementRef")
                        put(
                            "elementOrder",
                            buildJsonObject {
                                put("type", "index")
                                put("index", 1)
                            }
                        )
                    }
                ),
                step(
                    "click-ref-1",
                    "click",
                    buildJsonObject {
                        put("elementRefVar", "selectedElement")
                    }
                ),
                step(
                    "foreach-ref-1",
                    "forEachElement",
                    buildJsonObject {
                        put("elementRefVar", "matchedElement")
                        put("itemVar", "item")
                        put(
                            "elementOrder",
                            buildJsonObject {
                                put("type", "randomRange")
                                put("min", 0)
                                put("max", 2)
                            }
                        )
                        putJsonSteps("body", listOf(step("wait-1", "waitFor", buildJsonObject { put("waitMs", 10) })))
                    }
                )
            )
        )
    }

    @Test
    fun `validateStepTree rejects elementOrder index without index value`() {
        val ex = assertFailsWith<InvalidStepConfigException> {
            validateStepTree(
                listOf(
                    step(
                        "extract-ref-1",
                        "extract",
                        buildJsonObject {
                            put("selector", ".item")
                            put("saveAs", "selectedElement")
                            put("extractType", "elementRef")
                            put(
                                "elementOrder",
                                buildJsonObject {
                                    put("type", "index")
                                }
                            )
                        }
                    )
                )
            )
        }

        assertTrue(ex.message!!.contains("elementOrder.index"))
    }

    @Test
    fun `validateStepTree rejects closeOtherPages alias without pageAlias`() {
        assertFailsWith<InvalidStepConfigException> {
            validateStepTree(
                listOf(
                    step(
                        "close-pages-1",
                        "closeOtherPages",
                        buildJsonObject {
                            put("keep", "alias")
                        }
                    )
                )
            )
        }
    }

    @Test
    fun `validateStepTree accepts type based elementOrder`() {
        validateStepTree(
            listOf(
                step(
                    "click-1",
                    "click",
                    buildJsonObject {
                        put("elementRefVar", "buttons")
                        put("elementOrder", buildJsonObject {
                            put("type", "index")
                            put("index", 1)
                        })
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

    @Test
    fun `evaluateCondition supports breakpointCondition field`() {
        val config = buildJsonObject {
            put("breakpointCondition", buildJsonObject {
                put("left", "${'$'}{status}")
                put("op", "equals")
                put("right", "FAILED")
            })
        }

        assertTrue(evaluateCondition(config, mapOf("status" to "FAILED"), "breakpointCondition"))
        assertFalse(evaluateCondition(config, mapOf("status" to "SUCCEEDED"), "breakpointCondition"))
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