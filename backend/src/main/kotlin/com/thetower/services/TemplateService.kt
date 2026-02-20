package com.thetower.services

import com.thetower.models.CreateTemplateRequest
import com.thetower.models.LastRun
import com.thetower.models.PatchTemplateRequest
import com.thetower.models.SaveTemplateRequest
import com.thetower.models.TemplateStats
import com.thetower.models.TemplateSummary
import com.thetower.models.WorkflowTemplate
import com.thetower.repository.TemplateRepository
import com.thetower.utils.BadRequestException
import com.thetower.utils.NotFoundException
import com.thetower.utils.newId
import com.thetower.utils.nowIso

class TemplateService(
    private val repository: TemplateRepository
) {
    fun list(includeLastRun: Boolean): List<TemplateSummary> = repository.findAll()
        .sortedByDescending { it.updatedAt }
        .map { template ->
            TemplateSummary(
                id = template.id,
                name = template.name,
                description = template.description,
                updatedAt = template.updatedAt,
                stats = template.stats,
                lastRun = if (includeLastRun) template.lastRun else null
            )
        }

    fun get(id: String): WorkflowTemplate = repository.findById(id)
        ?: throw NotFoundException("模板 $id 不存在")

    fun create(request: CreateTemplateRequest): WorkflowTemplate {
        if (request.name.isBlank()) {
            throw BadRequestException("name 不能为空", mapOf("field" to "name"))
        }
        if (request.schemaVersion != "0.0.1") {
            throw BadRequestException("schemaVersion 必须为 0.0.1", mapOf("field" to "schemaVersion"))
        }

        val now = nowIso()
        val template = WorkflowTemplate(
            id = newId(),
            name = request.name.trim(),
            description = request.description,
            schemaVersion = request.schemaVersion,
            steps = request.steps,
            otherStep = request.otherStep,
            createdAt = now,
            updatedAt = now,
            stats = TemplateStats(stepCount = request.steps.size),
            lastRun = null
        )
        return repository.save(template)
    }

    fun patch(id: String, request: PatchTemplateRequest): WorkflowTemplate {
        val current = get(id)
        val nextName = request.name?.trim() ?: current.name
        if (nextName.isBlank()) {
            throw BadRequestException("name 不能为空", mapOf("field" to "name"))
        }

        return repository.save(
            current.copy(
                name = nextName,
                description = request.description ?: current.description,
                updatedAt = nowIso()
            )
        )
    }

    fun saveSteps(id: String, request: SaveTemplateRequest): WorkflowTemplate {
        if (request.schemaVersion != "0.0.1") {
            throw BadRequestException("schemaVersion 必须为 0.0.1", mapOf("field" to "schemaVersion"))
        }
        val current = get(id)
        return repository.save(
            current.copy(
                schemaVersion = request.schemaVersion,
                steps = request.steps,
                otherStep = request.otherStep,
                updatedAt = nowIso(),
                stats = TemplateStats(stepCount = request.steps.size)
            )
        )
    }

    fun delete(id: String): Boolean {
        if (!repository.delete(id)) {
            throw NotFoundException("模板 $id 不存在")
        }
        return true
    }

    fun updateLastRun(templateId: String, lastRun: LastRun) {
        val template = repository.findById(templateId) ?: return
        repository.save(template.copy(lastRun = lastRun, updatedAt = nowIso()))
    }
}
