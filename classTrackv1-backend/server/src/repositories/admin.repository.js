/**
 * server/src/repositories/admin.repository.js
 *
 * All SQL for the admin domain in one place.
 * Services call these methods — zero SQL leaks into controllers.
 */
const BaseRepository = require('./base.repository');

class AdminRepository extends BaseRepository {
  constructor() {
    super('admins');
  }

  async findByEmail(email) {
    return this.findOneBy('email', email.trim().toLowerCase());
  }

  async updateLastLogin(id) {
    return this.updateById(id, { last_login_at: new Date() });
  }

  async markEmailVerified(id) {
    return this.updateById(id, { email_verified_at: new Date() });
  }

  async getPlatformStats() {
    const [[stats]] = await this.pool.query(`
      SELECT
        (SELECT COUNT(*) FROM teachers)      AS teacherCount,
        (SELECT COUNT(*) FROM classrooms)    AS classroomCount,
        (SELECT COUNT(*) FROM students)      AS studentCount,
        (SELECT COUNT(*) FROM tasks)         AS taskCount,
        (SELECT COUNT(*) FROM submissions)   AS submissionCount,
        (SELECT AVG(COALESCE(teacher_score, ai_score))
           FROM submissions WHERE status = 'analyzed') AS avgScore
    `);
    return stats;
  }
}

module.exports = new AdminRepository();
