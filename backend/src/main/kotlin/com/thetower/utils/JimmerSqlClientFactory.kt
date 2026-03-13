package com.thetower.utils

import org.babyfish.jimmer.sql.kt.KSqlClient
import org.babyfish.jimmer.sql.kt.newKSqlClient
import org.sqlite.SQLiteDataSource

object JimmerSqlClientFactory {

    fun create(sqliteConfig: SqliteConfig): KSqlClient? {
        if (!sqliteConfig.enabled) {
            return null
        }
        val dataSource = SQLiteDataSource().apply {
            url = sqliteConfig.jdbcUrl
        }
        return newKSqlClient {
            setConnectionManager {
                dataSource.connection.use { connection ->
                    proceed(connection)
                }
            }
        }
    }
}
