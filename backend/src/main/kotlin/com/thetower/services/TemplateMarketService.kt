package com.thetower.services

import com.thetower.models.CreateTemplateRequest
import com.thetower.models.ImportPublishedTemplateRequest
import com.thetower.models.PublishedTemplate
import com.thetower.models.PublishedTemplateSummary
import com.thetower.models.WorkflowTemplate
import com.thetower.repository.PublishedTemplateRepository
import com.thetower.utils.BadRequestException
import com.thetower.utils.newId
import com.thetower.utils.nowIso

class TemplateMarketService(
    private val templateService: TemplateService,
    private val repository: PublishedTemplateRepository
) {
    fun listPublishedTemplates(keyword: String? = null): List<PublishedTemplateSummary> {
        val normalizedKeyword = keyword?.trim()?.takeIf { it.isNotEmpty() }?.lowercase()
        return repository.findAll()
            .asSequence()
            .filter { item ->
                normalizedKeyword == null ||
                    item.name.lowercase().contains(normalizedKeyword) ||
                    (item.description?.lowercase()?.contains(normalizedKeyword) == true)
            }
            .sortedByDescending { it.publishedAt }
            .map {
                PublishedTemplateSummary(
                    id = it.id,
                    sourceTemplateId = it.sourceTemplateId,
                    name = it.name,
                    description = it.description,
                    groupName = it.groupName,
                    tags = it.tags,
                    schemaVersion = it.schemaVersion,
                    stats = it.stats,
                    sourceUpdatedAt = it.sourceUpdatedAt,
                    publishedAt = it.publishedAt
                )
            }
            .toList()
    }

    fun publishTemplate(templateId: String): PublishedTemplate {
        val template = templateService.getTemplateById(templateId)
        val published = PublishedTemplate(
            id = newId(),
            sourceTemplateId = template.id,
            name = template.name,
            description = template.description,
            groupName = template.groupName,
            tags = template.tags,
            schemaVersion = template.schemaVersion,
            steps = template.steps,
            otherStep = template.otherStep,
            stats = template.stats,
            sourceUpdatedAt = template.updatedAt,
            publishedAt = nowIso()
        )
        return repository.save(published)
    }

    fun importPublishedTemplate(publishedTemplateId: String, request: ImportPublishedTemplateRequest): WorkflowTemplate {
        val published = repository.findById(publishedTemplateId)
            ?: throw BadRequestException("市场模板不存在: $publishedTemplateId", mapOf("field" to "publishedTemplateId"))
        val nextName = request.name?.trim()?.takeIf { it.isNotEmpty() } ?: "${published.name} 导入副本"
        return templateService.createTemplate(
            CreateTemplateRequest(
                name = nextName,
                description = published.description,
                groupName = published.groupName,
                tags = published.tags,
                schemaVersion = published.schemaVersion,
                steps = published.steps,
                otherStep = published.otherStep
            )
        )
    }
}