// src/pawajs/auth/provider.js
import crypto from 'node:crypto'
import { parse, serialize } from 'cookie'



export class AuthProvider {
    constructor(adapter, options = {}) {
        this.adapter = adapter
        this.cookieName = options.cookieName || 'pawa_session'
        this.cookieOptions = {
            httpOnly: true,
            secure: options.secure !== false,
            sameSite: options.sameSite || 'lax',
            maxAge: options.maxAge || 86400000, // 24 hours
            path: options.path || '/',
            ...options.cookieOptions
        }
        this.ttl = options.ttl || 86400 // 24 hours in seconds
    }

    /**
     * Generate session ID
     */
    generateSessionId() {
        return crypto.randomBytes(32).toString('hex')
    }

    /**
     * Helper to get cookie from request
     */
    _getCookie(req) {
        if (req.cookies && req.cookies[this.cookieName]) {
            return req.cookies[this.cookieName]
        }
        if (req.headers && req.headers.cookie) {
            const cookies = parse(req.headers.cookie)
            return cookies[this.cookieName]
        }
        return null
    }

    /**
     * Get session from request
     */
    async getSession(req) {
        const sessionId = this._getCookie(req)

        if (!sessionId) {
            return null
        }

        return await this.adapter.get(sessionId)
    }

    /**
     * Create new session
     */
    async createSession(res, data) {
        const sessionId = this.generateSessionId()

        await this.adapter.set(sessionId, data, this.ttl)

        // Set cookie
        if (res.cookie) {
            res.cookie(this.cookieName, sessionId, this.cookieOptions)
        } else {
            res.setHeader('Set-Cookie', serialize(this.cookieName, sessionId, this.cookieOptions))
        }

        return { sessionId, data }
    }

    /**
     * Update session
     */
    async updateSession(req, res, data) {
        const sessionId = this._getCookie(req)

        if (!sessionId) {
            return await this.createSession(res, data)
        }

        await this.adapter.set(sessionId, data, this.ttl)

        return { sessionId, data }
    }

    /**
     * Destroy session
     */
    async destroySession(req, res) {
        const sessionId = this._getCookie(req)

        if (sessionId) {
            await this.adapter.delete(sessionId)
        }

        // Clear cookie
        if (res.clearCookie) {
            res.clearCookie(this.cookieName, this.cookieOptions)
        } else {
            res.setHeader('Set-Cookie', serialize(this.cookieName, '', { ...this.cookieOptions, maxAge: -1 }))
        }
    }

    /**
     * Touch session (refresh expiry)
     */
    async touchSession(req) {
        const sessionId = this._getCookie(req)

        if (sessionId) {
            await this.adapter.touch(sessionId, this.ttl)
        }
    }
}