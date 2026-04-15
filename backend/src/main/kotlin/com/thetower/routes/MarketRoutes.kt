package com.thetower.routes

import com.thetower.models.ImportPublishedTemplateRequest
import com.thetower.models.MarketTemplateListData
import com.thetower.models.PublishTemplateRequest
import com.thetower.models.success
import com.thetower.services.TemplateMarketService
import com.thetower.utils.requestId
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.server.routing.routing

fun Application.marketRoutes(templateMarketService: TemplateMarketService) {
    routing {
        route("/api/v1/market/templates") {
            get {
                val keyword = call.request.queryParameters["keyword"]
                val items = templateMarketService.listPublishedTemplates(keyword)
                call.respond(HttpStatusCode.OK, MarketTemplateListData(items).success(call.requestId()))
            }

            post("/publish") {
                val request = call.receive<PublishTemplateRequest>()
                val published = templateMarketService.publishTemplate(request.templateId)
                call.respond(HttpStatusCode.Created, published.success(call.requestId()))
            }

            post("/{id}/import") {
                val id = call.parameters["id"] ?: ""
                val request = call.receive<ImportPublishedTemplateRequest>()
                val imported = templateMarketService.importPublishedTemplate(id, request)
                call.respond(HttpStatusCode.Created, imported.success(call.requestId()))
            }
        }
    }
}