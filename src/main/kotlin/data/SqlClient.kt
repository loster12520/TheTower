package com.lignting.data

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.babyfish.jimmer.sql.JSqlClient
import org.babyfish.jimmer.sql.dialect.MySqlDialect
import org.babyfish.jimmer.sql.kt.KSqlClient
import org.babyfish.jimmer.sql.kt.toKSqlClient
import org.babyfish.jimmer.sql.runtime.ConnectionManager


object Database {
    private val ds by lazy {
        HikariDataSource(
            HikariConfig().apply {
                jdbcUrl = System.getenv("MYSQL_DATABASE_URL")
                    ?: "jdbc:mysql://localhost:3306/theTower"
                username = System.getenv("MYSQL_DATABASE_USERNAME")
                    ?: "root"
                password = System.getenv("MYSQL_DATABASE_PASSWORD")
                    ?: "123456"
                driverClassName = "com.mysql.cj.jdbc.Driver"
                maximumPoolSize = 10
                isAutoCommit = false
            }
        )
    }
    
    private val connectionManager by lazy {
        ConnectionManager.simpleConnectionManager(ds)
    }
    
    val jSqlClient by lazy {
        JSqlClient.newBuilder()
            .setDialect(MySqlDialect())
            .setConnectionManager(connectionManager)
            .build()
    }
    
    val kSqlClient by lazy {
        jSqlClient.toKSqlClient()
    }
}

val sqlClient: KSqlClient
    get() = Database.kSqlClient