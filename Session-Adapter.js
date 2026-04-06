// src/pawajs/auth/adapters/base.js

/**
 * Base session storage adapter
 * All adapters must implement these methods
 */
export class SessionAdapter {
    /**
     * Get session by ID
     * @param {string} sessionId
     * @returns {Promise<object|null>}
     */
    async get(sessionId) {
        throw new Error('get() must be implemented')
    }

    /**
     * Set session data
     * @param {string} sessionId
     * @param {object} data
     * @param {number} ttl - Time to live in seconds
     * @returns {Promise<void>}
     */
    async set(sessionId, data, ttl = 86400) {
        throw new Error('set() must be implemented')
    }

    /**
     * Delete session
     * @param {string} sessionId
     * @returns {Promise<void>}
     */
    async delete(sessionId) {
        throw new Error('delete() must be implemented')
    }

    /**
     * Update session expiry
     * @param {string} sessionId
     * @param {number} ttl
     * @returns {Promise<void>}
     */
    async touch(sessionId, ttl = 86400) {
        throw new Error('touch() must be implemented')
    }
}