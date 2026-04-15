package com.thetower.services

import com.thetower.models.ShareTemplateRequest
import com.thetower.models.TemplateAccessRecord
import com.thetower.models.TemplateCollaborationData
import com.thetower.models.TemplateCollaborator
import com.thetower.models.TemplatePermission
import com.thetower.models.TemplateSummary
import com.thetower.repository.TemplateCollaborationRepository
import com.thetower.utils.BadRequestException
import com.thetower.utils.ForbiddenException
import com.thetower.utils.nowIso

class TemplateCollaborationService(
    private val repository: TemplateCollaborationRepository,
    private val authService: AuthService,
    private val templateService: TemplateService
) {
    fun assignOwner(templateId: String, context: RequestAuthContext?) {
        if (context == null || repository.findByTemplateId(templateId) != null) {
            return
        }

        repository.save(
            TemplateAccessRecord(
                templateId = templateId,
                ownerUserId = context.userId,
                ownerUserName = context.userName,
                ownerWorkspaceId = context.workspaceId,
                ownerWorkspaceName = context.workspaceName
            )
        )
    }

    fun filterAccessibleTemplates(items: List<TemplateSummary>, context: RequestAuthContext?): List<TemplateSummary> {
        if (context == null) {
            return items
        }
        return items.filter { summary -> canRead(summary.id, context) }
    }

    fun ensureReadable(templateId: String, context: RequestAuthContext?) {
        if (context == null || canRead(templateId, context)) {
            return
        }
        throw ForbiddenException("模板 $templateId 不属于当前工作空间")
    }

    fun ensureEditable(templateId: String, context: RequestAuthContext?) {
        if (context == null || canEdit(templateId, context)) {
            return
        }
        throw ForbiddenException("模板 $templateId 当前仅允许查看")
    }

    fun getCollaboration(templateId: String, context: RequestAuthContext?): TemplateCollaborationData {
        templateService.getTemplateById(templateId)
        ensureReadable(templateId, context)
        val record = repository.findByTemplateId(templateId)
        val currentPermission = resolvePermission(record, context)
        if (record == null) {
            return TemplateCollaborationData(
                templateId = templateId,
                ownerUserId = context?.userId ?: "local-user",
                ownerUserName = context?.userName ?: "本地单机",
                ownerWorkspaceId = context?.workspaceId ?: "local-workspace",
                ownerWorkspaceName = context?.workspaceName ?: "默认空间",
                collaborators = emptyList(),
                currentPermission = currentPermission,
                shared = false
            )
        }

        return TemplateCollaborationData(
            templateId = templateId,
            ownerUserId = record.ownerUserId,
            ownerUserName = record.ownerUserName,
            ownerWorkspaceId = record.ownerWorkspaceId,
            ownerWorkspaceName = record.ownerWorkspaceName,
            collaborators = record.collaborators.sortedByDescending { collaborator -> collaborator.invitedAt },
            currentPermission = currentPermission,
            shared = record.collaborators.isNotEmpty()
        )
    }

    fun shareTemplate(templateId: String, request: ShareTemplateRequest, context: RequestAuthContext?): TemplateCollaborationData {
        val currentContext = context ?: throw ForbiddenException("登录后才能分享模板")
        templateService.getTemplateById(templateId)
        val existing = repository.findByTemplateId(templateId) ?: TemplateAccessRecord(
            templateId = templateId,
            ownerUserId = currentContext.userId,
            ownerUserName = currentContext.userName,
            ownerWorkspaceId = currentContext.workspaceId,
            ownerWorkspaceName = currentContext.workspaceName
        )

        if (existing.ownerUserId != currentContext.userId || existing.ownerWorkspaceId != currentContext.workspaceId) {
            throw ForbiddenException("只有模板拥有者可以分享模板")
        }

        val email = request.email.trim().lowercase()
        if (email.isEmpty()) {
            throw BadRequestException("email 不能为空", mapOf("field" to "email"))
        }

        val targetUser = authService.findUserByEmail(email)
            ?: throw BadRequestException("协作用户不存在", mapOf("field" to "email"))
        val targetWorkspace = targetUser.workspaces.firstOrNull { membership ->
            membership.workspaceId != currentContext.workspaceId
        } ?: targetUser.workspaces.firstOrNull()
            ?: throw BadRequestException("协作用户没有可用工作空间", mapOf("field" to "email"))

        val nextCollaborator = TemplateCollaborator(
            userId = targetUser.id,
            userName = targetUser.name,
            email = targetUser.email,
            workspaceId = targetWorkspace.workspaceId,
            workspaceName = targetWorkspace.workspaceName,
            permission = request.permission,
            invitedAt = nowIso()
        )

        val updated = existing.copy(
            collaborators = existing.collaborators
                .filterNot { collaborator -> collaborator.userId == nextCollaborator.userId && collaborator.workspaceId == nextCollaborator.workspaceId }
                .plus(nextCollaborator)
        )
        repository.save(updated)
        return getCollaboration(templateId, currentContext)
    }

    private fun canRead(templateId: String, context: RequestAuthContext): Boolean {
        val record = repository.findByTemplateId(templateId) ?: return true
        if (record.ownerUserId == context.userId && record.ownerWorkspaceId == context.workspaceId) {
            return true
        }
        return record.collaborators.any { collaborator ->
            collaborator.userId == context.userId && collaborator.workspaceId == context.workspaceId
        }
    }

    private fun canEdit(templateId: String, context: RequestAuthContext): Boolean {
        val record = repository.findByTemplateId(templateId) ?: return true
        if (record.ownerUserId == context.userId && record.ownerWorkspaceId == context.workspaceId) {
            return true
        }
        return record.collaborators.any { collaborator ->
            collaborator.userId == context.userId && collaborator.workspaceId == context.workspaceId &&
                collaborator.permission != TemplatePermission.VIEWER
        }
    }

    private fun resolvePermission(record: TemplateAccessRecord?, context: RequestAuthContext?): TemplatePermission {
        if (context == null) {
            return TemplatePermission.OWNER
        }
        if (record == null) {
            return TemplatePermission.OWNER
        }
        if (record.ownerUserId == context.userId && record.ownerWorkspaceId == context.workspaceId) {
            return TemplatePermission.OWNER
        }
        return record.collaborators.firstOrNull { collaborator ->
            collaborator.userId == context.userId && collaborator.workspaceId == context.workspaceId
        }?.permission ?: TemplatePermission.VIEWER
    }
}