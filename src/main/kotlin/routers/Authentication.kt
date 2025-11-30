package com.lignting.routers

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.lignting.data.BizException
import com.lignting.data.User
import com.lignting.data.UserDTO
import com.lignting.data.defaultSuccess
import com.lignting.data.sqlClient
import com.lignting.data.success
import com.lignting.data.userName
import io.ktor.server.application.*
import io.ktor.server.auth.authenticate
import io.ktor.server.auth.jwt.JWTPrincipal
import io.ktor.server.auth.principal
import io.ktor.server.request.receive
import io.ktor.server.routing.*
import org.babyfish.jimmer.sql.kt.ast.expression.eq
import java.util.Date

fun Application.authenticationRouting() {
    routing {
        post("/login") {
            val user = call.receive<UserDTO>()
            val oldUser = sqlClient.createQuery(User::class) {
                where(table.userName eq user.userName)
                select(table)
            }.execute().firstOrNull()
                ?: throw BizException(10001, "Unknown user")
            if (oldUser.password != user.password) {
                throw BizException(10002, "Invalid password")
            }
            val token = JWT.create()
                .withClaim("username", user.userName)
                .withExpiresAt(Date(System.currentTimeMillis() + 60000L * 30))
                .sign(Algorithm.HMAC256("secret"))
            success(hashMapOf("token" to token))
        }
        
        post("/register") {
            val user = call.receive<UserDTO>()
            val oldUser = sqlClient.createQuery(User::class) {
                where(table.userName eq user.userName)
                select(table)
            }.execute().firstOrNull()
            if (oldUser != null) {
                throw BizException(10001, "User already exists")
            }
            sqlClient.save(user.let {
                User {
                    userName = it.userName
                    password = it.password
                }
            })
            defaultSuccess()
        }
        
        authenticate("auth-jwt") {
            get("/hello") {
                val principal = call.principal<JWTPrincipal>()
                val username = principal!!.payload.getClaim("username").asString()
                val expiresAt = principal.expiresAt?.time?.minus(System.currentTimeMillis())
                success(hashMapOf("username" to username, "expiresAt" to expiresAt))
            }
        }
    }
}