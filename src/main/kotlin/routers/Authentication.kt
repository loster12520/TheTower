package com.lignting.routers

import com.lignting.data.User
import io.ktor.server.application.*
import io.ktor.server.request.receive
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Application.authenticationRouting() {
    routing {
        post("/login") {
            val user = call.receive<User>()
            call.respondText("Welcome, ${user.name}!")
        }
    }
}