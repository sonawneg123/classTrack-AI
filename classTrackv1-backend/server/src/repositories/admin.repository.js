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

  /**
   * Single-query admin dashboard aggregate.
   * Returns counts/breakdowns needed for the admin dashboard page.
   * Never returns passwords, hashes, or tokens.
   */
  async getDashboardData() {
    // ── 1. One mega-aggregate for all scalar counts ──────────────────────────
    const [[counts]] = await this.pool.query(`
      SELECT
        -- teachers
        (SELECT COUNT(*)               FROM teachers)              AS teacher_total,
        (SELECT COUNT(*) FILTER (WHERE is_active = TRUE)  FROM teachers) AS teacher_active,
        (SELECT COUNT(*) FILTER (WHERE is_active = FALSE) FROM teachers) AS teacher_inactive,
        -- teachers with no classroom
        (SELECT COUNT(*)
           FROM teachers t
          WHERE NOT EXISTS (
            SELECT 1 FROM classrooms c
             WHERE c.teacher_id = t.id AND c.deleted_at IS NULL
          )
        )                                                          AS teacher_unassigned,
        -- students
        (SELECT COUNT(*)               FROM students)              AS student_total,
        (SELECT COUNT(*) FILTER (WHERE is_active = TRUE)  FROM students) AS student_active,
        (SELECT COUNT(*) FILTER (WHERE is_active = FALSE) FROM students) AS student_inactive,
        -- classrooms (non-deleted)
        (SELECT COUNT(*)                              FROM classrooms WHERE deleted_at IS NULL) AS classroom_total,
        (SELECT COUNT(*) FILTER (WHERE is_active = TRUE  AND deleted_at IS NULL) FROM classrooms) AS classroom_active,
        (SELECT COUNT(*) FILTER (WHERE is_active = FALSE AND deleted_at IS NULL) FROM classrooms) AS classroom_inactive,
        -- tasks (non-deleted)
        (SELECT COUNT(*)                              FROM tasks WHERE deleted_at IS NULL) AS task_total,
        (SELECT COUNT(*) FILTER (WHERE is_active = TRUE  AND deleted_at IS NULL) FROM tasks) AS task_active,
        -- submissions by status
        (SELECT COUNT(*)                                    FROM submissions)                AS submission_total,
        (SELECT COUNT(*) FILTER (WHERE status = 'submitted')  FROM submissions)             AS submission_pending,
        (SELECT COUNT(*) FILTER (WHERE status = 'analyzing')  FROM submissions)             AS submission_analyzing,
        (SELECT COUNT(*) FILTER (WHERE status = 'analyzed')   FROM submissions)             AS submission_analyzed,
        (SELECT COUNT(*) FILTER (WHERE status = 'failed')     FROM submissions)             AS submission_failed,
        -- registration codes
        (SELECT COUNT(*) FROM teacher_registration_codes
          WHERE is_revoked = FALSE AND used_at IS NULL AND expires_at > NOW())              AS reg_codes_active,
        (SELECT COUNT(*) FROM teacher_registration_codes
          WHERE is_revoked = FALSE AND used_at IS NULL AND expires_at <= NOW())             AS reg_codes_expired
    `);

    // ── 2. Classroom list with teacher + student count ───────────────────────
    const [classroomRows] = await this.pool.query(`
      SELECT
        c.id, c.name, c.subject, c.section, c.class_code, c.is_active, c.created_at,
        t.id   AS teacher_id,
        t.name AS teacher_name,
        t.is_active AS teacher_is_active,
        COUNT(DISTINCT s.id)  AS student_count,
        COUNT(DISTINCT tk.id) AS task_count
      FROM classrooms c
      JOIN teachers t   ON t.id = c.teacher_id
      LEFT JOIN students s ON s.classroom_id = c.id
      LEFT JOIN tasks tk   ON tk.classroom_id = c.id AND tk.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
      GROUP BY c.id, t.id
      ORDER BY c.created_at DESC
      LIMIT 20
    `);

    // ── 3. Recent audit log activity (last 20 events) ────────────────────────
    const [activityRows] = await this.pool.query(`
      SELECT
        al.id,
        al.actor_type,
        al.actor_id,
        al.action,
        al.target_type,
        al.target_id,
        al.details,
        al.created_at,
        -- resolve actor name from respective table
        CASE
          WHEN al.actor_type = 'admin'   THEN a.name
          WHEN al.actor_type = 'teacher' THEN te.name
          WHEN al.actor_type = 'student' THEN st.name
          ELSE NULL
        END AS actor_name
      FROM audit_logs al
      LEFT JOIN admins   a  ON al.actor_type = 'admin'   AND a.id  = al.actor_id
      LEFT JOIN teachers te ON al.actor_type = 'teacher' AND te.id = al.actor_id
      LEFT JOIN students st ON al.actor_type = 'student' AND st.id = al.actor_id
      ORDER BY al.created_at DESC
      LIMIT 20
    `);

    return { counts, classroomRows, activityRows };
  }
}

module.exports = new AdminRepository();
