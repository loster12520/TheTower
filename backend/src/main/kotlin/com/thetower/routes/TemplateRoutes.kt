package com.thetower.routes

import com.thetower.models.ApiResponse
import com.thetower.models.BatchDeleteTemplatesRequest
import com.thetower.models.CloneTemplateRequest
import com.thetower.models.CreateTemplateRequest
import com.thetower.models.DeletedData
import com.thetower.models.PatchTemplateRequest
import com.thetower.models.SaveTemplateRequest
import com.thetower.models.ShareTemplateRequest
import com.thetower.models.TemplateListData
import com.thetower.models.success
import com.thetower.services.AuthService
import com.thetower.services.TemplateCollaborationService
import com.thetower.services.TemplatePresenceService
import com.thetower.services.TemplateService
import com.thetower.utils.WORKSPACE_ID_HEADER
import com.thetower.utils.bearerToken
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

fun Application.templateRoutes(
    templateService: TemplateService,
    authService: AuthService,
    collaborationService: TemplateCollaborationService,
    presenceService: TemplatePresenceService
) {
    routing {
        route("/api/v1/templates") {
            get {
                val authContext = authService.resolveContext(call.bearerToken(), call.request.headers[WORKSPACE_ID_HEADER])
                val includeLastRun = call.request.queryParameters["includeLastRun"]?.toBooleanStrictOrNull() ?: true
                val keyword = call.request.queryParameters["keyword"]
                val groupName = call.request.queryParameters["groupName"]
                val tag = call.request.queryParameters["tag"]
                val items = collaborationService.filterAccessibleTemplates(
                    templateService.getTemplates(includeLastRun, keyword, groupName, tag),
                    authContext
                )
                call.respond(
                    HttpStatusCode.OK,
                    TemplateListData(items).success(call.requestId())
                )
            }

            post {
                val authContext = authService.resolveContext(call.bearerToken(), call.request.headers[WORKSPACE_ID_HEADER])
                val request = call.receive<CreateTemplateRequest>()
                val template = templateService.createTemplate(request)
                collaborationService.assignOwner(template.id, authContext)
                call.respond(
                    HttpStatusCode.Created,
                    template.success(call.requestId())
                )
            }

            post("/batch-delete") {
                val request = call.receive<BatchDeleteTemplatesRequest>()
                val data = templateService.deleteTemplates(request.ids)
                call.respond(
                    HttpStatusCode.OK,
                    data.success(call.requestId())
                )
            }

            post("/{id}/clone") {
                val authContext = authService.resolveContext(call.bearerToken(), call.request.headers[WORKSPACE_ID_HEADER])
                val id = call.parameters["id"] ?: ""
                collaborationService.ensureReadable(id, authContext)
                val request = call.receive<CloneTemplateRequest>()
                val template = templateService.cloneTemplate(id, request)
                collaborationService.assignOwner(template.id, authContext)
                call.respond(
                    HttpStatusCode.Created,
                    template.success(call.requestId())
                )
            }

            get("/{id}/collaboration") {
                val authContext = authService.resolveContext(call.bearerToken(), call.request.headers[WORKSPACE_ID_HEADER])
                val id = call.parameters["id"] ?: ""
                val data = collaborationService.getCollaboration(id, authContext)
                call.respond(HttpStatusCode.OK, data.success(call.requestId()))
            }

            post("/{id}/collaboration/share") {
                val authContext = authService.resolveContext(call.bearerToken(), call.request.headers[WORKSPACE_ID_HEADER])
                val id = call.parameters["id"] ?: ""
                val request = call.receive<ShareTemplateRequest>()
                val data = collaborationService.shareTemplate(id, request, authContext)
                call.respond(HttpStatusCode.OK, data.success(call.requestId()))
            }

            get("/{id}/collaboration/presence") {
                val authContext = authService.resolveContext(call.bearerToken(), call.request.headers[WORKSPACE_ID_HEADER])
                val id = call.parameters["id"] ?: ""
                val data = presenceService.getPresence(id, authContext)
                call.respond(HttpStatusCode.OK, data.success(call.requestId()))
            }

            post("/{id}/collaboration/presence/heartbeat") {
                val authContext = authService.resolveContext(call.bearerToken(), call.request.headers[WORKSPACE_ID_HEADER])
                val id = call.parameters["id"] ?: ""
                val data = presenceService.heartbeat(id, authContext)
                call.respond(HttpStatusCode.OK, data.success(call.requestId()))
            }

            delete("/{id}/collaboration/presence") {
                val authContext = authService.resolveContext(call.bearerToken(), call.request.headers[WORKSPACE_ID_HEADER])
                val id = call.parameters["id"] ?: ""
                presenceService.leave(id, authContext)
                call.respond(HttpStatusCode.OK, DeletedData(deleted = true).success(call.requestId()))
            }

            get("/{id}") {
                val authContext = authService.resolveContext(call.bearerToken(), call.request.headers[WORKSPACE_ID_HEADER])
                val id = call.parameters["id"] ?: ""
                collaborationService.ensureReadable(id, authContext)
                val template = templateService.getTemplateById(id)
                call.respond(
                    HttpStatusCode.OK,
                    template.success(call.requestId())
                )
            }

            patch("/{id}") {
                val authContext = authService.resolveContext(call.bearerToken(), call.request.headers[WORKSPACE_ID_HEADER])
                val id = call.parameters["id"] ?: ""
                collaborationService.ensureEditable(id, authContext)
                val request = call.receive<PatchTemplateRequest>()
                val template = templateService.updateTemplateMeta(id, request)
                call.respond(
                    HttpStatusCode.OK,
                    template.success(call.requestId())
                )
            }

            put("/{id}") {
                val authContext = authService.resolveContext(call.bearerToken(), call.request.headers[WORKSPACE_ID_HEADER])
                val id = call.parameters["id"] ?: ""
                collaborationService.ensureEditable(id, authContext)
                val request = call.receive<SaveTemplateRequest>()
                val template = templateService.updateTemplateSteps(id, request)
                presenceService.publishPatch(id, authContext, template.updatedAt)
                call.respond(
                    HttpStatusCode.OK,
                    template.success(call.requestId())
                )
            }

            delete("/{id}") {
                val authContext = authService.resolveContext(call.bearerToken(), call.request.headers[WORKSPACE_ID_HEADER])
                val id = call.parameters["id"] ?: ""
                collaborationService.ensureEditable(id, authContext)
                templateService.deleteTemplate(id)
                call.respond(
                    HttpStatusCode.OK,
                    DeletedData(deleted = true).success(call.requestId())
                )
            }
        }
    }
}
