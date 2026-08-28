/**
 * server/src/repositories/loginHistory.repository.js
 *
 * PostgreSQL-compatible. Parameter placeholders are $1, $2, …
 * MySQL `INTERVAL ? MINUTE` replaced with PostgreSQL `NOW() - ($3 * INTERVAL '1 minute')`
 */
const BaseRepository = require('./base.repository');

class LoginHistoryRepository extends BaseRepository {
  constructor() { super('login_history'); }

  async record({ userId, userRole, identifier, success, failureReason, ipAddress, userAgent }) {
    await this.pool.query(
      `INSERT INTO login_history (user_id, user_role, identifier, success, failure_reason, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId || null, userRole || null, identifier, success, failureReason || null, ipAddress || null, userAgent || null]
    );
  }

  async listForUser(userId, userRole, { limit = 20, offset = 0 } = {}) {
    const [rows] = await this.pool.query(
      `SELECT * FROM login_history WHERE user_id = $1 AND user_role = $2
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [userId, userRole, limit, offset]
    );
    return rows;
  }

  /** Count recent failed attempts within a window. */
  async countRecentFailures(identifier, sinceMinutesAgo) {
    const [[{ n }]] = await this.pool.query(
      `SELECT COUNT(*) AS n FROM login_history
       WHERE identifier = $1 AND success = FALSE AND created_at > (NOW() - ($2 * INTERVAL '1 minute'))`,
      [identifier, sinceMinutesAgo]
    );
    return Number(n);
  }
}

module.exports = new LoginHistoryRepository();
