package com.thetower.repository

import com.thetower.models.LastRun
import com.thetower.models.OtherStep
import com.thetower.models.StepNode
import com.thetower.models.TemplateStats
import com.thetower.models.WorkflowTemplate
import com.thetower.utils.SqliteConfig
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.sql.DriverManager
import java.util.concurrent.ConcurrentHashMap

class TemplateRepository(
    private val sqliteConfig: SqliteConfig
) {
    private val storage = ConcurrentHashMap<String, WorkflowTemplate>()
    private val json = Json { ignoreUnknownKeys = true }

    fun findAll(): List<WorkflowTemplate> {
        if (!sqliteConfig.enabled) {
            return storage.values.toList()
        }

        DriverManager.getConnection(sqliteConfig.jdbcUrl).use { conn ->
            conn.prepareStatement(
                """
                SELECT id, name, description, schema_version, steps_json, other_step_json,
                       created_at, updated_at, stats_step_count, last_run_json
                FROM templates
                """.trimIndent()
            ).use { statement ->
                statement.executeQuery().use { rs ->
                    val items = mutableListOf<WorkflowTemplate>()
                    while (rs.next()) {
                        items += mapRow(rs)
                    }
                    return items
                }
            }
        }
    }

    fun findById(id: String): WorkflowTemplate? {
        if (!sqliteConfig.enabled) {
            return storage[id]
        }

        DriverManager.getConnection(sqliteConfig.jdbcUrl).use { conn ->
            conn.prepareStatement(
                """
                SELECT id, name, description, schema_version, steps_json, other_step_json,
                       created_at, updated_at, stats_step_count, last_run_json
                FROM templates
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

    fun save(template: WorkflowTemplate): WorkflowTemplate {
        if (!sqliteConfig.enabled) {
            storage[template.id] = template
            return template
        }

        DriverManager.getConnection(sqliteConfig.jdbcUrl).use { conn ->
            conn.prepareStatement(
                """
                INSERT INTO templates(
                  id, name, description, schema_version, steps_json, other_step_json,
                  created_at, updated_at, stats_step_count, last_run_json
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  name = excluded.name,
                  description = excluded.description,
                  schema_version = excluded.schema_version,
                  steps_json = excluded.steps_json,
                  other_step_json = excluded.other_step_json,
                  created_at = excluded.created_at,
                  updated_at = excluded.updated_at,
                  stats_step_count = excluded.stats_step_count,
                  last_run_json = excluded.last_run_json
                """.trimIndent()
            ).use { statement ->
                statement.setString(1, template.id)
                statement.setString(2, template.name)
                statement.setString(3, template.description)
                statement.setString(4, template.schemaVersion)
                statement.setString(5, json.encodeToString(template.steps))
                statement.setString(6, json.encodeToString(template.otherStep))
                statement.setString(7, template.createdAt)
                statement.setString(8, template.updatedAt)
                statement.setInt(9, template.stats.stepCount)
                statement.setString(10, template.lastRun?.let { json.encodeToString(it) })
                statement.executeUpdate()
            }
        }

        storage[template.id] = template
        return template
    }

    fun delete(id: String): Boolean {
        if (!sqliteConfig.enabled) {
            return storage.remove(id) != null
        }

        DriverManager.getConnection(sqliteConfig.jdbcUrl).use { conn ->
            conn.prepareStatement("DELETE FROM templates WHERE id = ?").use { statement ->
                statement.setString(1, id)
                val deleted = statement.executeUpdate() > 0
                storage.remove(id)
                return deleted
            }
        }
    }

    private fun mapRow(rs: java.sql.ResultSet): WorkflowTemplate {
        val steps = json.decodeFromString<List<StepNode>>(rs.getString("steps_json"))
        val otherStep = json.decodeFromString<OtherStep>(rs.getString("other_step_json"))
        val lastRunJson = rs.getString("last_run_json")
        val lastRun = lastRunJson?.let { json.decodeFromString<LastRun>(it) }

        return WorkflowTemplate(
            id = rs.getString("id"),
            name = rs.getString("name"),
            description = rs.getString("description"),
            schemaVersion = rs.getString("schema_version"),
            steps = steps,
            otherStep = otherStep,
            createdAt = rs.getString("created_at"),
            updatedAt = rs.getString("updated_at"),
            stats = TemplateStats(stepCount = rs.getInt("stats_step_count")),
            lastRun = lastRun
        )
    }
}
