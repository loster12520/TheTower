package com.thetower.utils

import io.ktor.http.HttpStatusCode

open class ApiException(
    val status: HttpStatusCode,
    val code: String,
    override val message: String,
    val details: Map<String, String>? = null
) : RuntimeException(message)

class BadRequestException(
    message: String,
    details: Map<String, String>? = null
) : ApiException(
    HttpStatusCode.BadRequest,
    details?.get("code") ?: ErrorCodes.BAD_REQUEST,
    message,
    details?.filterKeys { it != "code" }
)

class UnauthorizedException(message: String) :
    ApiException(HttpStatusCode.Unauthorized, ErrorCodes.UNAUTHORIZED, message)

class ForbiddenException(message: String) :
    ApiException(HttpStatusCode.Forbidden, ErrorCodes.FORBIDDEN, message)

class WorkspaceForbiddenException(message: String) :
    ApiException(HttpStatusCode.Forbidden, ErrorCodes.WORKSPACE_FORBIDDEN, message)

class InvalidStepConfigException(
    message: String,
    details: Map<String, String>? = null
) : ApiException(HttpStatusCode.BadRequest, ErrorCodes.INVALID_STEP_CONFIG, message, details)

class TemplateNotFoundException(message: String) :
    ApiException(HttpStatusCode.NotFound, ErrorCodes.TEMPLATE_NOT_FOUND, message)

class RunNotFoundException(message: String) :
    ApiException(HttpStatusCode.NotFound, ErrorCodes.RUN_NOT_FOUND, message)

class RunExecutionException(message: String) :
    ApiException(HttpStatusCode.BadGateway, ErrorCodes.EXECUTION_ERROR, message)

class ConflictException(message: String) :
    ApiException(HttpStatusCode.Conflict, ErrorCodes.TEMPLATE_CONFLICT, message)
