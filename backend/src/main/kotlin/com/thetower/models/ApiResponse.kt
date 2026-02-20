package com.thetower.models

import kotlinx.serialization.Serializable

@Serializable
data class ApiResponse<T>(
    val requestId: String,
    val data: T?,
    val error: ErrorDetail? = null
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
