package com.thetower.models

import kotlinx.serialization.Serializable

@Serializable
enum class ScheduleTriggerType {
    ONE_TIME,
    INTERVAL
}

@Serializable
data class Schedule(
    val id: String,
    val templateId: String,
    val templateName: String,
    val triggerType: ScheduleTriggerType,
    val delaySeconds: Int? = null,
    val intervalSeconds: Int? = null,
    val enabled: Boolean = true,
    val nextTriggerAt: String? = null,
    val lastTriggeredAt: String? = null,
    val lastRunId: String? = null,
    val lastRunStatus: String? = null,
    val lastError: RunError? = null,
    val createdAt: String,
    val updatedAt: String
)

@Serializable
data class CreateScheduleRequest(
    val templateId: String,
    val triggerType: ScheduleTriggerType,
    val delaySeconds: Int? = null,
    val intervalSeconds: Int? = null,
    val enabled: Boolean = true
)

@Serializable
data class PatchScheduleRequest(
    val triggerType: ScheduleTriggerType? = null,
    val delaySeconds: Int? = null,
    val intervalSeconds: Int? = null,
    val enabled: Boolean? = null
)

@Serializable
data class ScheduleListData(
    val items: List<Schedule>
)