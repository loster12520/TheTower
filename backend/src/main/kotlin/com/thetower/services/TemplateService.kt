package com.thetower.services

import com.thetower.models.CreateTemplateRequest
import com.thetower.models.BatchDeleteTemplatesData
import com.thetower.models.CloneTemplateRequest
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

    fun getTemplates(
        includeLastRun: Boolean,
        keyword: String? = null,
        groupName: String? = null,
        tag: String? = null
    ): List<TemplateSummary> {
        val normalizedKeyword = keyword?.trim()?.takeIf { it.isNotEmpty() }?.lowercase()
        val normalizedGroupName = normalizeGroupName(groupName)?.lowercase()
        val normalizedTag = normalizeTags(if (tag.isNullOrBlank()) emptyList() else listOf(tag)).firstOrNull()?.lowercase()
        val cacheKey = "templates:includeLastRun=$includeLastRun:keyword=${normalizedKeyword ?: "*"}:group=${normalizedGroupName ?: "*"}:tag=${normalizedTag ?: "*"}"
        listCache.get(cacheKey)?.let { cached ->
            logger.debug { "cache.hit key=$cacheKey" }
            return cached
        }

        val items = repository.findAll()
            .asSequence()
            .filter { template ->
                normalizedKeyword == null || template.name.lowercase().contains(normalizedKeyword) ||
                    (template.description?.lowercase()?.contains(normalizedKeyword) == true)
            }
            .filter { template ->
                normalizedGroupName == null || template.groupName?.lowercase() == normalizedGroupName
            }
            .filter { template ->
                normalizedTag == null || template.tags.any { currentTag -> currentTag.lowercase() == normalizedTag }
            }
            .sortedByDescending { it.updatedAt }
            .map { template ->
                TemplateSummary(
                    id = template.id,
                    name = template.name,
                    description = template.description,
                    groupName = template.groupName,
                    tags = template.tags,
                    schemaVersion = template.schemaVersion,
                    updatedAt = template.updatedAt,
                    stats = template.stats,
                    lastRun = if (includeLastRun) template.lastRun else null
                )
            }
            .toList()
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
        val normalizedGroupName = normalizeGroupName(request.groupName)
        val normalizedTags = normalizeTags(request.tags)
        val template = WorkflowTemplate(
            id = newId(),
            name = request.name.trim(),
            description = request.description,
            groupName = normalizedGroupName,
            tags = normalizedTags,
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

        val normalizedGroupName = request.groupName?.let(::normalizeGroupName) ?: current.groupName
        val normalizedTags = request.tags?.let(::normalizeTags) ?: current.tags

        val saved = repository.save(
            current.copy(
                name = nextName,
                description = request.description ?: current.description,
                groupName = normalizedGroupName,
                tags = normalizedTags,
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

    fun cloneTemplate(id: String, request: CloneTemplateRequest): WorkflowTemplate {
        val current = getTemplateById(id)
        val now = nowIso()
        val nextName = request.name?.trim()?.takeIf { it.isNotEmpty() } ?: "${current.name} 副本"

        val cloned = current.copy(
            id = newId(),
            name = nextName,
            createdAt = now,
            updatedAt = now,
            lastRun = null
        )
        val saved = repository.save(cloned)
        invalidateTemplateCaches(saved.id)
        return saved
    }

    fun deleteTemplates(ids: List<String>): BatchDeleteTemplatesData {
        val normalizedIds = ids.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (normalizedIds.isEmpty()) {
            throw BadRequestException("ids 不能为空", mapOf("field" to "ids"))
        }

        var deletedCount = 0
        val failedIds = mutableListOf<String>()
        normalizedIds.forEach { id ->
            if (repository.delete(id)) {
                deletedCount += 1
                invalidateTemplateCaches(id)
            } else {
                failedIds += id
            }
        }

        return BatchDeleteTemplatesData(
            deletedCount = deletedCount,
            failedIds = failedIds
        )
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
        if (schemaVersion != "0.0.1" && schemaVersion != "0.0.4" && schemaVersion != "0.0.5" && schemaVersion != "0.0.6" && schemaVersion != "0.0.7" && schemaVersion != "0.0.8") {
            throw BadRequestException("schemaVersion 必须为 0.0.1、0.0.4、0.0.5、0.0.6、0.0.7 或 0.0.8", mapOf("field" to "schemaVersion"))
        }
    }

    private fun normalizeGroupName(groupName: String?): String? {
        val normalized = groupName?.trim()?.takeIf { it.isNotEmpty() }
        if (normalized != null && normalized.length > 30) {
            throw BadRequestException("groupName 不能超过 30 个字符", mapOf("field" to "groupName"))
        }
        return normalized
    }

    private fun normalizeTags(tags: List<String>): List<String> {
        val normalized = tags
            .asSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .distinct()
            .toList()

        if (normalized.size > 10) {
            throw BadRequestException("tags 最多支持 10 个", mapOf("field" to "tags"))
        }

        normalized.forEach { tag ->
            if (tag.length > 20) {
                throw BadRequestException("标签不能超过 20 个字符", mapOf("field" to "tags"))
            }
        }

        return normalized
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
