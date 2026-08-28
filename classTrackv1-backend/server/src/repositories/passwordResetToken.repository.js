/**
 * server/src/repositories/passwordResetToken.repository.js
 *
 * PostgreSQL-compatible. Parameter placeholders are $1, $2, …
 */
const BaseRepository = require('./base.repository');

class PasswordResetTokenRepository extends BaseRepository {
  constructor() { super('password_reset_tokens'); }

  async insert({ userId, userRole, tokenHash, expiresAt }) {
    const [rows] = await this.pool.query(
      `INSERT INTO password_reset_tokens (user_id, user_role, token_hash, expires_at)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [userId, userRole, tokenHash, expiresAt]
    );
    return rows[0].id;
  }

  async findValidByHash(tokenHash) {
    const [rows] = await this.pool.query(
      `SELECT * FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    return rows[0] || null;
  }

  async markUsed(id) {
    await this.pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [id]);
  }

  /** Invalidate any earlier outstanding reset tokens when a new one is issued. */
  async invalidateAllForUser(userId, userRole) {
    await this.pool.query(
      `UPDATE password_reset_tokens SET used_at = NOW()
       WHERE user_id = $1 AND user_role = $2 AND used_at IS NULL`,
      [userId, userRole]
    );
  }
}

module.exports = new PasswordResetTokenRepository();
