package com.thetower.models

import kotlinx.serialization.Serializable

@Serializable
data class ApiResponse<T>(
    val requestId: String,
    val data: T?,
    val error: ErrorDetail? = null
)

fun <T> T.success(requestId: String): ApiResponse<T> = ApiResponse(
    requestId = requestId,
    data = this,
    error = null
)

fun ErrorDetail.fail(requestId: String): ApiResponse<Nothing?> = ApiResponse(
    requestId = requestId,
    data = null,
    error = this
)

@Serializable
data class ErrorDetail(
    val code: String,
    val message: String,
    val details: Map<String, String>? = null
)

@Serializable
data class DeletedData(
    val deleted: Boolean
)
