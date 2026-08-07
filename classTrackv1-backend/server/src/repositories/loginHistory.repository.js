/**
 * server/src/repositories/loginHistory.repository.js
 */
const BaseRepository = require('./base.repository');

class LoginHistoryRepository extends BaseRepository {
  constructor() { super('login_history'); }

  async record({ userId, userRole, identifier, success, failureReason, ipAddress, userAgent }) {
    await this.pool.query(
      `INSERT INTO login_history (user_id, user_role, identifier, success, failure_reason, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId || null, userRole || null, identifier, success ? 1 : 0, failureReason || null, ipAddress || null, userAgent || null]
    );
  }

  async listForUser(userId, userRole, { limit = 20, offset = 0 } = {}) {
    const [rows] = await this.pool.query(
      `SELECT * FROM login_history WHERE user_id = ? AND user_role = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [userId, userRole, limit, offset]
    );
    return rows;
  }

  /** Count recent failed attempts within a window — used for anomaly checks beyond simple lockout. */
  async countRecentFailures(identifier, sinceMinutesAgo) {
    const [[{ n }]] = await this.pool.query(
      `SELECT COUNT(*) AS n FROM login_history
       WHERE identifier = ? AND success = 0 AND created_at > (NOW() - INTERVAL ? MINUTE)`,
      [identifier, sinceMinutesAgo]
    );
    return Number(n);
  }
}

module.exports = new LoginHistoryRepository();
