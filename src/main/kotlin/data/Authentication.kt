package com.lignting.data

import org.babyfish.jimmer.sql.Entity
import org.babyfish.jimmer.sql.GeneratedValue
import org.babyfish.jimmer.sql.GenerationType
import org.babyfish.jimmer.sql.Id
import org.babyfish.jimmer.sql.Key

@Entity
interface User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long
    
    @Key
    val userName: String
    
    val password: String
}

data class UserDTO(
    val userName: String,
    val password: String
)