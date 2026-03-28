package com.thetower.services

import com.thetower.models.CreateTemplateRequest
import com.thetower.models.OtherStep
import com.thetower.models.Position
import com.thetower.models.SaveTemplateRequest
import com.thetower.models.StepData
import com.thetower.models.StepNode
import com.thetower.repository.TemplateRepository
import com.thetower.utils.BadRequestException
import com.thetower.utils.InvalidStepConfigException
import com.thetower.utils.SqliteConfig
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class TemplateServiceTest {
    private val service = TemplateService(
        TemplateRepository(SqliteConfig(enabled = false, jdbcUrl = "jdbc:sqlite::memory:"))
    )

    @Test
    fun `createTemplate accepts 0_0_5 and counts nested steps`() {
        val created = service.createTemplate(
            CreateTemplateRequest(
                name = "control flow",
                schemaVersion = "0.0.5",
                steps = listOf(
                    step(
                        id = "if-1",
                        type = "if",
                        config = buildJsonObject {
                            put("condition", buildJsonObject {
                                put("left", "1")
                                put("op", "equals")
                                put("right", "1")
                            })
                            put(
                                "then",
                                Json.encodeToJsonElement(
                                    ListSerializer(StepNode.serializer()),
                                    listOf(step("click-1", "click"))
                                )
                            )
                            put(
                                "else",
                                Json.encodeToJsonElement(
                                    ListSerializer(StepNode.serializer()),
                                    emptyList<StepNode>()
                                )
                            )
                        }
                    )
                ),
                otherStep = OtherStep()
            )
        )

        assertEquals("0.0.5", created.schemaVersion)
        assertEquals(2, created.stats.stepCount)
    }

    @Test
    fun `updateTemplateSteps rejects invalid break structure`() {
        val created = service.createTemplate(
            CreateTemplateRequest(
                name = "base",
                schemaVersion = "0.0.1"
            )
        )

        assertFailsWith<InvalidStepConfigException> {
            service.updateTemplateSteps(
                created.id,
                SaveTemplateRequest(
                    schemaVersion = "0.0.4",
                    steps = listOf(step("break-1", "break")),
                    otherStep = OtherStep()
                )
            )
        }
    }

    @Test
    fun `createTemplate still rejects unsupported schemaVersion`() {
        assertFailsWith<BadRequestException> {
            service.createTemplate(
                CreateTemplateRequest(
                    name = "bad",
                    schemaVersion = "9.9.9"
                )
            )
        }
    }

    @Test
    fun `getTemplates includes schemaVersion in summary`() {
        val created = service.createTemplate(
            CreateTemplateRequest(
                name = "summary",
                schemaVersion = "0.0.6"
            )
        )

        val summary = service.getTemplates(includeLastRun = true)
            .firstOrNull { it.id == created.id }

        assertNotNull(summary)
        assertEquals("0.0.6", summary.schemaVersion)
    }

    @Test
    fun `createTemplate accepts 0_0_7 schemaVersion`() {
        val created = service.createTemplate(
            CreateTemplateRequest(
                name = "v007",
                schemaVersion = "0.0.7"
            )
        )

        assertEquals("0.0.7", created.schemaVersion)
    }

    @Test
    fun `updateTemplateSteps rejects callWorkflow self reference`() {
        val created = service.createTemplate(
            CreateTemplateRequest(
                name = "self",
                schemaVersion = "0.0.7"
            )
        )

        assertFailsWith<BadRequestException> {
            service.updateTemplateSteps(
                created.id,
                SaveTemplateRequest(
                    schemaVersion = "0.0.7",
                    steps = listOf(
                        step(
                            "call-1",
                            "callWorkflow",
                            buildJsonObject {
                                put("workflowId", created.id)
                            }
                        )
                    ),
                    otherStep = OtherStep()
                )
            )
        }
    }

    @Test
    fun `updateTemplateSteps rejects indirect workflow cycle`() {
        val child = service.createTemplate(
            CreateTemplateRequest(
                name = "child",
                schemaVersion = "0.0.7"
            )
        )
        val parent = service.createTemplate(
            CreateTemplateRequest(
                name = "parent",
                schemaVersion = "0.0.7",
                steps = listOf(
                    step(
                        "call-child",
                        "callWorkflow",
                        buildJsonObject {
                            put("workflowId", child.id)
                        }
                    )
                )
            )
        )

        assertFailsWith<BadRequestException> {
            service.updateTemplateSteps(
                child.id,
                SaveTemplateRequest(
                    schemaVersion = "0.0.7",
                    steps = listOf(
                        step(
                            "call-parent",
                            "callWorkflow",
                            buildJsonObject {
                                put("workflowId", parent.id)
                            }
                        )
                    ),
                    otherStep = OtherStep()
                )
            )
        }
    }

    @Test
    fun `createTemplate rejects missing workflow reference`() {
        assertFailsWith<BadRequestException> {
            service.createTemplate(
                CreateTemplateRequest(
                    name = "bad-ref",
                    schemaVersion = "0.0.7",
                    steps = listOf(
                        step(
                            "call-1",
                            "callWorkflow",
                            buildJsonObject {
                                put("workflowId", "missing-workflow")
                            }
                        )
                    )
                )
            )
        }
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