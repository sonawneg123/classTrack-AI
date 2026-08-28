/**
 * server/src/repositories/admin.repository.js
 *
 * PostgreSQL-compatible. Parameter placeholders are $1, $2, …
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
        (SELECT COUNT(*) FROM teachers)      AS teachercount,
        (SELECT COUNT(*) FROM classrooms)    AS classroomcount,
        (SELECT COUNT(*) FROM students)      AS studentcount,
        (SELECT COUNT(*) FROM tasks)         AS taskcount,
        (SELECT COUNT(*) FROM submissions)   AS submissioncount,
        (SELECT AVG(COALESCE(teacher_score, ai_score))
           FROM submissions WHERE status = 'analyzed') AS avgscore
    `);
    // Normalise to camelCase keys to match original contract
    return {
      teacherCount:    Number(stats.teachercount),
      classroomCount:  Number(stats.classroomcount),
      studentCount:    Number(stats.studentcount),
      taskCount:       Number(stats.taskcount),
      submissionCount: Number(stats.submissioncount),
      avgScore:        stats.avgscore !== null ? Number(stats.avgscore) : null,
    };
  }
}

module.exports = new AdminRepository();
