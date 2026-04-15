package com.thetower.repository

import com.thetower.models.UserSession
import com.thetower.models.WorkspaceMembership
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.concurrent.ConcurrentHashMap
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

data class UserAccount(
    val id: String,
    val name: String,
    val email: String,
    val password: String,
    val workspaces: List<WorkspaceMembership>
)

class AuthRepository(
    private val storagePath: Path = Paths.get("data", "auth", "sessions.json")
) {
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }
    private val sessions = ConcurrentHashMap<String, UserSession>()

    private val users = listOf(
        UserAccount(
            id = "user-alice",
            name = "Alice 管理员",
            email = "alice@thetower.local",
            password = "alice123",
            workspaces = listOf(
                WorkspaceMembership("ws-alpha", "Alpha 团队", "OWNER"),
                WorkspaceMembership("ws-beta", "Beta 团队", "OWNER")
            )
        ),
        UserAccount(
            id = "user-bob",
            name = "Bob 协作者",
            email = "bob@thetower.local",
            password = "bob123",
            workspaces = listOf(
                WorkspaceMembership("ws-beta", "Beta 团队", "EDITOR")
            )
        )
    )

    init {
        loadFromDisk()
    }

    fun findUserByEmail(email: String): UserAccount? = users.firstOrNull { it.email.equals(email.trim(), ignoreCase = true) }

    fun findUserById(userId: String): UserAccount? = users.firstOrNull { it.id == userId }

    fun findSession(token: String): UserSession? = sessions[token]

    @Synchronized
    fun saveSession(session: UserSession): UserSession {
        sessions[session.token] = session
        flushToDisk()
        return session
    }

    @Synchronized
    fun deleteSession(token: String): Boolean {
        val removed = sessions.remove(token) != null
        if (removed) {
            flushToDisk()
        }
        return removed
    }

    private fun loadFromDisk() {
        if (!Files.exists(storagePath)) {
            return
        }
        val raw = Files.readString(storagePath)
        if (raw.isBlank()) {
            return
        }
        val loaded = json.decodeFromString(ListSerializer(UserSession.serializer()), raw)
        loaded.forEach { session -> sessions[session.token] = session }
    }

    private fun flushToDisk() {
        val parent = storagePath.parent
        if (parent != null && !Files.exists(parent)) {
            Files.createDirectories(parent)
        }
        val serialized = json.encodeToString(
            ListSerializer(UserSession.serializer()),
            sessions.values.sortedByDescending { it.issuedAt }
        )
        Files.writeString(storagePath, serialized)
    }
}