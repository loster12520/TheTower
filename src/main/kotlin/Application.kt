package com.lignting

import com.lignting.routers.configureRouting
import io.ktor.serialization.gson.gson
import io.ktor.server.application.*
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation

fun main(args: Array<String>) {
    io.ktor.server.netty.EngineMain.main(args)
}

fun Application.module() {
    configureRouting()
    install(ContentNegotiation) {
        gson()
    }
}