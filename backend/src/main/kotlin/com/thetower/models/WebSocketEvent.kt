package com.thetower.models

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class RunEvent(
    val runId: String,
    val requestId: String? = null,
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
    DEBUG_SESSION_STARTED,
    DEBUG_FRAME,
    DEBUG_STATUS_CHANGED,
    DEBUG_SESSION_CLOSED,
    DEBUG_ERROR,
    RUN_SUCCEEDED,
    RUN_FAILED,
    RUN_CANCELED
}
