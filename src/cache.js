import { kvs as storage } from '@forge/kvs';
import { CACHE_CONFIG } from './config.js';

export async function getCachedData(cacheKey, ttlMs = CACHE_CONFIG.LIFECYCLE_TTL) {
    if (!CACHE_CONFIG.ENABLED) return { hit: false, data: null };

    try {
        const cached = await storage.get(cacheKey);
        if (!cached) return { hit: false, data: null };

        const age = Date.now() - cached.timestamp;
        if (age > ttlMs) {
            console.log(`[Cache] Expired for ${cacheKey} (age: ${Math.round(age / 1000)}s)`);
            return { hit: false, data: null };
        }

        console.log(`[Cache] HIT for ${cacheKey} (age: ${Math.round(age / 1000)}s)`);
        return { hit: true, data: cached.data };
    } catch (error) {
        console.error(`[Cache] Read error for ${cacheKey}:`, error);
        return { hit: false, data: null };
    }
}

export async function setCachedData(cacheKey, data) {
    if (!CACHE_CONFIG.ENABLED) return false;

    try {
        await storage.set(cacheKey, { timestamp: Date.now(), data });
        console.log(`[Cache] Stored for ${cacheKey}`);
        return true;
    } catch (error) {
        console.error(`[Cache] Write error for ${cacheKey}:`, error);
        return false;
    }
}

export async function clearCache(cacheKey) {
    try {
        await storage.delete(cacheKey);
        console.log(`[Cache] Cleared for ${cacheKey}`);
        return true;
    } catch (error) {
        console.error(`[Cache] Clear error for ${cacheKey}:`, error);
        return false;
    }
}
