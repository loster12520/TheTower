package com.thetower.services

import com.thetower.executor.PlaywrightExecutorConfig
import com.thetower.executor.PlaywrightRunExecutor
import com.thetower.models.CreateScheduleRequest
import com.thetower.models.PatchScheduleRequest
import com.thetower.models.ScheduleTriggerType
import com.thetower.repository.RunRepository
import com.thetower.repository.ScheduleRepository
import com.thetower.repository.TemplateRepository
import com.thetower.utils.SqliteConfig
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SchedulerServiceTest {
    @Test
    fun `scheduler service creates updates and deletes schedules`() {
        val sqliteConfig = SqliteConfig(enabled = false, jdbcUrl = "jdbc:sqlite::memory:")
        val templateService = TemplateService(TemplateRepository(sqliteConfig))
        val runRepository = RunRepository(sqliteConfig)
        val runService = RunService(runRepository, templateService, PlaywrightRunExecutor(PlaywrightExecutorConfig()))
        val scheduleRepository = ScheduleRepository(Files.createTempDirectory("thetower-schedule-test").resolve("schedules.json"))
        val schedulerService = SchedulerService(scheduleRepository, templateService, runService, runRepository)

        val template = templateService.createTemplate(
            com.thetower.models.CreateTemplateRequest(
                name = "调度模板",
                schemaVersion = "0.0.8"
            )
        )

        val created = schedulerService.createSchedule(
            CreateScheduleRequest(
                templateId = template.id,
                triggerType = ScheduleTriggerType.ONE_TIME,
                delaySeconds = 5
            )
        )
        val updated = schedulerService.updateSchedule(
            created.id,
            PatchScheduleRequest(
                triggerType = ScheduleTriggerType.INTERVAL,
                intervalSeconds = 10,
                enabled = false
            )
        )
        val list = schedulerService.listSchedules(templateId = template.id)
        val deleted = schedulerService.deleteSchedule(created.id)

        assertEquals(template.id, created.templateId)
        assertEquals(ScheduleTriggerType.INTERVAL, updated.triggerType)
        assertEquals(10, updated.intervalSeconds)
        assertFalse(updated.enabled)
        assertEquals(1, list.size)
        assertTrue(deleted)
        assertTrue(schedulerService.listSchedules(templateId = template.id).isEmpty())
    }
}