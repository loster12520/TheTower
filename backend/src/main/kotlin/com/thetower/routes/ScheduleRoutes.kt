package com.thetower.routes

import com.thetower.models.CreateScheduleRequest
import com.thetower.models.DeletedData
import com.thetower.models.PatchScheduleRequest
import com.thetower.models.ScheduleListData
import com.thetower.models.success
import com.thetower.services.SchedulerService
import com.thetower.utils.requestId
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.patch
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.server.routing.routing

fun Application.scheduleRoutes(schedulerService: SchedulerService) {
    routing {
        route("/api/v1/schedules") {
            get {
                val templateId = call.request.queryParameters["templateId"]
                val enabled = call.request.queryParameters["enabled"]?.toBooleanStrictOrNull()
                val items = schedulerService.listSchedules(templateId, enabled)
                call.respond(HttpStatusCode.OK, ScheduleListData(items).success(call.requestId()))
            }

            post {
                val request = call.receive<CreateScheduleRequest>()
                val created = schedulerService.createSchedule(request)
                call.respond(HttpStatusCode.Created, created.success(call.requestId()))
            }

            patch("/{id}") {
                val id = call.parameters["id"] ?: ""
                val request = call.receive<PatchScheduleRequest>()
                val updated = schedulerService.updateSchedule(id, request)
                call.respond(HttpStatusCode.OK, updated.success(call.requestId()))
            }

            delete("/{id}") {
                val id = call.parameters["id"] ?: ""
                schedulerService.deleteSchedule(id)
                call.respond(HttpStatusCode.OK, DeletedData(deleted = true).success(call.requestId()))
            }
        }
    }
}