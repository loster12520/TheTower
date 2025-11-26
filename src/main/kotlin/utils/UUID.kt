package com.lignting.utils

fun uuid(): String {
    return java.util.UUID.randomUUID().toString().replace("-", "")
}