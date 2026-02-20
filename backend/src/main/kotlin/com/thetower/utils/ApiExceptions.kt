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
) : ApiException(HttpStatusCode.BadRequest, "BAD_REQUEST", message, details)

class NotFoundException(message: String) :
    ApiException(HttpStatusCode.NotFound, "NOT_FOUND", message)

class ConflictException(message: String) :
    ApiException(HttpStatusCode.Conflict, "CONFLICT", message)
