package com.thetower.repository

import com.thetower.models.Run
import com.thetower.models.RunArtifact
import com.thetower.models.RunStatus
import com.thetower.utils.SqliteConfig
import com.thetower.utils.ensureSqliteReady
import java.nio.file.Files
import kotlin.io.path.deleteIfExists
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class RunRepositoryTest {
    @Test
    fun `save and findById persist outputs and artifacts in sqlite`() {
        val dbDir = Files.createTempDirectory("thetower-run-repo-test")
        val dbPath = dbDir.resolve("runs.db")
        val sqliteConfig = SqliteConfig(enabled = true, jdbcUrl = "jdbc:sqlite:${dbPath.toAbsolutePath()}")

        try {
            ensureSqliteReady(sqliteConfig.jdbcUrl)
            val repository = RunRepository(sqliteConfig)
            val run = Run(
                id = "run-1",
                templateId = "template-1",
                status = RunStatus.RUNNING,
                currentStepId = "step-1",
                startedAt = "2026-03-28T10:00:00Z",
                finishedAt = null,
                error = null,
                outputs = mapOf("title" to "Example Domain"),
                artifacts = listOf(
                    RunArtifact(
                        artifactId = "artifact-1",
                        name = "homepage.png",
                        kind = "screenshot",
                        relativePath = "data/runs/run-1/artifacts/homepage.png",
                        createdAt = "2026-03-28T10:00:01Z"
                    )
                )
            )

            repository.save(run)

            val saved = repository.findById("run-1")
            assertNotNull(saved)
            assertEquals(run.outputs, saved.outputs)
            assertEquals(run.artifacts, saved.artifacts)
        } finally {
            dbPath.deleteIfExists()
            dbDir.deleteIfExists()
        }
    }
}