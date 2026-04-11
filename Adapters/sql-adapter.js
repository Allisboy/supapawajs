import { SessionAdapter } from '../Session-Adapter.js'

function hashSessionId(id) {
  return crypto
    .createHash('sha256')
    .update(id)
    .digest('hex')
}
export class SqlAdapter extends SessionAdapter {
    /**
     * @param {object} db - Database client (pg, mysql2, etc)
     * @param {string} table - Table name
     */
    constructor(db, table = 'sessions') {
        super()
        this.db = db
        this.table = table
    }

    async get(sessionId) {
        const result = await this.db.query(
            `SELECT data FROM ${this.table} 
             WHERE id = $1 AND expires_at > NOW()`,
            [sessionId]
        )

        if (result.rows && result.rows.length > 0) {
            return JSON.parse(result.rows[0].data)
        }

        return null
    }

    async set(sessionId, data, ttl = 86400) {
        const expiresAt = new Date(Date.now() + ttl * 1000)

        await this.db.query(
            `INSERT INTO ${this.table} (id, data, expires_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (id) 
             DO UPDATE SET data = $2, expires_at = $3`,
            [hashSessionId(sessionId), JSON.stringify(data), expiresAt]
        )
    }

    async delete(sessionId) {
        await this.db.query(
            `DELETE FROM ${this.table} WHERE id = $1`,
            [sessionId]
        )
    }

    async touch(sessionId, ttl = 86400) {
        const expiresAt = new Date(Date.now() + ttl * 1000)

        await this.db.query(
            `UPDATE ${this.table} SET expires_at = $1 WHERE id = $2`,
            [expiresAt, sessionId]
        )
    }

    /**
     * Create sessions table
     */
    async createTable() {
        await this.db.query(`
            CREATE TABLE IF NOT EXISTS ${this.table} (
                id VARCHAR(255) PRIMARY KEY,
                data TEXT NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_expires_at ON ${this.table}(expires_at);
        `)
    }

    /**
     * Clean expired sessions
     */
    async cleanup() {
        await this.db.query(
            `DELETE FROM ${this.table} WHERE expires_at < NOW()`
        )
    }
}