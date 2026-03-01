package com.thetower.utils

import io.ktor.server.application.ApplicationCall
import io.ktor.util.AttributeKey

const val REQUEST_ID_HEADER = "X-Request-Id"

private val requestIdKey = AttributeKey<String>("request-id")

fun ApplicationCall.setRequestId(requestId: String) {
    attributes.put(requestIdKey, requestId)
}

fun ApplicationCall.requestId(): String = attributes.getOrNull(requestIdKey)
    ?: request.headers[REQUEST_ID_HEADER]?.takeIf { it.isNotBlank() }
    ?: newId()
