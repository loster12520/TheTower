package com.thetower.models

import kotlinx.serialization.Serializable

@Serializable
data class WorkspaceMembership(
    val workspaceId: String,
    val workspaceName: String,
    val role: String
)

@Serializable
data class UserSession(
    val token: String,
    val userId: String,
    val name: String,
    val email: String,
    val workspaceId: String,
    val workspaceName: String,
    val role: String,
    val workspaces: List<WorkspaceMembership>,
    val issuedAt: String,
    val expiresAt: String
)

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
    val workspaceId: String? = null
)

@Serializable
data class LogoutData(
    val loggedOut: Boolean
)

@Serializable
data class WorkspaceListData(
    val items: List<WorkspaceMembership>
)