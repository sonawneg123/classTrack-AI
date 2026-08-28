/**
 * server/src/repositories/classroom.repository.js
 *
 * PostgreSQL-compatible. Parameter placeholders are $1, $2, …
 * MySQL-specific removed: backticks, ? params, SET ?, GREATEST() with magic
 * string '1970-01-01' replaced with GREATEST(COALESCE(..., '1970-01-01'::timestamp))
 * which is valid PostgreSQL.
 */
const BaseRepository = require('./base.repository');

class ClassroomRepository extends BaseRepository {
  constructor() { super('classrooms'); }

  async findByCode(classCode) {
    return this.findOneBy('class_code', classCode.trim().toUpperCase());
  }

  async existsByCode(classCode) {
    return (await this.countBy('class_code', classCode.trim().toUpperCase())) > 0;
  }

  async listByTeacher(teacherId) {
    const [rows] = await this.pool.query(
      `SELECT c.id, c.name, c.subject, c.section, c.class_code, c.created_at,
              COUNT(DISTINCT s.id) AS student_count,
              COUNT(DISTINCT t.id) AS task_count
       FROM classrooms c
       LEFT JOIN students s ON s.classroom_id = c.id
       LEFT JOIN tasks t    ON t.classroom_id = c.id
       WHERE c.teacher_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [teacherId]
    );
    return rows;
  }

  async listWithTeacher({ limit, offset }) {
    const [rows] = await this.pool.query(
      `SELECT c.id, c.name, c.subject, c.section, c.class_code, c.is_active, c.created_at,
              t.id AS teacher_id, t.name AS teacher_name,
              COUNT(DISTINCT s.id) AS student_count
       FROM classrooms c
       JOIN teachers t ON t.id = c.teacher_id
       LEFT JOIN students s ON s.classroom_id = c.id
       GROUP BY c.id, t.id
       ORDER BY c.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const total = await this.count();
    return { rows, total };
  }

  async belongsToTeacher(classroomId, teacherId) {
    const [rows] = await this.pool.query(
      'SELECT * FROM classrooms WHERE id = $1 AND teacher_id = $2',
      [classroomId, teacherId]
    );
    return rows[0] || null;
  }

  // ---------------------------------------------------------------------
  // Classroom management (teacher-scoped CRUD, listing, dashboard stats)
  // ---------------------------------------------------------------------

  /** Same as belongsToTeacher, but excludes soft-deleted classrooms. */
  async findOwnedById(classroomId, teacherId) {
    const [rows] = await this.pool.query(
      'SELECT * FROM classrooms WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL',
      [classroomId, teacherId]
    );
    return rows[0] || null;
  }

  /** Case-insensitive duplicate check within one teacher's own (non-deleted) classrooms. */
  async existsDuplicate({ teacherId, name, section, excludeId = null }) {
    const params = [teacherId, name.trim(), (section || '').trim()];
    let sql = `
      SELECT id FROM classrooms
      WHERE teacher_id = $1
        AND deleted_at IS NULL
        AND LOWER(name) = LOWER($2)
        AND LOWER(COALESCE(section, '')) = LOWER($3)`;
    if (excludeId) {
      sql += ` AND id != $${params.length + 1}`;
      params.push(excludeId);
    }
    const [rows] = await this.pool.query(sql, params);
    return rows.length > 0;
  }

  /**
   * Paginated, searchable, sortable, filterable listing for one teacher's
   * classroom management screen.
   */
  async listByTeacherManaged({ teacherId, limit, offset, search, status, sortBy, sortDir }) {
    const where = ['c.teacher_id = $1', 'c.deleted_at IS NULL'];
    const params = [teacherId];

    if (status === 'active')   where.push('c.is_active = TRUE');
    if (status === 'archived') where.push('c.is_active = FALSE');

    if (search) {
      const like = `%${search}%`;
      params.push(like, like, like, like);
      const n = params.length;
      where.push(`(c.name ILIKE $${n-3} OR c.subject ILIKE $${n-2} OR c.section ILIKE $${n-1} OR c.class_code ILIKE $${n})`);
    }

    const sortColumns = {
      name:         'c.name',
      createdAt:    'c.created_at',
      studentCount: 'student_count',
      taskCount:    'task_count',
    };
    const orderColumn = sortColumns[sortBy] || 'c.created_at';
    const orderDir = sortDir === 'asc' ? 'ASC' : 'DESC';

    const whereSql = where.join(' AND ');

    params.push(limit, offset);
    const limitIdx  = params.length - 1;
    const offsetIdx = params.length;

    const [rows] = await this.pool.query(
      `SELECT c.id, c.name, c.subject, c.section, c.class_code, c.is_active, c.created_at,
              COUNT(DISTINCT s.id) AS student_count,
              COUNT(DISTINCT t.id) AS task_count,
              GREATEST(
                COALESCE(MAX(sub.submitted_at), '1970-01-01'::timestamp),
                COALESCE(MAX(t.created_at), '1970-01-01'::timestamp)
              ) AS latest_activity_at
       FROM classrooms c
       LEFT JOIN students s     ON s.classroom_id = c.id
       LEFT JOIN tasks t        ON t.classroom_id = c.id
       LEFT JOIN submissions sub ON sub.task_id = t.id
       WHERE ${whereSql}
       GROUP BY c.id
       ORDER BY ${orderColumn} ${orderDir}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const [[{ total }]] = await this.pool.query(
      `SELECT COUNT(DISTINCT c.id) AS total FROM classrooms c WHERE ${whereSql}`,
      countParams
    );

    return { rows, total: Number(total) };
  }

  async archive(id) {
    await this.pool.query('UPDATE classrooms SET is_active = FALSE WHERE id = $1', [id]);
  }

  async restore(id) {
    await this.pool.query('UPDATE classrooms SET is_active = TRUE WHERE id = $1', [id]);
  }

  async softDelete(id) {
    await this.pool.query('UPDATE classrooms SET deleted_at = NOW(), is_active = FALSE WHERE id = $1', [id]);
  }

  async updateFields(id, data) {
    const keys   = Object.keys(data);
    const values = Object.values(data);
    const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    await this.pool.query(
      `UPDATE classrooms SET ${setClauses} WHERE id = $${keys.length + 1}`,
      [...values, id]
    );
  }

  async regenerateCode(id, classCode) {
    await this.pool.query('UPDATE classrooms SET class_code = $1 WHERE id = $2', [classCode, id]);
  }

  // ---------------------------------------------------------------------------
  // Grading overview (classroom-level aggregated grading data)
  // ---------------------------------------------------------------------------

  async getGradingOverview(classroomId) {
    // ── 1. Classroom-level summary ─────────────────────────────────────────
    const [[summary]] = await this.pool.query(
      `SELECT
         c.id                          AS classroom_id,
         c.name                        AS classroom_name,
         c.subject                     AS subject,
         c.section                     AS section,
         c.class_code                  AS class_code,
         c.is_active                   AS is_active,
         (SELECT COUNT(*)
            FROM students
           WHERE classroom_id = c.id)  AS student_count,
         (SELECT COUNT(*)
            FROM tasks
           WHERE classroom_id = c.id
             AND deleted_at IS NULL)   AS task_count,
         (SELECT COUNT(*)
            FROM submissions sub
            JOIN tasks t ON t.id = sub.task_id
           WHERE t.classroom_id = c.id
             AND t.deleted_at IS NULL) AS total_submissions,
         (SELECT COUNT(*)
            FROM submissions sub
            JOIN tasks t ON t.id = sub.task_id
           WHERE t.classroom_id = c.id
             AND t.deleted_at IS NULL
             AND (sub.status = 'analyzed' OR sub.teacher_score IS NOT NULL)
         )                             AS evaluated_count,
         (SELECT COUNT(*)
            FROM submissions sub
            JOIN tasks t ON t.id = sub.task_id
           WHERE t.classroom_id = c.id
             AND t.deleted_at IS NULL
             AND sub.status != 'analyzed'
             AND sub.teacher_score IS NULL
         )                             AS pending_count,
         (SELECT AVG(COALESCE(sub.teacher_score, sub.ai_score))
            FROM submissions sub
            JOIN tasks t ON t.id = sub.task_id
           WHERE t.classroom_id = c.id
             AND t.deleted_at IS NULL
             AND (sub.status = 'analyzed' OR sub.teacher_score IS NOT NULL)
         )                             AS avg_score
       FROM classrooms c
       WHERE c.id = $1`,
      [classroomId]
    );

    // ── 2. Per-task rows ───────────────────────────────────────────────────
    const [tasks] = await this.pool.query(
      `SELECT
         t.id                                          AS task_id,
         t.title,
         t.due_date,
         t.max_score,
         t.is_active,
         t.archived_at,
         (SELECT COUNT(*) FROM students WHERE classroom_id = t.classroom_id)
                                                       AS student_count,
         COUNT(sub.id)                                 AS submitted_count,
         SUM(CASE WHEN (sub.status = 'analyzed' OR sub.teacher_score IS NOT NULL)
                  THEN 1 ELSE 0 END)                  AS evaluated_count,
         SUM(CASE WHEN sub.status != 'analyzed'
                       AND sub.teacher_score IS NULL
                  THEN 1 ELSE 0 END)                  AS pending_count,
         AVG(CASE WHEN (sub.status = 'analyzed' OR sub.teacher_score IS NOT NULL)
                  THEN COALESCE(sub.teacher_score, sub.ai_score)
                  ELSE NULL END)                       AS avg_score
       FROM tasks t
       LEFT JOIN submissions sub ON sub.task_id = t.id
       WHERE t.classroom_id = $1
         AND t.deleted_at IS NULL
       GROUP BY t.id
       ORDER BY t.task_date DESC, t.created_at DESC`,
      [classroomId]
    );

    // ── 3. Per-student rows ────────────────────────────────────────────────
    const [students] = await this.pool.query(
      `SELECT
         s.id                                          AS student_id,
         s.name,
         s.username,
         (SELECT COUNT(*) FROM tasks
           WHERE classroom_id = s.classroom_id
             AND deleted_at IS NULL)                   AS task_count,
         COUNT(sub.id)                                 AS submitted_count,
         SUM(CASE WHEN (sub.status = 'analyzed' OR sub.teacher_score IS NOT NULL)
                  THEN 1 ELSE 0 END)                  AS evaluated_count,
         SUM(CASE WHEN sub.status != 'analyzed'
                       AND sub.teacher_score IS NULL
                  THEN 1 ELSE 0 END)                  AS pending_count,
         AVG(CASE WHEN (sub.status = 'analyzed' OR sub.teacher_score IS NOT NULL)
                  THEN COALESCE(sub.teacher_score, sub.ai_score)
                  ELSE NULL END)                       AS avg_score
       FROM students s
       LEFT JOIN submissions sub ON sub.student_id = s.id
         AND sub.task_id IN (
           SELECT id FROM tasks
            WHERE classroom_id = s.classroom_id
              AND deleted_at IS NULL
         )
       WHERE s.classroom_id = $1
       GROUP BY s.id
       ORDER BY s.name ASC`,
      [classroomId]
    );

    return { summary, tasks, students };
  }

  /**
   * One aggregated query for the whole teacher dashboard.
   */
  async getTeacherDashboardStats(teacherId) {
    const [[row]] = await this.pool.query(
      `SELECT
         (SELECT COUNT(*) FROM classrooms
           WHERE teacher_id = $1 AND deleted_at IS NULL AND is_active = TRUE) AS total_classrooms,
         (SELECT COUNT(DISTINCT s.id)
            FROM students s
            JOIN classrooms c ON c.id = s.classroom_id
           WHERE c.teacher_id = $2 AND c.deleted_at IS NULL) AS total_students,
         (SELECT COUNT(*)
            FROM tasks t
            JOIN classrooms c ON c.id = t.classroom_id
           WHERE c.teacher_id = $3 AND c.deleted_at IS NULL AND t.is_active = TRUE) AS active_assignments,
         (SELECT COUNT(*)
            FROM submissions sub
            JOIN tasks      t ON t.id  = sub.task_id
            JOIN classrooms c ON c.id  = t.classroom_id
           WHERE c.teacher_id    = $4
             AND c.deleted_at   IS NULL
             AND t.deleted_at   IS NULL
             AND sub.teacher_score IS NULL) AS pending_evaluations`,
      [teacherId, teacherId, teacherId, teacherId]
    );
    return {
      totalClassrooms:   Number(row.total_classrooms),
      totalStudents:      Number(row.total_students),
      activeAssignments: Number(row.active_assignments),
      pendingEvaluations: Number(row.pending_evaluations),
    };
  }

  /** Recent activity feed — latest tasks posted + submissions made. */
  async getRecentActivity(teacherId, limit = 10) {
    const [taskRows] = await this.pool.query(
      `SELECT 'task_posted' AS type, t.id, t.title AS label, c.name AS classroom_name,
              t.created_at AS occurred_at
         FROM tasks t
         JOIN classrooms c ON c.id = t.classroom_id
        WHERE c.teacher_id = $1 AND c.deleted_at IS NULL
        ORDER BY t.created_at DESC
        LIMIT $2`,
      [teacherId, limit]
    );
    const [submissionRows] = await this.pool.query(
      `SELECT 'submission_received' AS type, sub.id, t.title AS label, c.name AS classroom_name,
              sub.submitted_at AS occurred_at
         FROM submissions sub
         JOIN tasks t      ON t.id = sub.task_id
         JOIN classrooms c ON c.id = t.classroom_id
        WHERE c.teacher_id = $1 AND c.deleted_at IS NULL
        ORDER BY sub.submitted_at DESC
        LIMIT $2`,
      [teacherId, limit]
    );
    return [...taskRows, ...submissionRows]
      .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
      .slice(0, limit);
  }
}

module.exports = new ClassroomRepository();
