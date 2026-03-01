package com.thetower.routes

import com.thetower.models.ApiResponse
import com.thetower.models.DeletedData
import com.thetower.models.RunListData
import com.thetower.models.RunStatus
import com.thetower.models.StartRunRequest
import com.thetower.models.success
import com.thetower.services.RunService
import com.thetower.utils.BadRequestException
import com.thetower.utils.requestId
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.server.routing.routing

fun Application.runRoutes(runService: RunService) {
    routing {
        route("/api/v1/runs") {
            post {
                val request = call.receive<StartRunRequest>()
                val data = runService.startRun(request.templateId, request.dryRun, call.requestId())
                call.respond(
                    HttpStatusCode.OK,
                    data.success(call.requestId())
                )
            }

            get {
                val templateId = call.request.queryParameters["templateId"]
                val status = call.request.queryParameters["status"]?.let { raw ->
                    runCatching { RunStatus.valueOf(raw) }
                        .getOrElse { throw BadRequestException("status 参数非法: $raw", mapOf("field" to "status")) }
                }
                val from = call.request.queryParameters["from"]
                val to = call.request.queryParameters["to"]
                val limit = call.request.queryParameters["limit"]?.toIntOrNull()
                val offset = call.request.queryParameters["offset"]?.toIntOrNull()

                val (items, total) = runService.getRuns(templateId, status, from, to, limit, offset)
                call.respond(
                    HttpStatusCode.OK,
                    RunListData(items, total).success(call.requestId())
                )
            }

            get("/{id}") {
                val id = call.parameters["id"] ?: ""
                val run = runService.getRunById(id)
                call.respond(
                    HttpStatusCode.OK,
                    run.success(call.requestId())
                )
            }

            post("/{id}/cancel") {
                val id = call.parameters["id"] ?: ""
                val run = runService.cancelRun(id)
                call.respond(
                    HttpStatusCode.OK,
                    run.success(call.requestId())
                )
            }

            post("/{id}/restart") {
                val id = call.parameters["id"] ?: ""
                val data = runService.restartRun(id)
                call.respond(
                    HttpStatusCode.OK,
                    data.success(call.requestId())
                )
            }

            delete("/{id}") {
                val id = call.parameters["id"] ?: ""
                runService.deleteRun(id)
                call.respond(
                    HttpStatusCode.OK,
                    DeletedData(deleted = true).success(call.requestId())
                )
            }
        }
    }
}
