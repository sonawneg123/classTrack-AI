/**
 * server/src/repositories/student.repository.js
 *
 * PostgreSQL-compatible. Parameter placeholders are $1, $2, …
 */
const BaseRepository = require('./base.repository');

class StudentRepository extends BaseRepository {
  constructor() { super('students'); }

  // ── Legacy username-based lookup (kept for backward compat) ─────────────────

  async findByUsername(username) {
    const [rows] = await this.pool.query(
      `SELECT s.*, c.name AS classroom_name
       FROM students s
       LEFT JOIN classrooms c ON c.id = s.classroom_id
       WHERE s.username = $1 LIMIT 1`,
      [username.trim().toLowerCase()]
    );
    return rows[0] || null;
  }

  async findByUsernameInClassroom(username, classroomId) {
    return this.findOneBy('username', username.trim().toLowerCase());
  }

  async existsByUsername(username) {
    return (await this.countBy('username', username.trim().toLowerCase())) > 0;
  }

  // ── Email-based lookup (P1 student registration) ─────────────────────────────

  async findByEmail(email) {
    const [rows] = await this.pool.query(
      `SELECT * FROM students WHERE email = $1 LIMIT 1`,
      [email.trim().toLowerCase()]
    );
    return rows[0] || null;
  }

  async existsByEmail(email) {
    return (await this.countBy('email', email.trim().toLowerCase())) > 0;
  }

  // ── Mobile lookup ─────────────────────────────────────────────────────────────

  async existsByMobile(mobileNumber) {
    return (await this.countBy('mobile_number', mobileNumber)) > 0;
  }

  // ── Shared helpers ────────────────────────────────────────────────────────────

  async updateLastLogin(id) {
    return this.updateById(id, { last_login_at: new Date() });
  }

  async updatePassword(id, passwordHash) {
    return this.updateById(id, { password_hash: passwordHash });
  }

  async listByClassroom(classroomId) {
    const [rows] = await this.pool.query(
      'SELECT id, name, username FROM students WHERE classroom_id = $1 ORDER BY name',
      [classroomId]
    );
    return rows;
  }
}

module.exports = new StudentRepository();
