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
import com.thetower.utils.ErrorCodes
import com.thetower.utils.REQUEST_ID_HEADER
import com.thetower.utils.SqliteConfig
import com.thetower.utils.ensureSqliteReady
import com.thetower.models.ErrorDetail
import com.thetower.models.fail
import com.thetower.utils.newId
import com.thetower.utils.requestId
import com.thetower.utils.setRequestId
import io.github.oshai.kotlinlogging.KotlinLogging
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.plugins.statuspages.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.websocket.*
import kotlinx.serialization.json.Json
import kotlin.time.DurationUnit
import kotlin.time.TimeSource

private val logger = KotlinLogging.logger {}

fun Application.configureRouting() {
    val sqliteEnabledConfigured = environment.config
        .propertyOrNull("thetower.persistence.sqlite.enabled")
        ?.getString()
        ?.toBooleanStrictOrNull()
        ?: true
    val sqlitePath = environment.config
        .propertyOrNull("thetower.persistence.sqlite.path")
        ?.getString()
        ?: "data/thetower.db"
    val sqliteConfig = SqliteConfig(
        enabled = sqliteEnabledConfigured,
        jdbcUrl = "jdbc:sqlite:$sqlitePath"
    )

    val effectiveSqliteConfig = if (sqliteConfig.enabled) {
        runCatching {
            ensureSqliteReady(sqliteConfig.jdbcUrl)
            sqliteConfig
        }.onFailure { ex ->
            logger.error(ex) { "sqlite.init.failed, fallback to in-memory jdbcUrl=${sqliteConfig.jdbcUrl}" }
        }.getOrElse {
            SqliteConfig(enabled = false, jdbcUrl = sqliteConfig.jdbcUrl)
        }
    } else {
        sqliteConfig
    }

    val templateRepository = TemplateRepository(effectiveSqliteConfig)
    val runRepository = RunRepository(effectiveSqliteConfig)
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

    intercept(ApplicationCallPipeline.Setup) {
        val requestId = call.request.headers[REQUEST_ID_HEADER]
            ?.takeIf { it.isNotBlank() }
            ?: newId()
        call.setRequestId(requestId)
        call.response.headers.append(REQUEST_ID_HEADER, requestId)
        proceed()
    }

    intercept(ApplicationCallPipeline.Monitoring) {
        val requestId = call.requestId()
        val method = call.request.httpMethod.value
        val path = call.request.uri
        val timer = TimeSource.Monotonic.markNow()

        logger.debug {
            "request.start requestId=$requestId method=$method path=$path"
        }

        proceed()

        val status = call.response.status()?.value ?: 200
        val elapsedMs = timer.elapsedNow().toDouble(DurationUnit.MILLISECONDS)
        logger.info {
            "request.end requestId=$requestId method=$method path=$path status=$status durationMs=${"%.2f".format(elapsedMs)}"
        }
    }
    
    // 错误处理
    install(StatusPages) {
        exception<ApiException> { call, cause ->
            logger.warn {
                "request.error requestId=${call.requestId()} method=${call.request.httpMethod.value} path=${call.request.uri} status=${cause.status.value} errorCode=${cause.code} message=${cause.message}"
            }
            call.respond(
                cause.status,
                ErrorDetail(
                    code = cause.code,
                    message = cause.message,
                    details = cause.details
                ).fail(call.requestId())
            )
        }

        exception<Throwable> { call, cause ->
            logger.error(cause) {
                "request.error requestId=${call.requestId()} method=${call.request.httpMethod.value} path=${call.request.uri} status=500 errorCode=${ErrorCodes.INTERNAL_ERROR}"
            }
            call.respond(
                HttpStatusCode.InternalServerError,
                ErrorDetail(
                    code = ErrorCodes.INTERNAL_ERROR,
                    message = cause.message ?: "Unknown error"
                ).fail(call.requestId())
            )
        }
    }
    
    // 路由
    healthRoutes()
    templateRoutes(templateService)
    runRoutes(runService)
    webSocketRoutes(runService)
}
