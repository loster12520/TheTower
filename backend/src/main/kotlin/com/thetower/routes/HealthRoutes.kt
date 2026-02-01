package com.thetower.routes

import com.thetower.models.ApiResponse
import com.thetower.models.HealthStatus
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.util.UUID

fun Application.healthRoutes() {
    routing {
        // 健康检查
        get("/api/v1/health") {
            val response = ApiResponse(
                requestId = UUID.randomUUID().toString(),
                data = HealthStatus(status = "ok")
            )
            call.respond(HttpStatusCode.OK, response)
        }
    }
}
