package com.thetower.routes

import com.thetower.models.ApiResponse
import com.thetower.models.CreateTemplateRequest
import com.thetower.models.DeletedData
import com.thetower.models.PatchTemplateRequest
import com.thetower.models.SaveTemplateRequest
import com.thetower.models.TemplateListData
import com.thetower.models.success
import com.thetower.services.TemplateService
import com.thetower.utils.requestId
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

fun Application.templateRoutes(templateService: TemplateService) {
    routing {
        route("/api/v1/templates") {
            get {
                val includeLastRun = call.request.queryParameters["includeLastRun"]?.toBooleanStrictOrNull() ?: true
                val items = templateService.getTemplates(includeLastRun)
                call.respond(
                    HttpStatusCode.OK,
                    TemplateListData(items).success(call.requestId())
                )
            }

            post {
                val request = call.receive<CreateTemplateRequest>()
                val template = templateService.createTemplate(request)
                call.respond(
                    HttpStatusCode.Created,
                    template.success(call.requestId())
                )
            }

            get("/{id}") {
                val id = call.parameters["id"] ?: ""
                val template = templateService.getTemplateById(id)
                call.respond(
                    HttpStatusCode.OK,
                    template.success(call.requestId())
                )
            }

            patch("/{id}") {
                val id = call.parameters["id"] ?: ""
                val request = call.receive<PatchTemplateRequest>()
                val template = templateService.updateTemplateMeta(id, request)
                call.respond(
                    HttpStatusCode.OK,
                    template.success(call.requestId())
                )
            }

            put("/{id}") {
                val id = call.parameters["id"] ?: ""
                val request = call.receive<SaveTemplateRequest>()
                val template = templateService.updateTemplateSteps(id, request)
                call.respond(
                    HttpStatusCode.OK,
                    template.success(call.requestId())
                )
            }

            delete("/{id}") {
                val id = call.parameters["id"] ?: ""
                templateService.deleteTemplate(id)
                call.respond(
                    HttpStatusCode.OK,
                    DeletedData(deleted = true).success(call.requestId())
                )
            }
        }
    }
}
