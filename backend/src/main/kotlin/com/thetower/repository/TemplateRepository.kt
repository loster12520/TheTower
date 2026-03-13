package com.thetower.repository

import com.thetower.models.LastRun
import com.thetower.models.OtherStep
import com.thetower.models.StepNode
import com.thetower.models.TemplateStats
import com.thetower.models.WorkflowTemplate
import com.thetower.persistence.jimmer.TemplateEntity
import com.thetower.persistence.jimmer.TemplateEntityDraft
import com.thetower.utils.JimmerSqlClientFactory
import com.thetower.utils.SqliteConfig
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.concurrent.ConcurrentHashMap

class TemplateRepository(
    private val sqliteConfig: SqliteConfig
) {
    private val storage = ConcurrentHashMap<String, WorkflowTemplate>()
    private val json = Json { ignoreUnknownKeys = true }
    private val sqlClient = JimmerSqlClientFactory.create(sqliteConfig)

    fun findAll(): List<WorkflowTemplate> {
        if (sqlClient == null) {
            return storage.values.toList()
        }
        val items = sqlClient
            .createQuery(TemplateEntity::class) {
                select(table)
            }
            .execute()
            .map { mapEntity(it) }
        items.forEach { storage[it.id] = it }
        return items
    }

    fun findById(id: String): WorkflowTemplate? {
        if (sqlClient == null) {
            return storage[id]
        }
        val entity = sqlClient.entities.findById(TemplateEntity::class, id) ?: return null
        return mapEntity(entity).also { storage[it.id] = it }
    }

    fun save(template: WorkflowTemplate): WorkflowTemplate {
        if (sqlClient == null) {
            storage[template.id] = template
            return template
        }

        val entity = TemplateEntityDraft.`$`.produce {
            id = template.id
            name = template.name
            description = template.description
            schemaVersion = template.schemaVersion
            stepsJson = json.encodeToString(template.steps)
            otherStepJson = json.encodeToString(template.otherStep)
            createdAt = template.createdAt
            updatedAt = template.updatedAt
            statsStepCount = template.stats.stepCount
            lastRunJson = template.lastRun?.let { json.encodeToString(it) }
        }
        val saved = mapEntity(sqlClient.entities.save(entity).modifiedEntity)
        storage[saved.id] = saved
        return saved
    }

    fun delete(id: String): Boolean {
        if (sqlClient == null) {
            return storage.remove(id) != null
        }

        val existing = sqlClient.entities.findById(TemplateEntity::class, id)
        val deleted = if (existing != null) {
            sqlClient.entities.delete(TemplateEntity::class, id).totalAffectedRowCount > 0
        } else {
            false
        }
        if (deleted) {
            storage.remove(id)
        }
        return deleted
    }

    private fun mapEntity(entity: TemplateEntity): WorkflowTemplate {
        val steps = json.decodeFromString<List<StepNode>>(entity.stepsJson)
        val otherStep = json.decodeFromString<OtherStep>(entity.otherStepJson)
        val lastRunJson = entity.lastRunJson
        val lastRun = lastRunJson?.let { json.decodeFromString<LastRun>(it) }

        return WorkflowTemplate(
            id = entity.id,
            name = entity.name,
            description = entity.description,
            schemaVersion = entity.schemaVersion,
            steps = steps,
            otherStep = otherStep,
            createdAt = entity.createdAt,
            updatedAt = entity.updatedAt,
            stats = TemplateStats(stepCount = entity.statsStepCount),
            lastRun = lastRun
        )
    }
}
