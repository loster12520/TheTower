package com.thetower.services

import com.thetower.models.LoginRequest
import com.thetower.repository.AuthRepository
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AuthServiceTest {
    @Test
    fun `auth service logs in and resolves alternate workspace`() {
        val authService = AuthService(
            AuthRepository(Files.createTempDirectory("thetower-auth-test").resolve("sessions.json"))
        )

        val session = authService.login(LoginRequest(email = "alice@thetower.local", password = "alice123"))
        val current = authService.getMe(session.token)
        val switched = authService.getMe(session.token, workspaceOverride = "ws-beta")

        assertEquals("alice@thetower.local", current.email)
        assertEquals("ws-alpha", current.workspaceId)
        assertEquals("ws-beta", switched.workspaceId)
        assertTrue(authService.logout(session.token))
    }
}