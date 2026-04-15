package com.thetower.routes

import com.thetower.services.AuthService
import com.thetower.services.RunService
import com.thetower.services.TemplateCollaborationService
import com.thetower.services.TemplatePresenceService
import com.thetower.utils.WORKSPACE_ID_HEADER
import com.thetower.utils.bearerToken
import com.thetower.utils.queryToken
import io.ktor.server.application.Application
import io.ktor.server.routing.routing
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.CloseReason
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.send
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

fun Application.webSocketRoutes(
    runService: RunService,
    authService: AuthService,
    collaborationService: TemplateCollaborationService,
    presenceService: TemplatePresenceService,
) {
    val logger = KotlinLogging.logger {}
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

            logger.info { "ws.run.open runId=$runId" }

            // 消费客户端消息，避免 incoming 积压导致断线。
            // 当前仅对心跳做最小处理：识别 PING 并回包 PONG（或忽略）。
            val incomingJob = launch {
                runCatching {
                    for (frame in incoming) {
                        val text = (frame as? Frame.Text)?.data?.decodeToString() ?: continue
                        if (text.contains("\"type\"") && text.contains("PING")) {
                            send(Frame.Text("{\"type\":\"PONG\",\"ts\":${System.currentTimeMillis()}}"))
                        }
                    }
                }.onFailure { ex ->
                    logger.warn(ex) { "ws.run.incoming.error runId=$runId" }
                }
            }

            try {
                flow.collect { event ->
                    runCatching {
                        send(Frame.Text(Json.encodeToString(event)))
                    }.onFailure { ex ->
                        logger.warn(ex) { "ws.run.send.failed runId=$runId type=${event.type} seq=${event.seq}" }
                        throw ex
                    }
                }
            } finally {
                incomingJob.cancel()
                incomingJob.cancelAndJoin()
                logger.info { "ws.run.close runId=$runId" }
            }
        }

        webSocket("/ws/v1/templates/{templateId}/collaboration") {
            val templateId = call.parameters["templateId"]
            if (templateId.isNullOrBlank()) {
                close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Missing templateId"))
                return@webSocket
            }

            val workspaceId = call.request.headers[WORKSPACE_ID_HEADER]
                ?: call.request.queryParameters["workspaceId"]
            val authContext = runCatching {
                authService.requireContext(call.bearerToken() ?: call.queryToken(), workspaceId)
            }.getOrElse {
                close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Unauthorized"))
                return@webSocket
            }

            runCatching {
                collaborationService.ensureReadable(templateId, authContext)
            }.onFailure {
                close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Forbidden"))
                return@webSocket
            }

            val flow = presenceService.eventFlow(templateId, authContext)
            presenceService.heartbeat(templateId, authContext)
            logger.info { "ws.collaboration.open templateId=$templateId userId=${authContext.userId} workspaceId=${authContext.workspaceId}" }

            val incomingJob = launch {
                runCatching {
                    for (frame in incoming) {
                        val text = (frame as? Frame.Text)?.data?.decodeToString() ?: continue
                        when {
                            text.contains("\"type\"") && text.contains("PING") -> {
                                send(Frame.Text("{\"type\":\"PONG\",\"ts\":${System.currentTimeMillis()}}"))
                            }
                            text.contains("COLLABORATION_HEARTBEAT") || text.contains("HEARTBEAT") -> {
                                presenceService.heartbeat(templateId, authContext)
                            }
                        }
                    }
                }.onFailure { ex ->
                    logger.warn(ex) { "ws.collaboration.incoming.error templateId=$templateId userId=${authContext.userId}" }
                }
            }

            try {
                send(Frame.Text(presenceService.currentPresenceEvent(templateId, authContext)))
                flow.collect { event ->
                    runCatching {
                        send(Frame.Text(event))
                    }.onFailure { ex ->
                        logger.warn(ex) { "ws.collaboration.send.failed templateId=$templateId userId=${authContext.userId}" }
                        throw ex
                    }
                }
            } finally {
                incomingJob.cancel()
                incomingJob.cancelAndJoin()
                presenceService.leave(templateId, authContext)
                logger.info { "ws.collaboration.close templateId=$templateId userId=${authContext.userId} workspaceId=${authContext.workspaceId}" }
            }
        }
    }
}
