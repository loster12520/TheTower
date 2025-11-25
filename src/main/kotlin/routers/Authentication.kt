package com.lignting.routers

import com.lignting.data.User
import com.lignting.data.UserDTO
import com.lignting.data.sqlClient
import com.lignting.data.userName
import io.ktor.server.application.*
import io.ktor.server.request.receive
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.babyfish.jimmer.sql.kt.ast.expression.eq

fun Application.authenticationRouting() {
    routing {
        post("/login") {
            val user = call.receive<UserDTO>()
            val oldUser = sqlClient.createQuery(User::class) {
                where(table.userName eq user.userName)
                select(table)
            }.execute()
            call.respondText("Welcome, ${oldUser}!")
        }
        
        post("/register") {
            val user = call.receive<UserDTO>()
            val result = sqlClient.save(user.let {
                User {
                    userName = it.userName
                    password = it.password
                }
            })
        }
    }
}