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
    val error: RunError? = null,
    val outputs: Map<String, String> = emptyMap(),
    val artifacts: List<RunArtifact> = emptyList()
)

@Serializable
data class RunError(
    val code: String,
    val message: String
)

@Serializable
data class RunArtifact(
    val artifactId: String,
    val name: String,
    val kind: String,
    val relativePath: String,
    val createdAt: String
)

@Serializable
data class StartRunRequest(
    val templateId: String,
    val dryRun: Boolean = false,
    val debug: RunDebugOptions? = null
)

@Serializable
data class StartRunData(
    val run: Run,
    val wsUrl: String,
    val debug: RunDebugSession? = null
)

@Serializable
data class RunListData(
    val items: List<Run>,
    val total: Int
)

@Serializable
data class RunDebugOptions(
    val enabled: Boolean = false,
    val openVisibleBrowser: Boolean = false,
    val openDevtools: Boolean = false,
    val previewFps: Int = 2,
    val previewQuality: Int = 60
)

@Serializable
enum class DebugSessionStatus {
    IDLE,
    STARTING,
    STREAMING,
    CLOSED,
    ERROR
}

@Serializable
data class RunDebugSession(
    val enabled: Boolean,
    val openVisibleBrowser: Boolean = false,
    val openDevtools: Boolean = false,
    val previewFps: Int = 2,
    val previewQuality: Int = 60,
    val status: DebugSessionStatus = DebugSessionStatus.IDLE,
    val pageAlias: String? = null,
    val contextId: String? = null,
    val lastFrameTs: String? = null,
    val lastError: String? = null
)
