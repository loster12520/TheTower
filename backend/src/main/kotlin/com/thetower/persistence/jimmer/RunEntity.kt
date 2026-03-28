package com.thetower.persistence.jimmer

import org.babyfish.jimmer.sql.Column
import org.babyfish.jimmer.sql.Entity
import org.babyfish.jimmer.sql.Id
import org.babyfish.jimmer.sql.Table

@Entity
@Table(name = "runs")
interface RunEntity {

    @Id
    val id: String

    @Column(name = "template_id")
    val templateId: String

    val status: String

    @Column(name = "current_step_id")
    val currentStepId: String?

    @Column(name = "started_at")
    val startedAt: String?

    @Column(name = "finished_at")
    val finishedAt: String?

    @Column(name = "error_json")
    val errorJson: String?

    @Column(name = "outputs_json")
    val outputsJson: String?

    @Column(name = "artifacts_json")
    val artifactsJson: String?
}
