val kotlin_version: String by project
val logback_version: String by project
val jimmerVersion: String by project

plugins {
    kotlin("jvm") version "2.2.20"
    id("io.ktor.plugin") version "3.3.2"
    id("com.google.devtools.ksp") version "2.3.3"
}

group = "com.lignting"
version = "0.0.1"

application {
    mainClass = "io.ktor.server.netty.EngineMain"
}

dependencies {
    implementation("io.ktor:ktor-server-core-jvm")
    implementation("io.ktor:ktor-server-netty")
    implementation("ch.qos.logback:logback-classic:$logback_version")
    implementation("io.ktor:ktor-server-core")
    implementation("io.ktor:ktor-server-config-yaml")
    implementation("io.ktor:ktor-server-content-negotiation:3.3.2")
    implementation("io.ktor:ktor-serialization-gson:3.3.2")
    implementation("io.ktor:ktor-server-content-negotiation:3.3.2")
    implementation("io.ktor:ktor-server-host-common:3.3.2")
    implementation("io.ktor:ktor-server-status-pages:3.3.2")
    testImplementation("io.ktor:ktor-server-test-host")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit:$kotlin_version")
    
    implementation("org.babyfish.jimmer:jimmer-sql-kotlin:${jimmerVersion}")
    ksp("org.babyfish.jimmer:jimmer-ksp:${jimmerVersion}")
    runtimeOnly("mysql:mysql-connector-java:8.0.30")
    implementation("com.zaxxer:HikariCP:7.0.2")
}

kotlin {
    sourceSets.main {
        kotlin.srcDir("build/generated/ksp/main/kotlin")
    }
}