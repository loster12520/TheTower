package com.thetower.persistence.jimmer

import org.babyfish.jimmer.sql.Column
import org.babyfish.jimmer.sql.Entity
import org.babyfish.jimmer.sql.Id
import org.babyfish.jimmer.sql.Table

@Entity
@Table(name = "templates")
interface TemplateEntity {

    @Id
    val id: String

    val name: String

    val description: String?

    @Column(name = "schema_version")
    val schemaVersion: String

    @Column(name = "steps_json")
    val stepsJson: String

    @Column(name = "other_step_json")
    val otherStepJson: String

    @Column(name = "created_at")
    val createdAt: String

    @Column(name = "updated_at")
    val updatedAt: String

    @Column(name = "stats_step_count")
    val statsStepCount: Int

    @Column(name = "last_run_json")
    val lastRunJson: String?
}
