package com.thetower.utils

import io.github.oshai.kotlinlogging.KotlinLogging
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.sql.Connection
import java.sql.DriverManager
import java.time.Instant

private val logger = KotlinLogging.logger {}

data class SqliteConfig(
    val enabled: Boolean,
    val jdbcUrl: String
)

fun ensureSqliteReady(jdbcUrl: String) {
    val dbFilePath = jdbcUrl.removePrefix("jdbc:sqlite:")
    val path = Paths.get(dbFilePath)
    createParentDirectories(path)

    DriverManager.getConnection(jdbcUrl).use { conn ->
        conn.autoCommit = false
        ensureMigrationTable(conn)
        applyMigration(conn, 1, "db/migration/V1__init.sql")
        applyMigration(conn, 2, "db/migration/V2__add_indexes.sql")
        applyMigration(conn, 3, "db/migration/V3__ensure_runs_table.sql")
        applyMigration(conn, 4, "db/migration/V4__add_run_outputs_and_artifacts.sql")
        applyMigration(conn, 5, "db/migration/V5__add_template_groups_and_tags.sql")
        conn.commit()
    }

    logger.info { "sqlite.ready jdbcUrl=$jdbcUrl" }
}

private fun createParentDirectories(path: Path) {
    val parent = path.parent ?: return
    if (!Files.exists(parent)) {
        Files.createDirectories(parent)
    }
}

private fun ensureMigrationTable(connection: Connection) {
    connection.createStatement().use { statement ->
        statement.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
              version INTEGER PRIMARY KEY,
              applied_at TEXT NOT NULL
            )
            """.trimIndent()
        )
    }
}

private fun applyMigration(connection: Connection, version: Int, resourcePath: String) {
    if (isMigrationApplied(connection, version)) {
        return
    }

    val sql = loadResource(resourcePath)
    connection.createStatement().use { statement ->
        sql.split(";")
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .forEach { statement.execute(it) }
    }

    connection.prepareStatement("INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)").use {
        it.setInt(1, version)
        it.setString(2, Instant.now().toString())
        it.executeUpdate()
    }

    logger.info { "sqlite.migration.applied version=$version resource=$resourcePath" }
}

private fun isMigrationApplied(connection: Connection, version: Int): Boolean {
    connection.prepareStatement("SELECT 1 FROM schema_migrations WHERE version = ?").use {
        it.setInt(1, version)
        it.executeQuery().use { rs ->
            return rs.next()
        }
    }
}

private fun loadResource(resourcePath: String): String {
    val stream = Thread.currentThread().contextClassLoader.getResourceAsStream(resourcePath)
        ?: error("Migration resource not found: $resourcePath")
    return stream.bufferedReader().use { it.readText() }
}
