package com.thetower.repository

import com.thetower.models.Schedule
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.concurrent.ConcurrentHashMap
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

class ScheduleRepository(
    private val storagePath: Path = Paths.get("data", "schedules", "schedules.json")
) {
    private val items = ConcurrentHashMap<String, Schedule>()
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    init {
        loadFromDisk()
    }

    fun findAll(): List<Schedule> = items.values.toList()

    fun findById(id: String): Schedule? = items[id]

    @Synchronized
    fun save(schedule: Schedule): Schedule {
        items[schedule.id] = schedule
        flushToDisk()
        return schedule
    }

    @Synchronized
    fun delete(id: String): Boolean {
        val removed = items.remove(id) != null
        if (removed) {
            flushToDisk()
        }
        return removed
    }

    private fun loadFromDisk() {
        if (!Files.exists(storagePath)) {
            return
        }
        val raw = Files.readString(storagePath)
        if (raw.isBlank()) {
            return
        }
        val loaded = json.decodeFromString(ListSerializer(Schedule.serializer()), raw)
        loaded.forEach { items[it.id] = it }
    }

    private fun flushToDisk() {
        val parent = storagePath.parent
        if (parent != null && !Files.exists(parent)) {
            Files.createDirectories(parent)
        }
        val serialized = json.encodeToString(ListSerializer(Schedule.serializer()), findAll().sortedByDescending { it.updatedAt })
        Files.writeString(storagePath, serialized)
    }
}