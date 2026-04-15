package com.thetower.repository

import com.thetower.models.PublishedTemplate
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.concurrent.ConcurrentHashMap
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

class PublishedTemplateRepository(
    private val storagePath: Path = Paths.get("data", "market", "templates.json")
) {
    private val items = ConcurrentHashMap<String, PublishedTemplate>()
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    init {
        loadFromDisk()
    }

    fun findAll(): List<PublishedTemplate> = items.values.toList()

    fun findById(id: String): PublishedTemplate? = items[id]

    @Synchronized
    fun save(template: PublishedTemplate): PublishedTemplate {
        items[template.id] = template
        flushToDisk()
        return template
    }

    private fun loadFromDisk() {
        if (!Files.exists(storagePath)) {
            return
        }
        val raw = Files.readString(storagePath)
        if (raw.isBlank()) {
            return
        }
        val loaded = json.decodeFromString(ListSerializer(PublishedTemplate.serializer()), raw)
        loaded.forEach { items[it.id] = it }
    }

    private fun flushToDisk() {
        val parent = storagePath.parent
        if (parent != null && !Files.exists(parent)) {
            Files.createDirectories(parent)
        }
        val serialized = json.encodeToString(ListSerializer(PublishedTemplate.serializer()), findAll().sortedByDescending { it.publishedAt })
        Files.writeString(storagePath, serialized)
    }
}