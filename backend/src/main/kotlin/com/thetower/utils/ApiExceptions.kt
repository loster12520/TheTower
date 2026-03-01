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
) : ApiException(HttpStatusCode.BadRequest, ErrorCodes.BAD_REQUEST, message, details)

class TemplateNotFoundException(message: String) :
    ApiException(HttpStatusCode.NotFound, ErrorCodes.TEMPLATE_NOT_FOUND, message)

class RunNotFoundException(message: String) :
    ApiException(HttpStatusCode.NotFound, ErrorCodes.RUN_NOT_FOUND, message)

class ConflictException(message: String) :
    ApiException(HttpStatusCode.Conflict, ErrorCodes.TEMPLATE_CONFLICT, message)
