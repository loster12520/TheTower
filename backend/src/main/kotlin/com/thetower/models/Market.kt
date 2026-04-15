package com.thetower.models

import kotlinx.serialization.Serializable

@Serializable
data class PublishedTemplate(
    val id: String,
    val sourceTemplateId: String,
    val name: String,
    val description: String? = null,
    val groupName: String? = null,
    val tags: List<String> = emptyList(),
    val schemaVersion: String,
    val steps: List<StepNode>,
    val otherStep: OtherStep,
    val stats: TemplateStats,
    val sourceUpdatedAt: String,
    val publishedAt: String
)

@Serializable
data class PublishedTemplateSummary(
    val id: String,
    val sourceTemplateId: String,
    val name: String,
    val description: String? = null,
    val groupName: String? = null,
    val tags: List<String> = emptyList(),
    val schemaVersion: String,
    val stats: TemplateStats,
    val sourceUpdatedAt: String,
    val publishedAt: String
)

@Serializable
data class PublishTemplateRequest(
    val templateId: String
)

@Serializable
data class ImportPublishedTemplateRequest(
    val name: String? = null
)

@Serializable
data class MarketTemplateListData(
    val items: List<PublishedTemplateSummary>
)