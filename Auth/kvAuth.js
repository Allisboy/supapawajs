import { SessionAdapter } from '../Session-Adapter.js'

export class ServerlessAdapter extends SessionAdapter {
    /**
     * @param {object} kv - Vercel KV or Upstash Redis client
     */
    constructor(kv) {
        super()
        this.kv = kv
        this.prefix = 'pawa:session:'
    }

    async get(sessionId) {
        const key = this.prefix + sessionId
        const data = await this.kv.get(key)
        return data || null
    }

    async set(sessionId, data, ttl = 86400) {
        const key = this.prefix + sessionId
        await this.kv.set(key, data, { ex: ttl })
    }

    async delete(sessionId) {
        const key = this.prefix + sessionId
        await this.kv.del(key)
    }

    async touch(sessionId, ttl = 86400) {
        const key = this.prefix + sessionId
        await this.kv.expire(key, ttl)
    }
}