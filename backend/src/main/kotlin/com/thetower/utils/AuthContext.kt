package com.thetower.utils

import io.ktor.http.HttpHeaders
import io.ktor.server.application.ApplicationCall

const val WORKSPACE_ID_HEADER = "X-Workspace-Id"

fun ApplicationCall.bearerToken(): String? {
    val raw = request.headers[HttpHeaders.Authorization]?.trim() ?: return null
    if (!raw.startsWith("Bearer ", ignoreCase = true)) {
        return null
    }
    return raw.substringAfter(' ').trim().takeIf { it.isNotEmpty() }
}

fun ApplicationCall.queryToken(name: String = "token"): String? {
    return request.queryParameters[name]?.trim()?.takeIf { it.isNotEmpty() }
}