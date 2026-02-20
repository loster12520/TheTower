package com.thetower.routes

import com.thetower.models.ApiResponse
import com.thetower.models.DeletedData
import com.thetower.models.RunListData
import com.thetower.models.RunStatus
import com.thetower.models.StartRunRequest
import com.thetower.services.RunService
import com.thetower.utils.BadRequestException
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
import java.util.UUID

fun Application.runRoutes(runService: RunService) {
    routing {
        route("/api/v1/runs") {
            post {
                val request = call.receive<StartRunRequest>()
                val data = runService.start(request.templateId, request.dryRun)
                call.respond(
                    HttpStatusCode.OK,
                    ApiResponse(
                        requestId = UUID.randomUUID().toString(),
                        data = data,
                        error = null
                    )
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

                val (items, total) = runService.list(templateId, status, from, to, limit, offset)
                call.respond(
                    HttpStatusCode.OK,
                    ApiResponse(
                        requestId = UUID.randomUUID().toString(),
                        data = RunListData(items, total),
                        error = null
                    )
                )
            }

            get("/{id}") {
                val id = call.parameters["id"] ?: ""
                val run = runService.get(id)
                call.respond(
                    HttpStatusCode.OK,
                    ApiResponse(
                        requestId = UUID.randomUUID().toString(),
                        data = run,
                        error = null
                    )
                )
            }

            post("/{id}/cancel") {
                val id = call.parameters["id"] ?: ""
                val run = runService.cancel(id)
                call.respond(
                    HttpStatusCode.OK,
                    ApiResponse(
                        requestId = UUID.randomUUID().toString(),
                        data = run,
                        error = null
                    )
                )
            }

            post("/{id}/restart") {
                val id = call.parameters["id"] ?: ""
                val data = runService.restart(id)
                call.respond(
                    HttpStatusCode.OK,
                    ApiResponse(
                        requestId = UUID.randomUUID().toString(),
                        data = data,
                        error = null
                    )
                )
            }

            delete("/{id}") {
                val id = call.parameters["id"] ?: ""
                runService.delete(id)
                call.respond(
                    HttpStatusCode.OK,
                    ApiResponse(
                        requestId = UUID.randomUUID().toString(),
                        data = DeletedData(deleted = true),
                        error = null
                    )
                )
            }
        }
    }
}
