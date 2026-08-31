/**
 * server/src/repositories/practiceSession.repository.js
 *
 * Data access for the practice_sessions table.
 *
 * Sprint 3 Phase 1 — Practice Session + Mastery
 */
const BaseRepository = require('./base.repository');

class PracticeSessionRepository extends BaseRepository {
  constructor() { super('practice_sessions'); }

  /**
   * Create a new practice session in 'active' state.
   *
   * @param {object} params
   * @param {number} params.studentId
   * @param {number} params.topicId
   * @param {string} [params.questionType]
   * @param {string} [params.difficulty]
   * @param {number} [params.questionCount]
   * @returns {Promise<object>}  The created session row
   */
  async create({ studentId, topicId, questionType = null, difficulty = null, questionCount = 0 }) {
    const [rows] = await this.pool.query(
      `INSERT INTO practice_sessions
         (student_id, topic_id, status, question_type, difficulty, question_count,
          started_at, created_at, updated_at)
       VALUES ($1, $2, 'active', $3, $4, $5, NOW(), NOW(), NOW())
       RETURNING *`,
      [studentId, topicId, questionType, difficulty, questionCount]
    );
    return rows[0];
  }

  /**
   * Find a practice session by id, scoped to a student (ownership check).
   * Returns null if not found or not owned by this student — prevents IDOR.
   *
   * @param {number} sessionId
   * @param {number} studentId
   * @returns {Promise<object|null>}
   */
  async findByIdForStudent(sessionId, studentId) {
    const [rows] = await this.pool.query(
      `SELECT * FROM practice_sessions
       WHERE id = $1 AND student_id = $2
       LIMIT 1`,
      [sessionId, studentId]
    );
    return rows[0] || null;
  }

  /**
   * Mark a session as completed.
   * Only transitions active → completed (idempotent-safe via WHERE clause).
   *
   * @param {number} sessionId
   * @param {number} studentId   — ownership guard
   * @returns {Promise<object|null>}  The updated row, or null if not found/wrong state
   */
  async complete(sessionId, studentId) {
    const [rows] = await this.pool.query(
      `UPDATE practice_sessions
       SET status = 'completed',
           completed_at = NOW(),
           updated_at   = NOW()
       WHERE id = $1
         AND student_id = $2
         AND status = 'active'
       RETURNING *`,
      [sessionId, studentId]
    );
    return rows[0] || null;
  }

  /**
   * List all completed sessions for a student on a topic (for mastery calculation).
   * Ordered by most recent first.
   *
   * @param {number} studentId
   * @param {number} topicId
   * @returns {Promise<object[]>}
   */
  async listCompletedByStudentAndTopic(studentId, topicId) {
    const [rows] = await this.pool.query(
      `SELECT * FROM practice_sessions
       WHERE student_id = $1
         AND topic_id   = $2
         AND status     = 'completed'
       ORDER BY completed_at DESC`,
      [studentId, topicId]
    );
    return rows;
  }

  /**
   * Fetch all quiz_attempts for a practice session.
   * Joins question_bank to get correctness and question metadata.
   * Only scoreable (non-null is_correct) attempts count toward mastery.
   *
   * @param {number} sessionId
   * @param {number} studentId  — ownership guard
   * @returns {Promise<object[]>}
   */
  async getSessionAttempts(sessionId, studentId) {
    const [rows] = await this.pool.query(
      `SELECT
         a.id, a.student_id, a.question_id,
         a.student_answer, a.is_correct, a.score,
         a.attempt_count, a.last_attempted_at,
         a.practice_session_id,
         q.question_type, q.difficulty, q.marks,
         q.topic_id
       FROM quiz_attempts a
       JOIN question_bank q ON q.id = a.question_id
       JOIN practice_sessions ps ON ps.id = a.practice_session_id
       WHERE a.practice_session_id = $1
         AND ps.student_id = $2
       ORDER BY a.last_attempted_at ASC`,
      [sessionId, studentId]
    );
    return rows;
  }

  /**
   * Update question_count on an active session.
   * Called after questions are generated so mastery can know how many
   * questions were in the session.
   *
   * @param {number} sessionId
   * @param {number} studentId
   * @param {number} count
   * @returns {Promise<object|null>}
   */
  async updateQuestionCount(sessionId, studentId, count) {
    const [rows] = await this.pool.query(
      `UPDATE practice_sessions
       SET question_count = $1, updated_at = NOW()
       WHERE id = $2 AND student_id = $3 AND status = 'active'
       RETURNING *`,
      [count, sessionId, studentId]
    );
    return rows[0] || null;
  }
}

module.exports = new PracticeSessionRepository();
