package com.thetower.services

import com.thetower.models.CreateTemplateRequest
import com.thetower.models.CloneTemplateRequest
import com.thetower.models.OtherStep
import com.thetower.models.PatchTemplateRequest
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
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
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
    fun `createTemplate accepts 0_0_8 schemaVersion`() {
        val created = service.createTemplate(
            CreateTemplateRequest(
                name = "v008",
                schemaVersion = "0.0.8"
            )
        )

        assertEquals("0.0.8", created.schemaVersion)
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

    @Test
    fun `getTemplates filters by keyword over name and description`() {
        service.createTemplate(
            CreateTemplateRequest(
                name = "抓取标题",
                description = "提取页面标题",
                schemaVersion = "0.0.8"
            )
        )
        val other = service.createTemplate(
            CreateTemplateRequest(
                name = "批量登录",
                description = "执行登录动作",
                schemaVersion = "0.0.8"
            )
        )

        val byName = service.getTemplates(includeLastRun = true, keyword = "标题")
        assertEquals(1, byName.size)
        assertEquals("抓取标题", byName.first().name)

        val byDescription = service.getTemplates(includeLastRun = true, keyword = "登录动作")
        assertEquals(1, byDescription.size)
        assertEquals(other.id, byDescription.first().id)
    }

    @Test
    fun `createTemplate stores tags and groupName`() {
        val created = service.createTemplate(
            CreateTemplateRequest(
                name = "带标签模板",
                description = "用于标签测试",
                groupName = "采集",
                tags = listOf("采集", "标题", "采集"),
                schemaVersion = "0.0.8"
            )
        )

        assertEquals("采集", created.groupName)
        assertEquals(listOf("采集", "标题"), created.tags)
    }

    @Test
    fun `getTemplates filters by groupName and tag`() {
        service.createTemplate(
            CreateTemplateRequest(
                name = "采集标题",
                groupName = "采集",
                tags = listOf("标题", "页面"),
                schemaVersion = "0.0.8"
            )
        )
        service.createTemplate(
            CreateTemplateRequest(
                name = "登录流程",
                groupName = "账号",
                tags = listOf("登录"),
                schemaVersion = "0.0.8"
            )
        )

        val byGroup = service.getTemplates(includeLastRun = true, groupName = "采集")
        assertEquals(1, byGroup.size)
        assertEquals("采集", byGroup.first().groupName)

        val byTag = service.getTemplates(includeLastRun = true, tag = "标题")
        assertEquals(1, byTag.size)
        assertEquals("采集标题", byTag.first().name)
    }

    @Test
    fun `updateTemplateMeta updates tags and groupName`() {
        val created = service.createTemplate(
            CreateTemplateRequest(
                name = "待更新",
                schemaVersion = "0.0.8"
            )
        )

        val updated = service.updateTemplateMeta(
            created.id,
            PatchTemplateRequest(groupName = "调试", tags = listOf("断点", "调试"))
        )

        assertEquals("调试", updated.groupName)
        assertEquals(listOf("断点", "调试"), updated.tags)
    }

    @Test
    fun `cloneTemplate duplicates workflow with new id and cleared lastRun`() {
        val original = service.createTemplate(
            CreateTemplateRequest(
                name = "原模板",
                description = "测试克隆",
                schemaVersion = "0.0.8",
                steps = listOf(step("click-1", "click"))
            )
        )

        val cloned = service.cloneTemplate(original.id, CloneTemplateRequest())

        assertTrue(cloned.id != original.id)
        assertEquals("原模板 副本", cloned.name)
        assertEquals(original.description, cloned.description)
        assertEquals(original.steps, cloned.steps)
        assertEquals(original.otherStep, cloned.otherStep)
        assertEquals(original.stats.stepCount, cloned.stats.stepCount)
        assertNull(cloned.lastRun)
    }

    @Test
    fun `deleteTemplates returns deleted count and failed ids`() {
        val first = service.createTemplate(
            CreateTemplateRequest(
                name = "first",
                schemaVersion = "0.0.8"
            )
        )
        val second = service.createTemplate(
            CreateTemplateRequest(
                name = "second",
                schemaVersion = "0.0.8"
            )
        )

        val result = service.deleteTemplates(listOf(first.id, "missing-id", second.id, first.id))

        assertEquals(2, result.deletedCount)
        assertEquals(listOf("missing-id"), result.failedIds)
        assertFalse(service.getTemplates(includeLastRun = true).any { it.id == first.id || it.id == second.id })
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