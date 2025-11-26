package com.lignting.data

import com.lignting.utils.uuid
import io.ktor.server.response.respond
import io.ktor.server.routing.RoutingContext

data class ApiResponse<T>(
    val code: Int,
    val message: String,
    val success: Boolean,
    val data: T?,
    val traceId: String,
)

suspend fun <T> RoutingContext.success(data: T) {
    val traceId = call.request.headers["traceId"] ?: uuid()
    call.respond(ApiResponse(code = 0, success = true, message = "success", data = data, traceId = traceId))
}

suspend fun RoutingContext.defaultSuccess() = success("OK")

class BizException(
    val bizCode: Int,
    override val message: String
) : RuntimeException(message) {
    fun toResponse(traceId: String): ApiResponse<Unit> {
        return ApiResponse(
            code = bizCode,
            success = false,
            message = message,
            data = null,
            traceId = traceId
        )
    }
}