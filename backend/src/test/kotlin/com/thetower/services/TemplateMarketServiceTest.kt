package com.thetower.services

import com.thetower.models.CreateTemplateRequest
import com.thetower.models.ImportPublishedTemplateRequest
import com.thetower.repository.PublishedTemplateRepository
import com.thetower.repository.TemplateRepository
import com.thetower.utils.SqliteConfig
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class TemplateMarketServiceTest {
    @Test
    fun `publish and import market template keeps workflow snapshot`() {
        val templateService = TemplateService(
            TemplateRepository(SqliteConfig(enabled = false, jdbcUrl = "jdbc:sqlite::memory:"))
        )
        val storagePath = Files.createTempDirectory("thetower-market-test").resolve("market.json")
        val marketService = TemplateMarketService(
            templateService,
            PublishedTemplateRepository(storagePath)
        )

        val source = templateService.createTemplate(
            CreateTemplateRequest(
                name = "市场源模板",
                description = "用于验证模板市场导入",
                groupName = "市场",
                tags = listOf("发布", "导入"),
                schemaVersion = "0.0.8"
            )
        )

        val published = marketService.publishTemplate(source.id)
        val summaries = marketService.listPublishedTemplates()
        val imported = marketService.importPublishedTemplate(published.id, ImportPublishedTemplateRequest())

        assertEquals(source.id, published.sourceTemplateId)
        assertEquals(1, summaries.size)
        assertEquals("市场源模板", summaries.first().name)
        assertTrue(imported.id != source.id)
        assertEquals("市场源模板 导入副本", imported.name)
        assertEquals(source.description, imported.description)
        assertEquals(source.groupName, imported.groupName)
        assertEquals(source.tags, imported.tags)
        assertEquals(source.steps, imported.steps)
        assertNotNull(templateService.getTemplateById(imported.id))
    }
}