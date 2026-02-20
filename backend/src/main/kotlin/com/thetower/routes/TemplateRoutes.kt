package com.thetower.routes

import com.thetower.models.ApiResponse
import com.thetower.models.CreateTemplateRequest
import com.thetower.models.DeletedData
import com.thetower.models.PatchTemplateRequest
import com.thetower.models.SaveTemplateRequest
import com.thetower.models.TemplateListData
import com.thetower.services.TemplateService
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import java.util.UUID

fun Application.templateRoutes(templateService: TemplateService) {
    routing {
        route("/api/v1/templates") {
            get {
                val includeLastRun = call.request.queryParameters["includeLastRun"]?.toBooleanStrictOrNull() ?: true
                val items = templateService.list(includeLastRun)
                call.respond(
                    HttpStatusCode.OK,
                    ApiResponse(
                        requestId = UUID.randomUUID().toString(),
                        data = TemplateListData(items),
                        error = null
                    )
                )
            }

            post {
                val request = call.receive<CreateTemplateRequest>()
                val template = templateService.create(request)
                call.respond(
                    HttpStatusCode.Created,
                    ApiResponse(
                        requestId = UUID.randomUUID().toString(),
                        data = template,
                        error = null
                    )
                )
            }

            get("/{id}") {
                val id = call.parameters["id"] ?: ""
                val template = templateService.get(id)
                call.respond(
                    HttpStatusCode.OK,
                    ApiResponse(
                        requestId = UUID.randomUUID().toString(),
                        data = template,
                        error = null
                    )
                )
            }

            patch("/{id}") {
                val id = call.parameters["id"] ?: ""
                val request = call.receive<PatchTemplateRequest>()
                val template = templateService.patch(id, request)
                call.respond(
                    HttpStatusCode.OK,
                    ApiResponse(
                        requestId = UUID.randomUUID().toString(),
                        data = template,
                        error = null
                    )
                )
            }

            put("/{id}") {
                val id = call.parameters["id"] ?: ""
                val request = call.receive<SaveTemplateRequest>()
                val template = templateService.saveSteps(id, request)
                call.respond(
                    HttpStatusCode.OK,
                    ApiResponse(
                        requestId = UUID.randomUUID().toString(),
                        data = template,
                        error = null
                    )
                )
            }

            delete("/{id}") {
                val id = call.parameters["id"] ?: ""
                templateService.delete(id)
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
