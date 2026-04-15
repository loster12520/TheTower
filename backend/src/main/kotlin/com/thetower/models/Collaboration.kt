package com.thetower.models

import kotlinx.serialization.Serializable

@Serializable
enum class TemplatePermission {
    OWNER,
    EDITOR,
    VIEWER,
}

@Serializable
data class TemplateCollaborator(
    val userId: String,
    val userName: String,
    val email: String,
    val workspaceId: String,
    val workspaceName: String,
    val permission: TemplatePermission,
    val invitedAt: String,
    val lastActiveAt: String? = null
)

@Serializable
data class TemplateAccessRecord(
    val templateId: String,
    val ownerUserId: String,
    val ownerUserName: String,
    val ownerWorkspaceId: String,
    val ownerWorkspaceName: String,
    val collaborators: List<TemplateCollaborator> = emptyList()
)

@Serializable
data class TemplateCollaborationData(
    val templateId: String,
    val ownerUserId: String,
    val ownerUserName: String,
    val ownerWorkspaceId: String,
    val ownerWorkspaceName: String,
    val collaborators: List<TemplateCollaborator>,
    val currentPermission: TemplatePermission,
    val shared: Boolean
)

@Serializable
data class TemplatePresenceMember(
    val userId: String,
    val userName: String,
    val email: String,
    val workspaceId: String,
    val workspaceName: String,
    val role: String,
    val joinedAt: String,
    val lastSeenAt: String
)

@Serializable
data class TemplatePatchAppliedData(
    val templateId: String,
    val savedByUserId: String,
    val savedByUserName: String,
    val savedByWorkspaceId: String,
    val savedByWorkspaceName: String,
    val updatedAt: String
)

@Serializable
data class TemplatePresenceData(
    val templateId: String,
    val members: List<TemplatePresenceMember>,
    val onlineCount: Int,
    val updatedAt: String,
    val latestPatch: TemplatePatchAppliedData? = null
)

@Serializable
data class TemplatePresenceChangedEvent(
    val type: String = "COLLABORATION_PRESENCE_CHANGED",
    val data: TemplatePresenceData
)

@Serializable
data class TemplatePatchAppliedEvent(
    val type: String = "COLLABORATION_PATCH_APPLIED",
    val data: TemplatePatchAppliedData
)

@Serializable
data class ShareTemplateRequest(
    val email: String,
    val permission: TemplatePermission = TemplatePermission.VIEWER
)