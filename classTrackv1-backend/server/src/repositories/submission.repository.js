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
      `SELECT sub.*, t.max_score FROM submissions sub
       JOIN tasks t ON t.id = sub.task_id
       JOIN classrooms c ON c.id = t.classroom_id
       WHERE sub.id = ? AND c.teacher_id = ?`,
      [submissionId, teacherId]
    );
    return rows[0] || null;
  }
}

module.exports = new SubmissionRepository();
