package com.thetower.models

import kotlinx.serialization.Serializable

@Serializable
enum class RunStatus {
    PENDING,
    RUNNING,
    SUCCEEDED,
    FAILED,
    CANCELED
}

@Serializable
data class Run(
    val id: String,
    val templateId: String,
    val status: RunStatus,
    val currentStepId: String? = null,
    val startedAt: String? = null,
    val finishedAt: String? = null,
    val error: RunError? = null
)

@Serializable
data class RunError(
    val code: String,
    val message: String
)

@Serializable
data class StartRunRequest(
    val templateId: String,
    val dryRun: Boolean = false
)

@Serializable
data class StartRunData(
    val run: Run,
    val wsUrl: String
)

@Serializable
data class RunListData(
    val items: List<Run>,
    val total: Int
)
