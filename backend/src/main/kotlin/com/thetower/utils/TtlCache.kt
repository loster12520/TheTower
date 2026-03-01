package com.thetower.utils

import java.util.concurrent.ConcurrentHashMap

private data class CacheEntry<V>(
    val value: V,
    val expiresAtMs: Long
)

class TtlCache<K, V>(
    private val ttlMs: Long
) {
    private val storage = ConcurrentHashMap<K, CacheEntry<V>>()

    fun get(key: K): V? {
        val entry = storage[key] ?: return null
        val now = System.currentTimeMillis()
        if (entry.expiresAtMs <= now) {
            storage.remove(key)
            return null
        }
        return entry.value
    }

    fun put(key: K, value: V) {
        val now = System.currentTimeMillis()
        storage[key] = CacheEntry(value = value, expiresAtMs = now + ttlMs)
    }

    fun invalidate(key: K) {
        storage.remove(key)
    }

    fun clear() {
        storage.clear()
    }
}
