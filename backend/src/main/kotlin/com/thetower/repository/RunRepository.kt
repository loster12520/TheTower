package com.thetower.repository

import com.thetower.models.Run
import com.thetower.models.RunError
import com.thetower.models.RunStatus
import com.thetower.persistence.jimmer.RunEntity
import com.thetower.persistence.jimmer.RunEntityDraft
import com.thetower.utils.JimmerSqlClientFactory
import com.thetower.utils.SqliteConfig
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

class RunRepository(
    private val sqliteConfig: SqliteConfig
) {
    private val storage = ConcurrentHashMap<String, Run>()
    private val json = Json { ignoreUnknownKeys = true }
    private val sqlClient = JimmerSqlClientFactory.create(sqliteConfig)

    fun save(run: Run): Run {
        if (sqlClient == null) {
            storage[run.id] = run
            return run
        }

        val entity = RunEntityDraft.`$`.produce {
            id = run.id
            templateId = run.templateId
            status = run.status.name
            currentStepId = run.currentStepId
            startedAt = run.startedAt
            finishedAt = run.finishedAt
            errorJson = run.error?.let { json.encodeToString(it) }
        }
        val saved = mapEntity(sqlClient.entities.save(entity).modifiedEntity)
        storage[saved.id] = saved
        return saved
    }

    fun findById(id: String): Run? {
        if (sqlClient == null) {
            return storage[id]
        }
        val entity = sqlClient.entities.findById(RunEntity::class, id) ?: return null
        return mapEntity(entity).also { storage[it.id] = it }
    }

    fun delete(id: String): Boolean {
        if (sqlClient == null) {
            return storage.remove(id) != null
        }

        val existing = sqlClient.entities.findById(RunEntity::class, id)
        val deleted = if (existing != null) {
            sqlClient.entities.delete(RunEntity::class, id).totalAffectedRowCount > 0
        } else {
            false
        }
        if (deleted) {
            storage.remove(id)
        }
        return deleted
    }

    fun list(
        templateId: String? = null,
        status: RunStatus? = null,
        from: Instant? = null,
        to: Instant? = null,
        limit: Int? = null,
        offset: Int? = null
    ): Pair<List<Run>, Int> {
        if (sqlClient != null) {
            return listFromJimmer(templateId, status, from, to, limit, offset)
        }

        val filtered = storage.values
            .asSequence()
            .filter { run -> templateId == null || run.templateId == templateId }
            .filter { run -> status == null || run.status == status }
            .filter { run ->
                val started = run.startedAt?.let { Instant.parse(it) } ?: Instant.MIN
                (from == null || started >= from) && (to == null || started <= to)
            }
            .sortedByDescending { run -> run.startedAt ?: "" }
            .toList()

        val total = filtered.size
        val safeOffset = offset ?: 0
        val safeLimit = limit ?: total
        val items = filtered.drop(safeOffset).take(safeLimit)
        return Pair(items, total)
    }

    private fun listFromJimmer(
        templateId: String?,
        status: RunStatus?,
        from: Instant?,
        to: Instant?,
        limit: Int?,
        offset: Int?
    ): Pair<List<Run>, Int> {
        val rows = sqlClient!!
            .createQuery(RunEntity::class) {
                select(table)
            }
            .execute()
            .map { mapEntity(it) }

        val filtered = rows.asSequence()
            .filter { run -> templateId == null || run.templateId == templateId }
            .filter { run -> status == null || run.status == status }
            .filter { run ->
                val started = run.startedAt?.let { Instant.parse(it) } ?: Instant.MIN
                (from == null || started >= from) && (to == null || started <= to)
            }
            .sortedByDescending { run -> run.startedAt ?: "" }
            .toList()

        filtered.forEach { storage[it.id] = it }
        val total = filtered.size
        val safeOffset = offset ?: 0
        val safeLimit = limit ?: total
        return Pair(filtered.drop(safeOffset).take(safeLimit), total)
    }

    private fun mapEntity(entity: RunEntity): Run {
        val errorJson = entity.errorJson
        val error = errorJson?.let { json.decodeFromString<RunError>(it) }
        return Run(
            id = entity.id,
            templateId = entity.templateId,
            status = RunStatus.valueOf(entity.status),
            currentStepId = entity.currentStepId,
            startedAt = entity.startedAt,
            finishedAt = entity.finishedAt,
            error = error
        )
    }
}
