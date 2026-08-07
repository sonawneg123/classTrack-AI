/**
 * server/src/repositories/passwordResetToken.repository.js
 */
const BaseRepository = require('./base.repository');

class PasswordResetTokenRepository extends BaseRepository {
  constructor() { super('password_reset_tokens'); }

  async insert({ userId, userRole, tokenHash, expiresAt }) {
    const [result] = await this.pool.query(
      `INSERT INTO password_reset_tokens (user_id, user_role, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [userId, userRole, tokenHash, expiresAt]
    );
    return result.insertId;
  }

  async findValidByHash(tokenHash) {
    const [rows] = await this.pool.query(
      `SELECT * FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    return rows[0] || null;
  }

  async markUsed(id) {
    await this.pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [id]);
  }

  /** Invalidate any earlier outstanding reset tokens when a new one is issued. */
  async invalidateAllForUser(userId, userRole) {
    await this.pool.query(
      `UPDATE password_reset_tokens SET used_at = NOW()
       WHERE user_id = ? AND user_role = ? AND used_at IS NULL`,
      [userId, userRole]
    );
  }
}

module.exports = new PasswordResetTokenRepository();
