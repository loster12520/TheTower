package com.thetower.services

import com.thetower.models.LoginRequest
import com.thetower.models.UserSession
import com.thetower.models.WorkspaceMembership
import com.thetower.repository.AuthRepository
import com.thetower.repository.UserAccount
import com.thetower.utils.BadRequestException
import com.thetower.utils.UnauthorizedException
import com.thetower.utils.WorkspaceForbiddenException
import com.thetower.utils.newId
import com.thetower.utils.nowIso
import java.time.Instant

data class RequestAuthContext(
    val token: String,
    val userId: String,
    val userName: String,
    val email: String,
    val workspaceId: String,
    val workspaceName: String,
    val role: String,
    val workspaces: List<WorkspaceMembership>
)

class AuthService(
    private val authRepository: AuthRepository
) {
    fun login(request: LoginRequest): UserSession {
        val email = request.email.trim()
        val password = request.password.trim()
        if (email.isEmpty()) {
            throw BadRequestException("email 不能为空", mapOf("field" to "email"))
        }
        if (password.isEmpty()) {
            throw BadRequestException("password 不能为空", mapOf("field" to "password"))
        }

        val user = authRepository.findUserByEmail(email)
            ?: throw UnauthorizedException("账号或密码错误")
        if (user.password != password) {
            throw UnauthorizedException("账号或密码错误")
        }

        val workspace = resolveWorkspace(user, request.workspaceId)
        val now = Instant.now()
        val session = UserSession(
            token = newId(),
            userId = user.id,
            name = user.name,
            email = user.email,
            workspaceId = workspace.workspaceId,
            workspaceName = workspace.workspaceName,
            role = workspace.role,
            workspaces = user.workspaces,
            issuedAt = now.toString(),
            expiresAt = now.plusSeconds(7 * 24 * 60 * 60).toString()
        )
        return authRepository.saveSession(session)
    }

    fun logout(token: String): Boolean = authRepository.deleteSession(token)

    fun getMe(token: String, workspaceOverride: String? = null): UserSession {
        val context = requireContext(token, workspaceOverride)
        return UserSession(
            token = context.token,
            userId = context.userId,
            name = context.userName,
            email = context.email,
            workspaceId = context.workspaceId,
            workspaceName = context.workspaceName,
            role = context.role,
            workspaces = context.workspaces,
            issuedAt = nowIso(),
            expiresAt = authRepository.findSession(token)?.expiresAt ?: nowIso()
        )
    }

    fun getWorkspaces(token: String, workspaceOverride: String? = null): List<WorkspaceMembership> {
        return requireContext(token, workspaceOverride).workspaces
    }

    fun resolveContext(token: String?, workspaceOverride: String? = null): RequestAuthContext? {
        val normalizedToken = token?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val session = authRepository.findSession(normalizedToken)
            ?: throw UnauthorizedException("登录已失效，请重新登录")
        if (Instant.parse(session.expiresAt).isBefore(Instant.now())) {
            authRepository.deleteSession(normalizedToken)
            throw UnauthorizedException("登录已失效，请重新登录")
        }

        val workspace = session.workspaces.firstOrNull { membership ->
            workspaceOverride.isNullOrBlank() || membership.workspaceId == workspaceOverride
        } ?: throw WorkspaceForbiddenException("当前账号无权访问工作空间 ${workspaceOverride ?: session.workspaceId}")

        return RequestAuthContext(
            token = normalizedToken,
            userId = session.userId,
            userName = session.name,
            email = session.email,
            workspaceId = workspace.workspaceId,
            workspaceName = workspace.workspaceName,
            role = workspace.role,
            workspaces = session.workspaces
        )
    }

    fun requireContext(token: String?, workspaceOverride: String? = null): RequestAuthContext {
        return resolveContext(token, workspaceOverride)
            ?: throw UnauthorizedException("请先登录")
    }

    fun findUserByEmail(email: String): UserAccount? = authRepository.findUserByEmail(email)

    private fun resolveWorkspace(user: UserAccount, workspaceId: String?): WorkspaceMembership {
        if (workspaceId.isNullOrBlank()) {
            return user.workspaces.first()
        }
        return user.workspaces.firstOrNull { membership -> membership.workspaceId == workspaceId }
            ?: throw WorkspaceForbiddenException("当前账号无权访问工作空间 $workspaceId")
    }
}