/**
 * server/src/repositories/classroom.repository.js
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
       WHERE c.teacher_id = ?
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
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const total = await this.count();
    return { rows, total };
  }

  async belongsToTeacher(classroomId, teacherId) {
    const [rows] = await this.pool.query(
      'SELECT * FROM classrooms WHERE id = ? AND teacher_id = ?',
      [classroomId, teacherId]
    );
    return rows[0] || null;
  }

  // ---------------------------------------------------------------------
  // Classroom management (teacher-scoped CRUD, listing, dashboard stats)
  // ---------------------------------------------------------------------

  /** Same as belongsToTeacher, but excludes soft-deleted classrooms —
   *  used by every mutating classroom-management action so a deleted
   *  classroom can never be found/edited/archived/restored again. */
  async findOwnedById(classroomId, teacherId) {
    const [rows] = await this.pool.query(
      'SELECT * FROM classrooms WHERE id = ? AND teacher_id = ? AND deleted_at IS NULL',
      [classroomId, teacherId]
    );
    return rows[0] || null;
  }

  /** Case-insensitive duplicate check within one teacher's own (non-deleted)
   *  classrooms — same name + section is considered a duplicate. */
  async existsDuplicate({ teacherId, name, section, excludeId = null }) {
    const params = [teacherId, name.trim(), (section || '').trim()];
    let sql = `
      SELECT id FROM classrooms
      WHERE teacher_id = ?
        AND deleted_at IS NULL
        AND LOWER(name) = LOWER(?)
        AND LOWER(COALESCE(section, '')) = LOWER(?)`;
    if (excludeId) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }
    const [rows] = await this.pool.query(sql, params);
    return rows.length > 0;
  }

  /**
   * Paginated, searchable, sortable, filterable listing for one teacher's
   * classroom management screen. One query for the page of rows (with
   * aggregated student/task counts + latest activity via LEFT JOINs and
   * a correlated MAX() — no N+1), one query for the total count.
   */
  async listByTeacherManaged({ teacherId, limit, offset, search, status, sortBy, sortDir }) {
    const where = ['c.teacher_id = ?', 'c.deleted_at IS NULL'];
    const params = [teacherId];

    if (status === 'active') where.push('c.is_active = 1');
    if (status === 'archived') where.push('c.is_active = 0');

    if (search) {
      where.push('(c.name LIKE ? OR c.subject LIKE ? OR c.section LIKE ? OR c.class_code LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like, like);
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

    const [rows] = await this.pool.query(
      `SELECT c.id, c.name, c.subject, c.section, c.class_code, c.is_active, c.created_at,
              COUNT(DISTINCT s.id) AS student_count,
              COUNT(DISTINCT t.id) AS task_count,
              GREATEST(
                COALESCE(MAX(sub.submitted_at), '1970-01-01'),
                COALESCE(MAX(t.created_at), '1970-01-01')
              ) AS latest_activity_at
       FROM classrooms c
       LEFT JOIN students s     ON s.classroom_id = c.id
       LEFT JOIN tasks t        ON t.classroom_id = c.id
       LEFT JOIN submissions sub ON sub.task_id = t.id
       WHERE ${whereSql}
       GROUP BY c.id
       ORDER BY ${orderColumn} ${orderDir}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await this.pool.query(
      `SELECT COUNT(DISTINCT c.id) AS total FROM classrooms c WHERE ${whereSql}`,
      params
    );

    return { rows, total: Number(total) };
  }

  async archive(id) {
    await this.pool.query('UPDATE classrooms SET is_active = 0 WHERE id = ?', [id]);
  }

  async restore(id) {
    await this.pool.query('UPDATE classrooms SET is_active = 1 WHERE id = ?', [id]);
  }

  async softDelete(id) {
    await this.pool.query('UPDATE classrooms SET deleted_at = NOW(), is_active = 0 WHERE id = ?', [id]);
  }

  async updateFields(id, data) {
    await this.pool.query('UPDATE classrooms SET ? WHERE id = ?', [data, id]);
  }

  async regenerateCode(id, classCode) {
    await this.pool.query('UPDATE classrooms SET class_code = ? WHERE id = ?', [classCode, id]);
  }

  /**
   * One aggregated query for the whole teacher dashboard — total
   * classrooms, total students, active assignments, pending evaluations.
   * Deliberately a single round trip (subqueries, not N+1 per classroom).
   */
  async getTeacherDashboardStats(teacherId) {
    const [[row]] = await this.pool.query(
      `SELECT
         (SELECT COUNT(*) FROM classrooms
           WHERE teacher_id = ? AND deleted_at IS NULL AND is_active = 1) AS total_classrooms,
         (SELECT COUNT(DISTINCT s.id)
            FROM students s
            JOIN classrooms c ON c.id = s.classroom_id
           WHERE c.teacher_id = ? AND c.deleted_at IS NULL) AS total_students,
         (SELECT COUNT(*)
            FROM tasks t
            JOIN classrooms c ON c.id = t.classroom_id
           WHERE c.teacher_id = ? AND c.deleted_at IS NULL AND t.is_active = 1) AS active_assignments,
         (SELECT COUNT(*)
            FROM submissions sub
            JOIN tasks t      ON t.id = sub.task_id
            JOIN classrooms c ON c.id = t.classroom_id
           WHERE c.teacher_id = ? AND c.deleted_at IS NULL
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

  /** Recent activity feed — latest tasks posted + submissions made across
   *  all of a teacher's classrooms, merged and capped, one query each
   *  (two queries total, not per-classroom). */
  async getRecentActivity(teacherId, limit = 10) {
    const [taskRows] = await this.pool.query(
      `SELECT 'task_posted' AS type, t.id, t.title AS label, c.name AS classroom_name,
              t.created_at AS occurred_at
         FROM tasks t
         JOIN classrooms c ON c.id = t.classroom_id
        WHERE c.teacher_id = ? AND c.deleted_at IS NULL
        ORDER BY t.created_at DESC
        LIMIT ?`,
      [teacherId, limit]
    );
    const [submissionRows] = await this.pool.query(
      `SELECT 'submission_received' AS type, sub.id, t.title AS label, c.name AS classroom_name,
              sub.submitted_at AS occurred_at
         FROM submissions sub
         JOIN tasks t      ON t.id = sub.task_id
         JOIN classrooms c ON c.id = t.classroom_id
        WHERE c.teacher_id = ? AND c.deleted_at IS NULL
        ORDER BY sub.submitted_at DESC
        LIMIT ?`,
      [teacherId, limit]
    );
    return [...taskRows, ...submissionRows]
      .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
      .slice(0, limit);
  }
}

module.exports = new ClassroomRepository();
