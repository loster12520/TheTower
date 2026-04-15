package com.thetower.repository

import com.thetower.models.TemplateAccessRecord
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.concurrent.ConcurrentHashMap
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

class TemplateCollaborationRepository(
    private val storagePath: Path = Paths.get("data", "collaboration", "templates.json")
) {
    private val items = ConcurrentHashMap<String, TemplateAccessRecord>()
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    init {
        loadFromDisk()
    }

    fun findByTemplateId(templateId: String): TemplateAccessRecord? = items[templateId]

    fun findAll(): List<TemplateAccessRecord> = items.values.toList()

    @Synchronized
    fun save(record: TemplateAccessRecord): TemplateAccessRecord {
        items[record.templateId] = record
        flushToDisk()
        return record
    }

    private fun loadFromDisk() {
        if (!Files.exists(storagePath)) {
            return
        }
        val raw = Files.readString(storagePath)
        if (raw.isBlank()) {
            return
        }
        val loaded = json.decodeFromString(ListSerializer(TemplateAccessRecord.serializer()), raw)
        loaded.forEach { record -> items[record.templateId] = record }
    }

    private fun flushToDisk() {
        val parent = storagePath.parent
        if (parent != null && !Files.exists(parent)) {
            Files.createDirectories(parent)
        }
        val serialized = json.encodeToString(
            ListSerializer(TemplateAccessRecord.serializer()),
            findAll().sortedByDescending { it.templateId }
        )
        Files.writeString(storagePath, serialized)
    }
}