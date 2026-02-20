package com.thetower.config

import com.thetower.routes.healthRoutes
import com.thetower.routes.runRoutes
import com.thetower.routes.templateRoutes
import com.thetower.routes.webSocketRoutes
import com.thetower.repository.RunRepository
import com.thetower.repository.TemplateRepository
import com.thetower.services.RunService
import com.thetower.services.TemplateService
import com.thetower.utils.ApiException
import com.thetower.models.ApiResponse
import com.thetower.models.ErrorDetail
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.plugins.statuspages.*
import io.ktor.server.plugins.*
import io.ktor.server.response.*
import io.ktor.server.websocket.*
import kotlinx.serialization.json.Json
import java.util.UUID

fun Application.configureRouting() {
    val templateRepository = TemplateRepository()
    val runRepository = RunRepository()
    val templateService = TemplateService(templateRepository)
    val runService = RunService(runRepository, templateService)

    // JSON 序列化
    install(ContentNegotiation) {
        json(Json {
            prettyPrint = true
            isLenient = true
            ignoreUnknownKeys = true
        })
    }
    
    // CORS - 允许前端开发服务器访问
    install(CORS) {
        anyHost()
        allowHeader(HttpHeaders.ContentType)
        allowMethod(HttpMethod.Get)
        allowMethod(HttpMethod.Post)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Patch)
        allowMethod(HttpMethod.Delete)
    }

    install(WebSockets)
    
    // 错误处理
    install(StatusPages) {
        exception<BadRequestException> { call, _ ->
            call.respond(
                HttpStatusCode.BadRequest,
                ApiResponse<Nothing?>(
                    requestId = UUID.randomUUID().toString(),
                    data = null,
                    error = ErrorDetail(
                        code = "BAD_REQUEST",
                        message = "请求参数或请求体格式错误"
                    )
                )
            )
        }

        exception<ApiException> { call, cause ->
            call.respond(
                cause.status,
                ApiResponse<Nothing?>(
                    requestId = UUID.randomUUID().toString(),
                    data = null,
                    error = ErrorDetail(
                        code = cause.code,
                        message = cause.message,
                        details = cause.details
                    )
                )
            )
        }

        exception<Throwable> { call, cause ->
            call.respond(
                HttpStatusCode.InternalServerError,
                ApiResponse<Nothing?>(
                    requestId = UUID.randomUUID().toString(),
                    data = null,
                    error = ErrorDetail(
                        code = "INTERNAL_ERROR",
                        message = cause.message ?: "Unknown error"
                    )
                )
            )
        }
    }
    
    // 路由
    healthRoutes()
    templateRoutes(templateService)
    runRoutes(runService)
    webSocketRoutes(runService)
}
