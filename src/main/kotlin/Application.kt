package com.lignting

import com.lignting.data.BizException
import com.lignting.routers.configureRouting
import com.lignting.utils.uuid
import io.ktor.serialization.gson.gson
import io.ktor.server.application.*
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respond
import io.ktor.server.response.respondText

fun main(args: Array<String>) {
    io.ktor.server.netty.EngineMain.main(args)
}

fun Application.module() {
    configureRouting()
    install(ContentNegotiation) {
        gson()
    }
    
    install(StatusPages) {
        exception<BizException> { call, cause ->
            val traceId = call.request.headers["traceId"] ?: uuid()
            call.respond(cause.toResponse(traceId))
        }
    }
}