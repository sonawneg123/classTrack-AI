/**
 * server/src/repositories/teacher.repository.js
 */
const BaseRepository = require('./base.repository');

class TeacherRepository extends BaseRepository {
  constructor() { super('teachers'); }

  async findByEmail(email) {
    return this.findOneBy('email', email.trim().toLowerCase());
  }

  async updateLastLogin(id) {
    return this.updateById(id, { last_login_at: new Date() });
  }

  async markEmailVerified(id) {
    return this.updateById(id, { email_verified_at: new Date() });
  }

  async listWithClassroomCount({ limit, offset }) {
    const [rows] = await this.pool.query(
      `SELECT t.id, t.name, t.email, t.is_active, t.created_at, t.last_login_at,
              COUNT(DISTINCT c.id) AS classroom_count
       FROM teachers t
       LEFT JOIN classrooms c ON c.teacher_id = t.id
       GROUP BY t.id
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const total = await this.count();
    return { rows, total };
  }

  async toggleActive(id) {
    return this.toggleBoolById(id, 'is_active');
  }

  async updatePassword(id, passwordHash) {
    return this.updateById(id, { password_hash: passwordHash });
  }
}

module.exports = new TeacherRepository();
