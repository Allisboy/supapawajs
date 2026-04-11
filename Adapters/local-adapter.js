import { SessionAdapter } from '../Session-Adapter.js'

export class MemoryAdapter extends SessionAdapter {
    constructor() {
        super()
        this.store = new Map()
        this.timers = new Map()
    }

    async get(sessionId) {
        const session = this.store.get(sessionId)
        return session || null
    }

    async set(sessionId, data, ttl = 86400) {
        this.store.set(sessionId, data)

        // Clear existing timer
        if (this.timers.has(sessionId)) {
            clearTimeout(this.timers.get(sessionId))
        }

        // Set expiry timer
        const timer = setTimeout(() => {
            this.store.delete(sessionId)
            this.timers.delete(sessionId)
        }, ttl * 1000)

        this.timers.set(sessionId, timer)
    }

    async delete(sessionId) {
        this.store.delete(sessionId)
        
        if (this.timers.has(sessionId)) {
            clearTimeout(this.timers.get(sessionId))
            this.timers.delete(sessionId)
        }
    }

    async touch(sessionId, ttl = 86400) {
        const data = await this.get(sessionId)
        if (data) {
            await this.set(sessionId, data, ttl)
        }
    }
}