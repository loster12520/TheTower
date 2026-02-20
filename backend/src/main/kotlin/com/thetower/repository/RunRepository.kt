package com.thetower.repository

import com.thetower.models.Run
import com.thetower.models.RunStatus
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

class RunRepository {
    private val storage = ConcurrentHashMap<String, Run>()

    fun save(run: Run): Run {
        storage[run.id] = run
        return run
    }

    fun findById(id: String): Run? = storage[id]

    fun delete(id: String): Boolean = storage.remove(id) != null

    fun list(
        templateId: String? = null,
        status: RunStatus? = null,
        from: Instant? = null,
        to: Instant? = null,
        limit: Int? = null,
        offset: Int? = null
    ): Pair<List<Run>, Int> {
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
}
