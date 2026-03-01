package com.thetower.utils

object ErrorCodes {
    const val BAD_REQUEST = "TT-0400-001"
    const val INVALID_STEP_CONFIG = "TT-0400-002"
    const val TEMPLATE_NOT_FOUND = "TT-0404-001"
    const val RUN_NOT_FOUND = "TT-0404-002"
    const val TEMPLATE_CONFLICT = "TT-0409-001"
    const val INVALID_RUN_STATE = "TT-0422-001"
    const val INTERNAL_ERROR = "TT-0500-001"
    const val EXECUTION_ERROR = "TT-0502-001"
    const val PERSISTENCE_UNAVAILABLE = "TT-0503-001"
}
