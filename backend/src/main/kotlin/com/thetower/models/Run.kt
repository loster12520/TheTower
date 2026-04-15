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
data class RunLaunchOptions(
    val browser: String = "chromium",
    val headless: Boolean = true,
    val defaultTimeoutMs: Double = 10_000.0
)

@Serializable
data class StartRunRequest(
    val templateId: String,
    val dryRun: Boolean = false,
    val debug: RunDebugOptions? = null,
    val launchOptions: RunLaunchOptions? = null
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
    val previewQuality: Int = 60,
    val pauseOnStart: Boolean = false,
    val breakpoints: List<String> = emptyList(),
    val keepBrowserOnFinish: Boolean = true
)

@Serializable
enum class DebugSessionStatus {
    IDLE,
    STARTING,
    STREAMING,
    PAUSED,
    COMPLETED_WAITING_CLOSE,
    FAILED_WAITING_CLOSE,
    CLOSED,
    ERROR
}

@Serializable
data class RunDebugContextSnapshot(
    val stepId: String? = null,
    val stepName: String? = null,
    val stepType: String? = null,
    val stepPath: List<String> = emptyList(),
    val pageAlias: String? = null,
    val contextId: String? = null,
    val variables: Map<String, String> = emptyMap(),
    val updatedAt: String? = null
)

@Serializable
data class RunDebugSession(
    val enabled: Boolean,
    val openVisibleBrowser: Boolean = false,
    val openDevtools: Boolean = false,
    val previewFps: Int = 2,
    val previewQuality: Int = 60,
    val pauseOnStart: Boolean = false,
    val breakpoints: List<String> = emptyList(),
    val keepBrowserOnFinish: Boolean = true,
    val status: DebugSessionStatus = DebugSessionStatus.IDLE,
    val currentStepId: String? = null,
    val currentStepName: String? = null,
    val currentStepPath: List<String> = emptyList(),
    val pageAlias: String? = null,
    val contextId: String? = null,
    val lastFrameTs: String? = null,
    val lastError: String? = null,
    val latestContext: RunDebugContextSnapshot? = null
)

@Serializable
data class DebugRemoteControlRequest(
    val action: String,
    val x: Int? = null,
    val y: Int? = null,
    val text: String? = null,
    val clearBeforeType: Boolean = false
)

@Serializable
data class DebugRemoteControlData(
    val session: RunDebugSession,
    val latestContext: RunDebugContextSnapshot? = null,
    val previewFrame: DebugPreviewFrameData? = null,
    val actionSummary: String
)

@Serializable
data class DebugPreviewFrameData(
    val mimeType: String,
    val frameBase64: String,
    val width: Int,
    val height: Int,
    val pageAlias: String? = null,
    val contextId: String? = null,
    val ts: String
)
