package com.thetower.routes

import com.thetower.models.LoginRequest
import com.thetower.models.LogoutData
import com.thetower.models.WorkspaceListData
import com.thetower.models.success
import com.thetower.services.AuthService
import com.thetower.utils.WORKSPACE_ID_HEADER
import com.thetower.utils.bearerToken
import com.thetower.utils.requestId
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.server.routing.routing

fun Application.authRoutes(authService: AuthService) {
    routing {
        route("/api/v1") {
            route("/auth") {
                post("/login") {
                    val request = call.receive<LoginRequest>()
                    val session = authService.login(request)
                    call.respond(HttpStatusCode.OK, session.success(call.requestId()))
                }

                post("/logout") {
                    val context = authService.requireContext(
                        call.bearerToken(),
                        call.request.headers[WORKSPACE_ID_HEADER]
                    )
                    authService.logout(context.token)
                    call.respond(HttpStatusCode.OK, LogoutData(loggedOut = true).success(call.requestId()))
                }
            }

            get("/me") {
                val me = authService.getMe(
                    call.bearerToken() ?: "",
                    call.request.headers[WORKSPACE_ID_HEADER]
                )
                call.respond(HttpStatusCode.OK, me.success(call.requestId()))
            }

            get("/workspaces") {
                val items = authService.getWorkspaces(
                    call.bearerToken() ?: "",
                    call.request.headers[WORKSPACE_ID_HEADER]
                )
                call.respond(HttpStatusCode.OK, WorkspaceListData(items).success(call.requestId()))
            }
        }
    }
}