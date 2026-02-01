package com.thetower.models

import kotlinx.serialization.Serializable

@Serializable
data class HealthStatus(
    val status: String
)
