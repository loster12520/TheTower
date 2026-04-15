package com.thetower.services

import com.thetower.models.CreateScheduleRequest
import com.thetower.models.PatchScheduleRequest
import com.thetower.models.RunError
import com.thetower.models.Schedule
import com.thetower.models.ScheduleTriggerType
import com.thetower.repository.RunRepository
import com.thetower.repository.ScheduleRepository
import com.thetower.utils.ApiException
import com.thetower.utils.BadRequestException
import com.thetower.utils.ErrorCodes
import com.thetower.utils.newId
import com.thetower.utils.nowIso
import io.github.oshai.kotlinlogging.KotlinLogging
import java.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class SchedulerService(
    private val scheduleRepository: ScheduleRepository,
    private val templateService: TemplateService,
    private val runService: RunService,
    private val runRepository: RunRepository
) {
    private val logger = KotlinLogging.logger {}
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    init {
        scope.launch {
            schedulerLoop()
        }
    }

    fun listSchedules(templateId: String? = null, enabled: Boolean? = null): List<Schedule> {
        return scheduleRepository.findAll()
            .asSequence()
            .filter { schedule -> templateId == null || schedule.templateId == templateId }
            .filter { schedule -> enabled == null || schedule.enabled == enabled }
            .sortedByDescending { it.updatedAt }
            .map(::resolveScheduleRunStatus)
            .toList()
    }

    fun createSchedule(request: CreateScheduleRequest): Schedule {
        val template = templateService.getTemplateById(request.templateId)
        validateScheduleConfig(request.triggerType, request.delaySeconds, request.intervalSeconds)

        val now = nowIso()
        val schedule = Schedule(
            id = newId(),
            templateId = template.id,
            templateName = template.name,
            triggerType = request.triggerType,
            delaySeconds = request.delaySeconds,
            intervalSeconds = request.intervalSeconds,
            enabled = request.enabled,
            nextTriggerAt = if (request.enabled) nextTriggerAt(request.triggerType, request.delaySeconds, request.intervalSeconds, Instant.now()) else null,
            createdAt = now,
            updatedAt = now
        )
        return scheduleRepository.save(schedule)
    }

    fun updateSchedule(id: String, request: PatchScheduleRequest): Schedule {
        val current = scheduleRepository.findById(id)
            ?: throw BadRequestException("调度任务不存在: $id", mapOf("field" to "id"))

        val nextTriggerType = request.triggerType ?: current.triggerType
        val nextDelaySeconds = if (request.triggerType == ScheduleTriggerType.ONE_TIME || nextTriggerType == ScheduleTriggerType.ONE_TIME) {
            request.delaySeconds ?: current.delaySeconds
        } else {
            null
        }
        val nextIntervalSeconds = if (request.triggerType == ScheduleTriggerType.INTERVAL || nextTriggerType == ScheduleTriggerType.INTERVAL) {
            request.intervalSeconds ?: current.intervalSeconds
        } else {
            null
        }
        val nextEnabled = request.enabled ?: current.enabled
        validateScheduleConfig(nextTriggerType, nextDelaySeconds, nextIntervalSeconds)

        val updated = current.copy(
            triggerType = nextTriggerType,
            delaySeconds = nextDelaySeconds,
            intervalSeconds = nextIntervalSeconds,
            enabled = nextEnabled,
            nextTriggerAt = if (nextEnabled) nextTriggerAt(nextTriggerType, nextDelaySeconds, nextIntervalSeconds, Instant.now()) else null,
            updatedAt = nowIso()
        )
        return scheduleRepository.save(updated)
    }

    fun deleteSchedule(id: String): Boolean {
        if (!scheduleRepository.delete(id)) {
            throw BadRequestException("调度任务不存在: $id", mapOf("field" to "id"))
        }
        return true
    }

    internal fun triggerDueSchedules(now: Instant = Instant.now()) {
        val dueSchedules = scheduleRepository.findAll()
            .asSequence()
            .filter { it.enabled }
            .filter { schedule ->
                val next = schedule.nextTriggerAt?.let(Instant::parse) ?: return@filter false
                !next.isAfter(now)
            }
            .sortedBy { it.nextTriggerAt }
            .toList()

        dueSchedules.forEach { schedule ->
            triggerSchedule(schedule, now)
        }
    }

    private suspend fun schedulerLoop() {
        while (scope.isActive) {
            runCatching {
                triggerDueSchedules()
            }.onFailure { ex ->
                logger.error(ex) { "schedule.tick.failed" }
            }
            delay(1_000)
        }
    }

    private fun triggerSchedule(schedule: Schedule, now: Instant) {
        val nextScheduleState = if (schedule.triggerType == ScheduleTriggerType.INTERVAL) {
            schedule.copy(
                nextTriggerAt = nextTriggerAt(schedule.triggerType, schedule.delaySeconds, schedule.intervalSeconds, now),
                updatedAt = nowIso()
            )
        } else {
            schedule.copy(
                enabled = false,
                nextTriggerAt = null,
                updatedAt = nowIso()
            )
        }
        scheduleRepository.save(nextScheduleState)

        try {
            val started = runService.startRun(schedule.templateId, dryRun = false, requestId = "schedule:${schedule.id}")
            scheduleRepository.save(
                nextScheduleState.copy(
                    lastTriggeredAt = now.toString(),
                    lastRunId = started.run.id,
                    lastRunStatus = started.run.status.name,
                    lastError = null,
                    updatedAt = nowIso()
                )
            )
        } catch (ex: Exception) {
            val error = when (ex) {
                is ApiException -> RunError(ex.code, ex.message)
                else -> RunError(ErrorCodes.INTERNAL_ERROR, ex.message ?: "调度触发失败")
            }
            scheduleRepository.save(
                nextScheduleState.copy(
                    lastTriggeredAt = now.toString(),
                    lastError = error,
                    updatedAt = nowIso()
                )
            )
        }
    }

    private fun resolveScheduleRunStatus(schedule: Schedule): Schedule {
        val currentStatus = schedule.lastRunId?.let { runRepository.findById(it)?.status?.name } ?: schedule.lastRunStatus
        return schedule.copy(lastRunStatus = currentStatus)
    }

    private fun validateScheduleConfig(triggerType: ScheduleTriggerType, delaySeconds: Int?, intervalSeconds: Int?) {
        when (triggerType) {
            ScheduleTriggerType.ONE_TIME -> {
                if (delaySeconds == null || delaySeconds <= 0) {
                    throw BadRequestException("单次调度必须填写大于 0 的 delaySeconds", mapOf("field" to "delaySeconds"))
                }
            }

            ScheduleTriggerType.INTERVAL -> {
                if (intervalSeconds == null || intervalSeconds <= 0) {
                    throw BadRequestException("间隔调度必须填写大于 0 的 intervalSeconds", mapOf("field" to "intervalSeconds"))
                }
            }
        }
    }

    private fun nextTriggerAt(triggerType: ScheduleTriggerType, delaySeconds: Int?, intervalSeconds: Int?, now: Instant): String {
        return when (triggerType) {
            ScheduleTriggerType.ONE_TIME -> now.plusSeconds(delaySeconds!!.toLong()).toString()
            ScheduleTriggerType.INTERVAL -> now.plusSeconds(intervalSeconds!!.toLong()).toString()
        }
    }
}