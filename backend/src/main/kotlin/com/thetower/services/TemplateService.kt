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
import com.thetower.utils.TemplateNotFoundException
import com.thetower.utils.TtlCache
import com.thetower.utils.newId
import com.thetower.utils.nowIso
import io.github.oshai.kotlinlogging.KotlinLogging

class TemplateService(
    private val repository: TemplateRepository
) {
    private val logger = KotlinLogging.logger {}
    private val listCache = TtlCache<String, List<TemplateSummary>>(ttlMs = 30_000)
    private val byIdCache = TtlCache<String, WorkflowTemplate>(ttlMs = 15_000)

    fun getTemplates(includeLastRun: Boolean): List<TemplateSummary> {
        val cacheKey = "templates:includeLastRun=$includeLastRun"
        listCache.get(cacheKey)?.let { cached ->
            logger.debug { "cache.hit key=$cacheKey" }
            return cached
        }

        val items = repository.findAll()
            .sortedByDescending { it.updatedAt }
            .map { template ->
                TemplateSummary(
                    id = template.id,
                    name = template.name,
                    description = template.description,
                    schemaVersion = template.schemaVersion,
                    updatedAt = template.updatedAt,
                    stats = template.stats,
                    lastRun = if (includeLastRun) template.lastRun else null
                )
            }
        listCache.put(cacheKey, items)
        logger.debug { "cache.put key=$cacheKey" }
        return items
    }

    fun getTemplateById(id: String): WorkflowTemplate {
        byIdCache.get(id)?.let { cached ->
            logger.debug { "cache.hit key=template:$id" }
            return cached
        }

        val template = repository.findById(id)
            ?: throw TemplateNotFoundException("模板 $id 不存在")
        byIdCache.put(id, template)
        logger.debug { "cache.put key=template:$id" }
        return template
    }

    fun createTemplate(request: CreateTemplateRequest): WorkflowTemplate {
        if (request.name.isBlank()) {
            throw BadRequestException("name 不能为空", mapOf("field" to "name"))
        }
        validateSchemaVersion(request.schemaVersion)
        validateStepTree(request.steps)
        validateWorkflowReferences(currentTemplateId = null, steps = request.steps)

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
            stats = TemplateStats(stepCount = countStepsRecursively(request.steps)),
            lastRun = null
        )
        val saved = repository.save(template)
        invalidateTemplateCaches(saved.id)
        return saved
    }

    fun updateTemplateMeta(id: String, request: PatchTemplateRequest): WorkflowTemplate {
        val current = getTemplateById(id)
        val nextName = request.name?.trim() ?: current.name
        if (nextName.isBlank()) {
            throw BadRequestException("name 不能为空", mapOf("field" to "name"))
        }

        val saved = repository.save(
            current.copy(
                name = nextName,
                description = request.description ?: current.description,
                updatedAt = nowIso()
            )
        )
        invalidateTemplateCaches(saved.id)
        return saved
    }

    fun updateTemplateSteps(id: String, request: SaveTemplateRequest): WorkflowTemplate {
        validateSchemaVersion(request.schemaVersion)
        validateStepTree(request.steps)
        validateWorkflowReferences(currentTemplateId = id, steps = request.steps)
        val current = getTemplateById(id)
        val saved = repository.save(
            current.copy(
                schemaVersion = request.schemaVersion,
                steps = request.steps,
                otherStep = request.otherStep,
                updatedAt = nowIso(),
                stats = TemplateStats(stepCount = countStepsRecursively(request.steps))
            )
        )
        invalidateTemplateCaches(saved.id)
        return saved
    }

    fun deleteTemplate(id: String): Boolean {
        if (!repository.delete(id)) {
            throw TemplateNotFoundException("模板 $id 不存在")
        }
        invalidateTemplateCaches(id)
        return true
    }

    fun updateLastRun(templateId: String, lastRun: LastRun) {
        val template = repository.findById(templateId) ?: return
        repository.save(template.copy(lastRun = lastRun, updatedAt = nowIso()))
        invalidateTemplateCaches(templateId)
    }

    private fun invalidateTemplateCaches(templateId: String) {
        byIdCache.invalidate(templateId)
        listCache.clear()
        logger.info { "cache.invalidate scope=templates templateId=$templateId" }
    }

    private fun validateSchemaVersion(schemaVersion: String) {
        if (schemaVersion != "0.0.1" && schemaVersion != "0.0.4" && schemaVersion != "0.0.5" && schemaVersion != "0.0.6" && schemaVersion != "0.0.7") {
            throw BadRequestException("schemaVersion 必须为 0.0.1、0.0.4、0.0.5、0.0.6 或 0.0.7", mapOf("field" to "schemaVersion"))
        }
    }

    private fun validateWorkflowReferences(currentTemplateId: String?, steps: List<com.thetower.models.StepNode>) {
        val references = extractReferencedWorkflowIds(steps)
        if (references.isEmpty()) {
            return
        }

        if (currentTemplateId != null && currentTemplateId in references) {
            throw BadRequestException(
                "callWorkflow 不允许直接引用自身模板",
                mapOf("field" to "workflowId", "templateId" to currentTemplateId)
            )
        }

        references.forEach { workflowId ->
            if (repository.findById(workflowId) == null) {
                throw BadRequestException(
                    "callWorkflow 引用的模板不存在: $workflowId",
                    mapOf("field" to "workflowId", "workflowId" to workflowId)
                )
            }
            if (currentTemplateId != null) {
                detectWorkflowCycle(originTemplateId = currentTemplateId, workflowId = workflowId, visited = linkedSetOf())
            }
        }
    }

    private fun detectWorkflowCycle(originTemplateId: String, workflowId: String, visited: MutableSet<String>) {
        if (!visited.add(workflowId)) {
            return
        }
        val template = repository.findById(workflowId) ?: return
        val nestedReferences = extractReferencedWorkflowIds(template.steps)
        if (originTemplateId in nestedReferences) {
            throw BadRequestException(
                "callWorkflow 存在循环引用: $originTemplateId -> $workflowId -> $originTemplateId",
                mapOf("field" to "workflowId", "templateId" to originTemplateId, "workflowId" to workflowId)
            )
        }
        nestedReferences.forEach { nestedId ->
            detectWorkflowCycle(originTemplateId, nestedId, visited)
        }
    }
}
