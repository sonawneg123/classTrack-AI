/**
 * server/src/repositories/task.repository.js
 *
 * PostgreSQL-compatible. Parameter placeholders are $1, $2, …
 * MySQL-specific: backticks removed, ? replaced, SET ? replaced,
 * NOW() kept (valid in PG), LOWER() kept (valid in PG).
 */
const BaseRepository = require('./base.repository');

class TaskRepository extends BaseRepository {
  constructor() { super('tasks'); }

  async listByClassroomForTeacher(classroomId) {
    const [rows] = await this.pool.query(
      `SELECT t.*,
              COUNT(DISTINCT sub.id)                                  AS submission_count,
              (SELECT COUNT(*) FROM students WHERE classroom_id = t.classroom_id) AS student_count
       FROM tasks t
       LEFT JOIN submissions sub ON sub.task_id = t.id
       WHERE t.classroom_id = $1 AND t.deleted_at IS NULL
       GROUP BY t.id
       ORDER BY t.task_date DESC, t.created_at DESC`,
      [classroomId]
    );
    return rows;
  }

  async listForStudent(classroomId, studentId) {
    const [rows] = await this.pool.query(
      `SELECT t.id, t.classroom_id, t.title, t.description, t.instructions,
              t.max_score, t.due_date, t.task_date, t.is_active,
              t.ai_evaluation_enabled, t.allowed_file_types,
              t.late_submission_allowed, t.max_file_size_mb,
              sub.id AS submission_id, sub.status AS submission_status,
              sub.ai_score, sub.teacher_score, sub.attempt_number
       FROM tasks t
       LEFT JOIN submissions sub ON sub.task_id = t.id AND sub.student_id = $1
       WHERE t.classroom_id = $2 AND t.is_active = TRUE AND t.deleted_at IS NULL AND t.archived_at IS NULL
       ORDER BY t.task_date DESC, t.created_at DESC`,
      [studentId, classroomId]
    );
    return rows;
  }

  async belongsToTeacher(taskId, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT t.* FROM tasks t
       JOIN classrooms c ON c.id = t.classroom_id
       WHERE t.id = $1 AND c.teacher_id = $2 AND t.deleted_at IS NULL`,
      [taskId, teacherId]
    );
    return rows[0] || null;
  }

  async toggleActive(taskId) {
    return this.toggleBoolById(taskId, 'is_active');
  }

  // ---------------------------------------------------------------------
  // Task management (teacher-scoped CRUD, listing, publish/unpublish)
  // ---------------------------------------------------------------------

  /** Case-insensitive duplicate check within one classroom's (non-deleted)
   *  tasks — same title is considered a duplicate. */
  async existsDuplicateTitle({ classroomId, title, excludeId = null }) {
    const params = [classroomId, title.trim()];
    let sql = `
      SELECT id FROM tasks
      WHERE classroom_id = $1 AND deleted_at IS NULL AND LOWER(title) = LOWER($2)`;
    if (excludeId) {
      sql += ` AND id != $${params.length + 1}`;
      params.push(excludeId);
    }
    const [rows] = await this.pool.query(sql, params);
    return rows.length > 0;
  }

  /**
   * Paginated, searchable, sortable, filterable listing across ALL of a
   * teacher's classrooms.
   */
  async listByTeacherManaged({ teacherId, limit, offset, search, status, classroomId, sortBy, sortDir }) {
    const where = ['t.teacher_id = $1', 't.deleted_at IS NULL'];
    const params = [teacherId];

    if (status === 'published')   where.push('t.is_active = TRUE');
    if (status === 'unpublished') where.push('t.is_active = FALSE');
    if (status === 'archived') {
      where.push('t.archived_at IS NOT NULL');
    } else {
      where.push('t.archived_at IS NULL');
    }
    if (classroomId) {
      params.push(classroomId);
      where.push(`t.classroom_id = $${params.length}`);
    }

    if (search) {
      const like = `%${search}%`;
      params.push(like, like);
      where.push(`(t.title ILIKE $${params.length - 1} OR t.description ILIKE $${params.length})`);
    }

    const sortColumns = {
      title:           't.title',
      createdAt:       't.created_at',
      dueDate:         't.due_date',
      submissionCount: 'submission_count',
    };
    const orderColumn = sortColumns[sortBy] || 't.created_at';
    const orderDir = sortDir === 'asc' ? 'ASC' : 'DESC';
    const whereSql = where.join(' AND ');

    params.push(limit, offset);
    const limitIdx  = params.length - 1;
    const offsetIdx = params.length;

    const [rows] = await this.pool.query(
      `SELECT t.id, t.classroom_id, t.title, t.description, t.instructions, t.max_score,
              t.due_date, t.task_date, t.is_active, t.ai_evaluation_enabled,
              t.allowed_file_types, t.late_submission_allowed, t.max_file_size_mb,
              t.archived_at, t.created_at,
              c.name AS classroom_name,
              COUNT(DISTINCT sub.id) AS submission_count
       FROM tasks t
       JOIN classrooms c ON c.id = t.classroom_id
       LEFT JOIN submissions sub ON sub.task_id = t.id
       WHERE ${whereSql}
       GROUP BY t.id, c.name
       ORDER BY ${orderColumn} ${orderDir}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    // Count query uses params without limit/offset
    const countParams = params.slice(0, params.length - 2);
    const [[{ total }]] = await this.pool.query(
      `SELECT COUNT(DISTINCT t.id) AS total FROM tasks t WHERE ${whereSql}`,
      countParams
    );

    return { rows, total: Number(total) };
  }

  async updateFields(id, data) {
    const keys   = Object.keys(data);
    const values = Object.values(data);
    const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    await this.pool.query(
      `UPDATE tasks SET ${setClauses} WHERE id = $${keys.length + 1}`,
      [...values, id]
    );
  }

  /** Explicit set (not a flip-toggle) — idempotent publish/unpublish. */
  async setPublished(id, published) {
    await this.pool.query('UPDATE tasks SET is_active = $1 WHERE id = $2', [published, id]);
  }

  async softDelete(id) {
    await this.pool.query('UPDATE tasks SET deleted_at = NOW(), is_active = FALSE WHERE id = $1', [id]);
  }

  /** Archive/restore — independent of is_active and deleted_at. */
  async archive(id) {
    await this.pool.query('UPDATE tasks SET archived_at = NOW() WHERE id = $1', [id]);
  }

  async restore(id) {
    await this.pool.query('UPDATE tasks SET archived_at = NULL WHERE id = $1', [id]);
  }
}

module.exports = new TaskRepository();
