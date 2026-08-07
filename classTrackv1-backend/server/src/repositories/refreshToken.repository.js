/**
 * server/src/repositories/refreshToken.repository.js
 */
const BaseRepository = require('./base.repository');

class RefreshTokenRepository extends BaseRepository {
  constructor() { super('refresh_tokens'); }

  async insert({ userId, userRole, tokenHash, expiresAt, ipAddress, userAgent }) {
    const [result] = await this.pool.query(
      `INSERT INTO refresh_tokens (user_id, user_role, token_hash, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, userRole, tokenHash, expiresAt, ipAddress || null, userAgent || null]
    );
    return result.insertId;
  }

  async findValidByHash(tokenHash) {
    const [rows] = await this.pool.query(
      `SELECT * FROM refresh_tokens
       WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    return rows[0] || null;
  }

  /** Used for reuse-detection: finds a token by hash regardless of its current state. */
  async findByHash(tokenHash) {
    return this.findOneBy('token_hash', tokenHash);
  }

  /** Rotation: mark the old token as replaced by the new one and revoke it. */
  async rotate(oldTokenId, newTokenId) {
    await this.pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by_token_id = ? WHERE id = ?',
      [newTokenId, oldTokenId]
    );
  }

  async revokeById(id) {
    await this.pool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [id]);
  }

  /** Theft response: revoke every token in a rotation family (used on reuse detection). */
  async revokeAllForUser(userId, userRole) {
    await this.pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND user_role = ? AND revoked_at IS NULL',
      [userId, userRole]
    );
  }

  async deleteExpired() {
    const [result] = await this.pool.query('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
    return result.affectedRows;
  }
}

module.exports = new RefreshTokenRepository();
