package com.thetower.routes

import com.thetower.models.ApiResponse
import com.thetower.models.HealthStatus
import com.thetower.models.success
import com.thetower.utils.requestId
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Application.healthRoutes() {
    routing {
        // 健康检查
        get("/api/v1/health") {
            val response = HealthStatus(status = "ok").success(call.requestId())
            call.respond(HttpStatusCode.OK, response)
        }
    }
}
