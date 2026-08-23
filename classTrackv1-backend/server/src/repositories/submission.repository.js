/**
 * server/src/repositories/submission.repository.js
 */
const BaseRepository = require('./base.repository');

class SubmissionRepository extends BaseRepository {
  constructor() { super('submissions'); }

  async findByTaskAndStudent(taskId, studentId) {
    const [rows] = await this.pool.query(
      'SELECT * FROM submissions WHERE task_id = ? AND student_id = ? LIMIT 1',
      [taskId, studentId]
    );
    return rows[0] || null;
  }

  async listByTask(taskId) {
    const [rows] = await this.pool.query(
      'SELECT * FROM submissions WHERE task_id = ?',
      [taskId]
    );
    return rows;
  }

  async listForClassroom(classroomId) {
    const [rows] = await this.pool.query(
      `SELECT sub.* FROM submissions sub
       JOIN tasks t ON t.id = sub.task_id
       WHERE t.classroom_id = ?`,
      [classroomId]
    );
    return rows;
  }

  async listByStudent(studentId) {
    const [rows] = await this.pool.query(
      `SELECT sub.*, t.title AS task_title, t.max_score
       FROM submissions sub
       JOIN tasks t ON t.id = sub.task_id
       WHERE sub.student_id = ?
       ORDER BY sub.submitted_at DESC`,
      [studentId]
    );
    return rows;
  }

  async create(data) {
    const [result] = await this.pool.query(
      `INSERT INTO submissions (task_id, student_id, file_path, original_filename, file_type, typed_text)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.taskId, data.studentId, data.filePath, data.originalFilename, data.fileType, data.typedText || null]
    );
    return result.insertId;
  }

  async resetForResubmit(id, data) {
    return this.updateById(id, {
      file_path:        data.filePath,
      original_filename: data.originalFilename,
      file_type:        data.fileType,
      typed_text:       data.typedText || null,
      status:           'submitted',
      ai_score:         null,
      ai_summary:       null,
      ai_strengths:     null,
      ai_improvements:  null,
      teacher_score:    null,
      teacher_feedback: null,
      score_overridden_by: null,
      extracted_text:   null,
      attempt_number:   data.attemptNumber,
      submitted_at:     new Date(),
      analyzed_at:      null,
    });
  }

  async markAnalyzing(id) {
    return this.updateById(id, { status: 'analyzing' });
  }

  async markAnalyzed(id, aiResult, extractedText) {
    return this.updateById(id, {
      status:          'analyzed',
      ai_score:        aiResult.score,
      ai_summary:      aiResult.summary,
      ai_strengths:    JSON.stringify(aiResult.strengths),
      ai_improvements: JSON.stringify(aiResult.improvements),
      extracted_text:  extractedText || null,
      analyzed_at:     new Date(),
    });
  }

  async markFailed(id) {
    return this.updateById(id, { status: 'failed' });
  }

  async overrideScore(id, teacherId, teacherScore, teacherFeedback) {
    return this.updateById(id, {
      teacher_score:       teacherScore,
      teacher_feedback:    teacherFeedback || null,
      score_overridden_by: teacherScore !== null ? teacherId : null,
    });
  }

  // --- Version history ---

  async archiveVersion(submission) {
    await this.pool.query(
      `INSERT INTO submission_versions
         (submission_id, attempt_number, file_path, original_filename, file_type,
          typed_text, extracted_text, ai_score, ai_summary, ai_strengths,
          ai_improvements, teacher_score, teacher_feedback)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        submission.id,        submission.attempt_number, submission.file_path,
        submission.original_filename, submission.file_type,  submission.typed_text,
        submission.extracted_text,    submission.ai_score,   submission.ai_summary,
        submission.ai_strengths,      submission.ai_improvements,
        submission.teacher_score,     submission.teacher_feedback,
      ]
    );
  }

  async getVersionHistory(submissionId) {
    const [rows] = await this.pool.query(
      'SELECT * FROM submission_versions WHERE submission_id = ? ORDER BY attempt_number ASC',
      [submissionId]
    );
    return rows;
  }

  async belongsToTeacherClassroom(submissionId, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT sub.*,
              t.id        AS task_id,
              t.title     AS task_title,
              t.description AS task_description,
              t.max_score,
              t.classroom_id,
              s.name      AS student_name,
              s.username  AS student_username
       FROM submissions sub
       JOIN tasks t ON t.id = sub.task_id
       JOIN classrooms c ON c.id = t.classroom_id
       JOIN students s ON s.id = sub.student_id
       WHERE sub.id = ? AND c.teacher_id = ?`,
      [submissionId, teacherId]
    );
    return rows[0] || null;
  }

  /**
   * Returns all pending evaluations for the teacher:
   * every submission across their classrooms where the teacher has not yet
   * assigned a score (teacher_score IS NULL), regardless of AI status.
   *
   *  'submitted'  — student submitted; AI queue not yet started
   *  'analyzing'  — AI evaluation in progress
   *  'analyzed'   — AI is done; teacher review still required  ← KEY FIX
   *  'failed'     — AI failed; teacher must evaluate manually
   *
   * A submission is removed from this list only once the teacher explicitly
   * assigns a score (overrideScore sets teacher_score to a non-NULL value).
   *
   * Ownership is enforced via the JOIN chain: classroom must belong to the
   * requesting teacher and must not be soft-deleted.
   *
   * Returns submissions enriched with task title, max_score, classroom name,
   * student name/username — everything needed for the pending evaluations page.
   */
  async listPendingForTeacher(teacherId) {
    const [rows] = await this.pool.query(
      `SELECT
         sub.id,
         sub.task_id,
         sub.student_id,
         sub.attempt_number,
         sub.file_path,
         sub.original_filename,
         sub.file_type,
         sub.typed_text,
         sub.status,
         sub.ai_score,
         sub.ai_summary,
         sub.teacher_score,
         sub.teacher_feedback,
         sub.submitted_at,
         sub.analyzed_at,
         t.title          AS task_title,
         t.max_score,
         t.classroom_id,
         c.name           AS classroom_name,
         s.name           AS student_name,
         s.username       AS student_username
       FROM submissions sub
       JOIN tasks      t ON t.id  = sub.task_id
       JOIN classrooms c ON c.id  = t.classroom_id
       JOIN students   s ON s.id  = sub.student_id
       WHERE c.teacher_id  = ?
         AND c.deleted_at  IS NULL
         AND t.deleted_at  IS NULL
         AND sub.teacher_score IS NULL
       ORDER BY sub.submitted_at DESC`,
      [teacherId]
    );
    return rows;
  }
}

module.exports = new SubmissionRepository();
