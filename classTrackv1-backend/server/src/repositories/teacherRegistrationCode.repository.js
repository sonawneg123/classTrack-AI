/**
 * server/src/repositories/teacherRegistrationCode.repository.js
 *
 * Data access for the teacher_registration_codes table.
 * All lookups are by code_hash — the raw code is NEVER stored or logged here.
 */
const BaseRepository = require('./base.repository');

class TeacherRegistrationCodeRepository extends BaseRepository {
  constructor() { super('teacher_registration_codes'); }

  /**
   * Finds a code row whose hash matches, is not expired, not revoked,
   * and not already used. Returns the row or null.
   */
  async findValidByHash(codeHash) {
    const [rows] = await this.pool.query(
      `SELECT * FROM teacher_registration_codes
       WHERE code_hash = $1
         AND is_revoked = FALSE
         AND used_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [codeHash]
    );
    return rows[0] || null;
  }

  /** Mark a code as consumed: set used_at = now, used_by = teacherId. */
  async markUsed(id, teacherId) {
    await this.pool.query(
      `UPDATE teacher_registration_codes
       SET used_at = NOW(), used_by = $1, updated_at = NOW()
       WHERE id = $2`,
      [teacherId, id]
    );
  }

  /** Revoke a specific code (admin action). */
  async revoke(id) {
    await this.pool.query(
      `UPDATE teacher_registration_codes
       SET is_revoked = TRUE, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  /**
   * List all codes created by a specific admin, newest first.
   * NEVER returns code_hash in the result — only safe status fields.
   */
  async listByAdmin(adminId, { limit, offset }) {
    const [rows] = await this.pool.query(
      `SELECT id, created_by, expires_at, used_at, used_by,
              is_revoked, created_at, updated_at
       FROM teacher_registration_codes
       WHERE created_by = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [adminId, limit, offset]
    );
    const [[{ total }]] = await this.pool.query(
      `SELECT COUNT(*) AS total FROM teacher_registration_codes WHERE created_by = $1`,
      [adminId]
    );
    return { rows, total: Number(total) };
  }

  /**
   * List all codes (admin superlist), newest first.
   * NEVER returns code_hash.
   */
  async listAll({ limit, offset }) {
    const [rows] = await this.pool.query(
      `SELECT trc.id, trc.created_by, a.name AS created_by_name,
              trc.expires_at, trc.used_at, trc.used_by, trc.is_revoked,
              trc.created_at, trc.updated_at
       FROM teacher_registration_codes trc
       JOIN admins a ON a.id = trc.created_by
       ORDER BY trc.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const [[{ total }]] = await this.pool.query(
      `SELECT COUNT(*) AS total FROM teacher_registration_codes`
    );
    return { rows, total: Number(total) };
  }

  /** Find a code record by id (for revocation validation). */
  async findByIdForAdmin(id) {
    const [rows] = await this.pool.query(
      `SELECT id, created_by, expires_at, used_at, used_by,
              is_revoked, created_at, updated_at
       FROM teacher_registration_codes
       WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }
}

module.exports = new TeacherRegistrationCodeRepository();
