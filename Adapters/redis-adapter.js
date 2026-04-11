import { SessionAdapter } from '../Session-Adapter.js';

export class RedisAdapter extends SessionAdapter {
    /**
     * @param {Object} redisClient - An instance of ioredis
     * @param {string} prefix - Prefix for session keys
     */
    constructor(redisClient, prefix = 'sess:') {
        super();
        this.redis = redisClient;
        this.prefix = prefix;
    }

    async get(sessionId) {
        const data = await this.redis.get(this.prefix + sessionId);
        if (!data) return null;
        
        try {
            return JSON.parse(data);
        } catch (e) {
            console.error(`[RedisAdapter] Failed to parse session ${sessionId}:`, e);
            return null;
        }
    }

    async set(sessionId, data, ttl = 86400) {
        const key = this.prefix + sessionId;
        const value = JSON.stringify(data);
        
        if (ttl) {
            await this.redis.set(key, value, 'EX', ttl);
        } else {
            await this.redis.set(key, value);
        }
    }

    async delete(sessionId) {
        await this.redis.del(this.prefix + sessionId);
    }

    async touch(sessionId, ttl = 86400) {
        const key = this.prefix + sessionId;
        const exists = await this.redis.exists(key);
        if (exists) {
            await this.redis.expire(key, ttl);
        }
    }
}