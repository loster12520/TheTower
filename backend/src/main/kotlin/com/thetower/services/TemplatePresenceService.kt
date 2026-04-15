package com.thetower.services

import com.thetower.models.TemplatePresenceChangedEvent
import com.thetower.models.TemplatePresenceData
import com.thetower.models.TemplatePresenceMember
import com.thetower.models.TemplatePatchAppliedData
import com.thetower.models.TemplatePatchAppliedEvent
import com.thetower.utils.ForbiddenException
import com.thetower.utils.nowIso
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class TemplatePresenceService(
    private val collaborationService: TemplateCollaborationService
) {
    private data class PresenceEntry(
        val userId: String,
        val userName: String,
        val email: String,
        val workspaceId: String,
        val workspaceName: String,
        val role: String,
        val joinedAt: String,
        var lastSeenAt: String,
    )

    private val onlineMembers = ConcurrentHashMap<String, ConcurrentHashMap<String, PresenceEntry>>()
    private val latestPatchMap = ConcurrentHashMap<String, TemplatePatchAppliedData>()
    private val eventFlows = ConcurrentHashMap<String, MutableSharedFlow<String>>()
    private val staleAfter = Duration.ofSeconds(30)
    private val json = Json { ignoreUnknownKeys = true }

    fun getPresence(templateId: String, context: RequestAuthContext?): TemplatePresenceData {
        val currentContext = context ?: throw ForbiddenException("登录后才能查看在线协作状态")
        collaborationService.ensureReadable(templateId, currentContext)
        pruneStaleMembers(templateId)
        return snapshot(templateId)
    }

    fun heartbeat(templateId: String, context: RequestAuthContext?): TemplatePresenceData {
        val currentContext = context ?: throw ForbiddenException("登录后才能进入在线协作")
        collaborationService.ensureReadable(templateId, currentContext)

        val now = nowIso()
        val memberKey = buildMemberKey(currentContext)
        val templateMembers = onlineMembers.computeIfAbsent(templateId) { ConcurrentHashMap() }
        val current = templateMembers[memberKey]
        templateMembers[memberKey] = PresenceEntry(
            userId = currentContext.userId,
            userName = currentContext.userName,
            email = currentContext.email,
            workspaceId = currentContext.workspaceId,
            workspaceName = currentContext.workspaceName,
            role = currentContext.role,
            joinedAt = current?.joinedAt ?: now,
            lastSeenAt = now,
        )
        return publish(templateId)
    }

    fun leave(templateId: String, context: RequestAuthContext?) {
        val currentContext = context ?: return
        val templateMembers = onlineMembers[templateId] ?: return
        templateMembers.remove(buildMemberKey(currentContext))
        if (templateMembers.isEmpty()) {
            onlineMembers.remove(templateId)
        }
        publish(templateId)
    }

    fun currentPresenceEvent(templateId: String, context: RequestAuthContext?): String {
        val currentContext = context ?: throw ForbiddenException("登录后才能订阅在线协作")
        collaborationService.ensureReadable(templateId, currentContext)
        pruneStaleMembers(templateId)
        return json.encodeToString(TemplatePresenceChangedEvent(data = snapshot(templateId)))
    }

    fun eventFlow(templateId: String, context: RequestAuthContext?): SharedFlow<String> {
        val currentContext = context ?: throw ForbiddenException("登录后才能订阅在线协作")
        collaborationService.ensureReadable(templateId, currentContext)
        pruneStaleMembers(templateId)
        return eventFlows.computeIfAbsent(templateId) {
            MutableSharedFlow(replay = 16, extraBufferCapacity = 64)
        }
    }

    fun publishPatch(templateId: String, context: RequestAuthContext?, updatedAt: String) {
        val currentContext = context ?: return
        collaborationService.ensureReadable(templateId, currentContext)
        val patch = TemplatePatchAppliedData(
            templateId = templateId,
            savedByUserId = currentContext.userId,
            savedByUserName = currentContext.userName,
            savedByWorkspaceId = currentContext.workspaceId,
            savedByWorkspaceName = currentContext.workspaceName,
            updatedAt = updatedAt,
        )
        latestPatchMap[templateId] = patch
        eventFlows.computeIfAbsent(templateId) {
            MutableSharedFlow(replay = 16, extraBufferCapacity = 64)
        }.tryEmit(json.encodeToString(TemplatePatchAppliedEvent(data = patch)))
    }

    private fun buildMemberKey(context: RequestAuthContext): String = "${context.userId}:${context.workspaceId}"

    private fun pruneStaleMembers(templateId: String) {
        val templateMembers = onlineMembers[templateId] ?: return
        val now = Instant.now()
        val changed = templateMembers.entries.removeIf { (_, entry) ->
            runCatching {
                Duration.between(Instant.parse(entry.lastSeenAt), now) > staleAfter
            }.getOrDefault(false)
        }
        if (changed && templateMembers.isEmpty()) {
            onlineMembers.remove(templateId)
        }
        if (changed) {
            publish(templateId)
        }
    }

    private fun publish(templateId: String): TemplatePresenceData {
        val snapshot = snapshot(templateId)
        eventFlows.computeIfAbsent(templateId) {
            MutableSharedFlow(replay = 16, extraBufferCapacity = 64)
        }.tryEmit(json.encodeToString(TemplatePresenceChangedEvent(data = snapshot)))
        return snapshot
    }

    private fun snapshot(templateId: String): TemplatePresenceData {
        val members = onlineMembers[templateId]
            ?.values
            ?.sortedWith(compareBy<PresenceEntry>({ it.workspaceName }, { it.userName }))
            ?.map { entry ->
                TemplatePresenceMember(
                    userId = entry.userId,
                    userName = entry.userName,
                    email = entry.email,
                    workspaceId = entry.workspaceId,
                    workspaceName = entry.workspaceName,
                    role = entry.role,
                    joinedAt = entry.joinedAt,
                    lastSeenAt = entry.lastSeenAt,
                )
            }
            ?: emptyList()

        return TemplatePresenceData(
            templateId = templateId,
            members = members,
            onlineCount = members.size,
            updatedAt = nowIso(),
            latestPatch = latestPatchMap[templateId],
        )
    }
}