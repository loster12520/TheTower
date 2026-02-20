package com.thetower.models

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class WorkflowTemplate(
    val id: String,
    val name: String,
    val description: String? = null,
    val schemaVersion: String,
    val steps: List<StepNode>,
    val otherStep: OtherStep,
    val createdAt: String,
    val updatedAt: String,
    val stats: TemplateStats,
    val lastRun: LastRun? = null
)

@Serializable
data class TemplateSummary(
    val id: String,
    val name: String,
    val description: String? = null,
    val updatedAt: String,
    val stats: TemplateStats,
    val lastRun: LastRun? = null
)

@Serializable
data class TemplateStats(
    val stepCount: Int
)

@Serializable
data class LastRun(
    val runId: String,
    val status: String,
    val finishedAt: String? = null
)

@Serializable
data class StepNode(
    val id: String,
    val type: String,
    val position: Position,
    val data: StepData
)

@Serializable
data class Position(
    val x: Double,
    val y: Double
)

@Serializable
data class StepData(
    val label: String,
    val config: JsonObject
)

@Serializable
data class OtherStep(
    val nodes: List<StepNode> = emptyList(),
    val edges: List<StepEdge> = emptyList()
)

@Serializable
data class StepEdge(
    val id: String,
    val source: String,
    val target: String
)

@Serializable
data class CreateTemplateRequest(
    val name: String,
    val description: String? = null,
    val schemaVersion: String,
    val steps: List<StepNode> = emptyList(),
    val otherStep: OtherStep = OtherStep()
)

@Serializable
data class PatchTemplateRequest(
    val name: String? = null,
    val description: String? = null
)

@Serializable
data class SaveTemplateRequest(
    val schemaVersion: String,
    val steps: List<StepNode>,
    val otherStep: OtherStep
)

@Serializable
data class TemplateListData(
    val items: List<TemplateSummary>
)
