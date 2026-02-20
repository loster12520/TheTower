package com.thetower.routes

import com.thetower.services.RunService
import io.ktor.server.application.Application
import io.ktor.server.routing.routing
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.CloseReason
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.send
import kotlinx.coroutines.flow.collectLatest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

fun Application.webSocketRoutes(runService: RunService) {
    routing {
        webSocket("/ws/v1/runs/{runId}") {
            val runId = call.parameters["runId"]
            if (runId.isNullOrBlank()) {
                close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Missing runId"))
                return@webSocket
            }

            val flow = runService.eventFlow(runId)
            if (flow == null) {
                close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Run not found"))
                return@webSocket
            }

            flow.collectLatest { event ->
                send(Frame.Text(Json.encodeToString(event)))
            }
        }
    }
}
