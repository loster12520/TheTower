package com.thetower.repository

import com.thetower.models.Run
import com.thetower.models.RunError
import com.thetower.models.RunStatus
import com.thetower.utils.SqliteConfig
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.sql.DriverManager
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

class RunRepository(
    private val sqliteConfig: SqliteConfig
) {
    private val storage = ConcurrentHashMap<String, Run>()
    private val json = Json { ignoreUnknownKeys = true }

    fun save(run: Run): Run {
        if (!sqliteConfig.enabled) {
            storage[run.id] = run
            return run
        }

        DriverManager.getConnection(sqliteConfig.jdbcUrl).use { conn ->
            conn.prepareStatement(
                """
                INSERT INTO runs(
                  id, template_id, status, current_step_id, started_at, finished_at, error_json
                ) VALUES(?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  template_id = excluded.template_id,
                  status = excluded.status,
                  current_step_id = excluded.current_step_id,
                  started_at = excluded.started_at,
                  finished_at = excluded.finished_at,
                  error_json = excluded.error_json
                """.trimIndent()
            ).use { statement ->
                statement.setString(1, run.id)
                statement.setString(2, run.templateId)
                statement.setString(3, run.status.name)
                statement.setString(4, run.currentStepId)
                statement.setString(5, run.startedAt)
                statement.setString(6, run.finishedAt)
                statement.setString(7, run.error?.let { json.encodeToString(it) })
                statement.executeUpdate()
            }
        }

        storage[run.id] = run
        return run
    }

    fun findById(id: String): Run? {
        if (!sqliteConfig.enabled) {
            return storage[id]
        }

        DriverManager.getConnection(sqliteConfig.jdbcUrl).use { conn ->
            conn.prepareStatement(
                """
                SELECT id, template_id, status, current_step_id, started_at, finished_at, error_json
                FROM runs
                WHERE id = ?
                """.trimIndent()
            ).use { statement ->
                statement.setString(1, id)
                statement.executeQuery().use { rs ->
                    return if (rs.next()) mapRow(rs) else null
                }
            }
        }
    }

    fun delete(id: String): Boolean {
        if (!sqliteConfig.enabled) {
            return storage.remove(id) != null
        }

        DriverManager.getConnection(sqliteConfig.jdbcUrl).use { conn ->
            conn.prepareStatement("DELETE FROM runs WHERE id = ?").use { statement ->
                statement.setString(1, id)
                val deleted = statement.executeUpdate() > 0
                storage.remove(id)
                return deleted
            }
        }
    }

    fun list(
        templateId: String? = null,
        status: RunStatus? = null,
        from: Instant? = null,
        to: Instant? = null,
        limit: Int? = null,
        offset: Int? = null
    ): Pair<List<Run>, Int> {
        if (sqliteConfig.enabled) {
            return listFromSqlite(templateId, status, from, to, limit, offset)
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

    private fun listFromSqlite(
        templateId: String?,
        status: RunStatus?,
        from: Instant?,
        to: Instant?,
        limit: Int?,
        offset: Int?
    ): Pair<List<Run>, Int> {
        val where = mutableListOf<String>()
        val params = mutableListOf<Any>()

        if (templateId != null) {
            where += "template_id = ?"
            params += templateId
        }
        if (status != null) {
            where += "status = ?"
            params += status.name
        }
        if (from != null) {
            where += "(started_at IS NOT NULL AND started_at >= ?)"
            params += from.toString()
        }
        if (to != null) {
            where += "(started_at IS NOT NULL AND started_at <= ?)"
            params += to.toString()
        }

        val whereSql = if (where.isEmpty()) "" else " WHERE ${where.joinToString(" AND ")}" 
        val orderSql = " ORDER BY started_at DESC"
        val pageSql = buildString {
            if (limit != null) append(" LIMIT ?")
            if (offset != null) append(" OFFSET ?")
        }

        DriverManager.getConnection(sqliteConfig.jdbcUrl).use { conn ->
            val totalSql = "SELECT COUNT(*) FROM runs$whereSql"
            val total = conn.prepareStatement(totalSql).use { statement ->
                bindParams(statement, params)
                statement.executeQuery().use { rs ->
                    if (rs.next()) rs.getInt(1) else 0
                }
            }

            val querySql =
                "SELECT id, template_id, status, current_step_id, started_at, finished_at, error_json FROM runs$whereSql$orderSql$pageSql"
            val items = conn.prepareStatement(querySql).use { statement ->
                val queryParams = params.toMutableList()
                if (limit != null) queryParams += limit
                if (offset != null) queryParams += offset
                bindParams(statement, queryParams)
                statement.executeQuery().use { rs ->
                    val list = mutableListOf<Run>()
                    while (rs.next()) {
                        list += mapRow(rs)
                    }
                    list
                }
            }

            return Pair(items, total)
        }
    }

    private fun bindParams(statement: java.sql.PreparedStatement, params: List<Any>) {
        params.forEachIndexed { index, value ->
            when (value) {
                is String -> statement.setString(index + 1, value)
                is Int -> statement.setInt(index + 1, value)
                else -> statement.setObject(index + 1, value)
            }
        }
    }

    private fun mapRow(rs: java.sql.ResultSet): Run {
        val errorJson = rs.getString("error_json")
        val error = errorJson?.let { json.decodeFromString<RunError>(it) }
        return Run(
            id = rs.getString("id"),
            templateId = rs.getString("template_id"),
            status = RunStatus.valueOf(rs.getString("status")),
            currentStepId = rs.getString("current_step_id"),
            startedAt = rs.getString("started_at"),
            finishedAt = rs.getString("finished_at"),
            error = error
        )
    }
}
