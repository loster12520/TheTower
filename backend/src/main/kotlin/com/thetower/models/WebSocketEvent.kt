package com.thetower.models

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class RunEvent(
    val runId: String,
    val seq: Long,
    val ts: String,
    val type: EventType,
    val payload: JsonObject
)

@Serializable
enum class EventType {
    RUN_STARTED,
    STEP_STARTED,
    STEP_SUCCEEDED,
    STEP_FAILED,
    LOG,
    RUN_SUCCEEDED,
    RUN_FAILED,
    RUN_CANCELED
}
