package com.thetower.utils

import java.util.UUID

fun newId(): String = UUID.randomUUID().toString()
