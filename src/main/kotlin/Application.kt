package com.lignting

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.lignting.data.BizException
import com.lignting.routers.configureRouting
import com.lignting.utils.uuid
import io.ktor.serialization.gson.gson
import io.ktor.server.application.*
import io.ktor.server.auth.Authentication
import io.ktor.server.auth.UnauthorizedResponse
import io.ktor.server.auth.jwt.JWTPrincipal
import io.ktor.server.auth.jwt.jwt
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respond

fun main(args: Array<String>) {
    io.ktor.server.netty.EngineMain.main(args)
}

fun Application.module() {
    install(ContentNegotiation) {
        gson()
    }
    
    install(StatusPages) {
        exception<BizException> { call, cause ->
            val traceId = call.request.headers["traceId"] ?: uuid()
            call.respond(cause.toResponse(traceId))
        }
        exception<Throwable> { call, cause ->
            val traceId = call.request.headers["traceId"] ?: uuid()
            call.respond(
                BizException(
                    50000,
                    "Internal server error: ${cause.message ?: "No message"}"
                ).toResponse(traceId)
            )
        }
    }
    
    install(Authentication) {
        jwt("auth-jwt") {
            realm = "Access to 'login'"
            verifier(
                JWT
                    .require(Algorithm.HMAC256("secret"))
                    .withAudience("http://0.0.0.0:8080/login")
                    .withIssuer("http://0.0.0.0:8080/")
                    .build()
            )
            validate { credential ->
                if (credential.payload.getClaim("username").asString().isNotEmpty()) {
                    JWTPrincipal(credential.payload)
                } else {
                    null
                }
            }
            challenge { defaultScheme, realm ->
                call.respond(
                    BizException(
                        20001,
                        "user is not authenticated"
                    )
                )
            }
        }
    }
    configureRouting()
}