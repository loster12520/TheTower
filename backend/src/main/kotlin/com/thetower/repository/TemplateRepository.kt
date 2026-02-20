package com.thetower.repository

import com.thetower.models.WorkflowTemplate
import java.util.concurrent.ConcurrentHashMap

class TemplateRepository {
    private val storage = ConcurrentHashMap<String, WorkflowTemplate>()

    fun findAll(): List<WorkflowTemplate> = storage.values.toList()

    fun findById(id: String): WorkflowTemplate? = storage[id]

    fun save(template: WorkflowTemplate): WorkflowTemplate {
        storage[template.id] = template
        return template
    }

    fun delete(id: String): Boolean = storage.remove(id) != null
}
