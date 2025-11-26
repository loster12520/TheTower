package com.lignting.routers

import com.lignting.data.BizException
import com.lignting.data.User
import com.lignting.data.UserDTO
import com.lignting.data.defaultSuccess
import com.lignting.data.sqlClient
import com.lignting.data.userName
import io.ktor.server.application.*
import io.ktor.server.request.receive
import io.ktor.server.routing.*
import org.babyfish.jimmer.sql.kt.ast.expression.eq

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
            defaultSuccess()
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
            val result = sqlClient.save(user.let {
                User {
                    userName = it.userName
                    password = it.password
                }
            })
        }
    }
}