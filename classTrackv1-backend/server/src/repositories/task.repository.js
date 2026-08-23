/**
 * server/src/repositories/task.repository.js
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
       WHERE t.classroom_id = ? AND t.deleted_at IS NULL
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
       LEFT JOIN submissions sub ON sub.task_id = t.id AND sub.student_id = ?
       WHERE t.classroom_id = ? AND t.is_active = 1 AND t.deleted_at IS NULL AND t.archived_at IS NULL
       ORDER BY t.task_date DESC, t.created_at DESC`,
      [studentId, classroomId]
    );
    return rows;
  }

  async belongsToTeacher(taskId, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT t.* FROM tasks t
       JOIN classrooms c ON c.id = t.classroom_id
       WHERE t.id = ? AND c.teacher_id = ? AND t.deleted_at IS NULL`,
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
      WHERE classroom_id = ? AND deleted_at IS NULL AND LOWER(title) = LOWER(?)`;
    if (excludeId) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }
    const [rows] = await this.pool.query(sql, params);
    return rows.length > 0;
  }

  /**
   * Paginated, searchable, sortable, filterable listing across ALL of a
   * teacher's classrooms (not scoped to one classroom) — one query for
   * the page of rows (with a correlated submission count, no N+1), one
   * query for the total count.
   */
  async listByTeacherManaged({ teacherId, limit, offset, search, status, classroomId, sortBy, sortDir }) {
    const where = ['t.teacher_id = ?', 't.deleted_at IS NULL'];
    const params = [teacherId];

    if (status === 'published')   where.push('t.is_active = 1');
    if (status === 'unpublished') where.push('t.is_active = 0');
    // Archived is a separate, independent state from is_active — hidden
    // from every status view except when explicitly asked for.
    if (status === 'archived') {
      where.push('t.archived_at IS NOT NULL');
    } else {
      where.push('t.archived_at IS NULL');
    }
    if (classroomId) { where.push('t.classroom_id = ?'); params.push(classroomId); }

    if (search) {
      where.push('(t.title LIKE ? OR t.description LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like);
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
       GROUP BY t.id
       ORDER BY ${orderColumn} ${orderDir}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await this.pool.query(
      `SELECT COUNT(DISTINCT t.id) AS total FROM tasks t WHERE ${whereSql}`,
      params
    );

    return { rows, total: Number(total) };
  }

  async updateFields(id, data) {
    await this.pool.query('UPDATE tasks SET ? WHERE id = ?', [data, id]);
  }

  /** Explicit set (not a flip-toggle) — used by the publish/unpublish
   *  endpoints, which must be idempotent, unlike toggleActive above. */
  async setPublished(id, published) {
    await this.pool.query('UPDATE tasks SET is_active = ? WHERE id = ?', [published ? 1 : 0, id]);
  }

  async softDelete(id) {
    await this.pool.query('UPDATE tasks SET deleted_at = NOW(), is_active = 0 WHERE id = ?', [id]);
  }

  /** Archive/restore — independent of is_active (publish) and deleted_at
   *  (soft delete). See the CREATE TABLE comment in database.sql. */
  async archive(id) {
    await this.pool.query('UPDATE tasks SET archived_at = NOW() WHERE id = ?', [id]);
  }

  async restore(id) {
    await this.pool.query('UPDATE tasks SET archived_at = NULL WHERE id = ?', [id]);
  }
}

module.exports = new TaskRepository();
