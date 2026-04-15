package com.thetower.services

import com.thetower.models.CreateTemplateRequest
import com.thetower.models.ShareTemplateRequest
import com.thetower.models.TemplatePermission
import com.thetower.repository.AuthRepository
import com.thetower.repository.TemplateCollaborationRepository
import com.thetower.repository.TemplateRepository
import com.thetower.utils.SqliteConfig
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TemplateCollaborationServiceTest {
    @Test
    fun `collaboration service filters by workspace and shares template`() {
        val sqliteConfig = SqliteConfig(enabled = false, jdbcUrl = "jdbc:sqlite::memory:")
        val templateService = TemplateService(TemplateRepository(sqliteConfig))
        val authService = AuthService(
            AuthRepository(Files.createTempDirectory("thetower-collab-auth-test").resolve("sessions.json"))
        )
        val collaborationService = TemplateCollaborationService(
            TemplateCollaborationRepository(Files.createTempDirectory("thetower-collab-test").resolve("templates.json")),
            authService,
            templateService
        )

        val alice = authService.requireContext(authService.login(com.thetower.models.LoginRequest("alice@thetower.local", "alice123")).token)
        val betaAlice = authService.requireContext(
            authService.login(com.thetower.models.LoginRequest("alice@thetower.local", "alice123")).token,
            workspaceOverride = "ws-beta"
        )

        val template = templateService.createTemplate(CreateTemplateRequest(name = "协作模板", schemaVersion = "0.0.8"))
        collaborationService.assignOwner(template.id, alice)

        assertTrue(collaborationService.filterAccessibleTemplates(templateService.getTemplates(true), alice).any { it.id == template.id })
        assertFalse(collaborationService.filterAccessibleTemplates(templateService.getTemplates(true), betaAlice).any { it.id == template.id })

        val shared = collaborationService.shareTemplate(
            template.id,
            ShareTemplateRequest(email = "bob@thetower.local", permission = TemplatePermission.EDITOR),
            alice
        )

        assertEquals(1, shared.collaborators.size)
        assertEquals("bob@thetower.local", shared.collaborators.first().email)
        assertEquals(TemplatePermission.EDITOR, shared.collaborators.first().permission)
    }
}