package com.thetower.services

import com.thetower.models.CreateTemplateRequest
import com.thetower.repository.AuthRepository
import com.thetower.repository.TemplateCollaborationRepository
import com.thetower.repository.TemplateRepository
import com.thetower.utils.SqliteConfig
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TemplatePresenceServiceTest {
    @Test
    fun `presence service tracks online collaborators by workspace`() {
        val sqliteConfig = SqliteConfig(enabled = false, jdbcUrl = "jdbc:sqlite::memory:")
        val templateService = TemplateService(TemplateRepository(sqliteConfig))
        val authService = AuthService(
            AuthRepository(Files.createTempDirectory("thetower-presence-auth-test").resolve("sessions.json"))
        )
        val collaborationService = TemplateCollaborationService(
            TemplateCollaborationRepository(Files.createTempDirectory("thetower-presence-collab-test").resolve("templates.json")),
            authService,
            templateService,
        )
        val presenceService = TemplatePresenceService(collaborationService)

        val alice = authService.requireContext(authService.login(com.thetower.models.LoginRequest("alice@thetower.local", "alice123")).token)
        val bob = authService.requireContext(authService.login(com.thetower.models.LoginRequest("bob@thetower.local", "bob123")).token)

        val template = templateService.createTemplate(CreateTemplateRequest(name = "在线协作模板", schemaVersion = "0.0.8"))
        collaborationService.assignOwner(template.id, alice)
        collaborationService.shareTemplate(
            template.id,
            com.thetower.models.ShareTemplateRequest(email = "bob@thetower.local", permission = com.thetower.models.TemplatePermission.EDITOR),
            alice,
        )

        val afterAlice = presenceService.heartbeat(template.id, alice)
        assertEquals(1, afterAlice.onlineCount)

        val afterBob = presenceService.heartbeat(template.id, bob)
        assertEquals(2, afterBob.onlineCount)
        assertTrue(afterBob.members.any { it.userId == alice.userId })
        assertTrue(afterBob.members.any { it.userId == bob.userId })

        presenceService.leave(template.id, bob)
        val afterLeave = presenceService.getPresence(template.id, alice)
        assertEquals(1, afterLeave.onlineCount)
        assertEquals(alice.userId, afterLeave.members.single().userId)
    }
}