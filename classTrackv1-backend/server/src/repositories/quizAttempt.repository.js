/**
 * server/src/repositories/quizAttempt.repository.js
 *
 * Data access for the quiz_attempts table.
 *
 * One row per (student_id, question_id).
 * Re-attempts upsert the existing row (increment attempt_count, update answer,
 * update is_correct / score, update last_attempted_at).
 */
const BaseRepository = require('./base.repository');

class QuizAttemptRepository extends BaseRepository {
  constructor() { super('quiz_attempts'); }

  /**
   * Upsert a quiz attempt.
   * On conflict (student already attempted this question) the row is updated
   * with the new answer and incremented attempt_count.
   *
   * @param {object} data
   * @param {number}       data.studentId
   * @param {number}       data.questionId
   * @param {string}       data.studentAnswer
   * @param {boolean|null} data.isCorrect   — null for free-text types
   * @param {number|null}  data.score       — null for free-text types
   * @returns {Promise<object>}  The inserted/updated row
   */
  /**
   * Upsert a quiz attempt, optionally linking to a practice session.
   *
   * practice_session_id is nullable for backward compatibility:
   *   - Existing attempts (quiz assignments, standalone) pass no sessionId.
   *   - New practice session attempts pass sessionId.
   *
   * On conflict: updates the attempt row but does NOT change
   * practice_session_id (first session association wins).
   *
   * @param {object} data
   * @param {number}       data.studentId
   * @param {number}       data.questionId
   * @param {string}       data.studentAnswer
   * @param {boolean|null} data.isCorrect
   * @param {number|null}  data.score
   * @param {number|null}  [data.practiceSessionId]  — null for non-session attempts
   * @returns {Promise<object>}  The inserted/updated row
   */
  async upsert({ studentId, questionId, studentAnswer, isCorrect, score, practiceSessionId = null }) {
    const [rows] = await this.pool.query(
      `INSERT INTO quiz_attempts
         (student_id, question_id, student_answer, is_correct, score,
          practice_session_id,
          attempt_count, first_attempted_at, last_attempted_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, NOW(), NOW())
       ON CONFLICT (student_id, question_id) DO UPDATE SET
         student_answer    = EXCLUDED.student_answer,
         is_correct        = EXCLUDED.is_correct,
         score             = EXCLUDED.score,
         attempt_count     = quiz_attempts.attempt_count + 1,
         last_attempted_at = NOW()
       RETURNING id, student_id, question_id, student_answer,
                 is_correct, score, attempt_count,
                 practice_session_id,
                 first_attempted_at, last_attempted_at`,
      [studentId, questionId, studentAnswer, isCorrect, score, practiceSessionId]
    );
    return rows[0];
  }

  /**
   * Find a single attempt by student + question.
   */
  async findByStudentAndQuestion(studentId, questionId) {
    const [rows] = await this.pool.query(
      `SELECT * FROM quiz_attempts
       WHERE student_id = $1 AND question_id = $2
       LIMIT 1`,
      [studentId, questionId]
    );
    return rows[0] || null;
  }

  /**
   * List all attempts by a student, optionally filtered by topic.
   * Joins question_bank to get topic/chapter/subject metadata.
   *
   * @param {number}  studentId
   * @param {number}  [topicId]  — optional filter
   */
  async listByStudent(studentId, topicId = null) {
    const params = [studentId];
    let topicFilter = '';
    if (topicId) {
      params.push(topicId);
      topicFilter = `AND q.topic_id = $${params.length}`;
    }

    const [rows] = await this.pool.query(
      `SELECT
         a.id, a.student_id, a.question_id,
         a.student_answer, a.is_correct, a.score,
         a.attempt_count, a.first_attempted_at, a.last_attempted_at,
         q.question_text, q.question_type, q.difficulty, q.marks,
         q.correct_answer, q.explanation,
         q.topic_id, q.chapter_id, q.subject_id, q.curriculum_id
       FROM quiz_attempts a
       JOIN question_bank q ON q.id = a.question_id
       WHERE a.student_id = $1
         ${topicFilter}
       ORDER BY a.last_attempted_at DESC`,
      params
    );
    return rows;
  }

  /**
   * Count correct/total attempts for a student in a topic.
   * Used for teacher analytics.
   */
  async countByStudentAndTopic(studentId, topicId) {
    const [rows] = await this.pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE a.is_correct = TRUE)  AS correct,
         COUNT(*) FILTER (WHERE a.is_correct = FALSE) AS incorrect,
         COUNT(*) FILTER (WHERE a.is_correct IS NULL) AS unscored
       FROM quiz_attempts a
       JOIN question_bank q ON q.id = a.question_id
       WHERE a.student_id = $1
         AND q.topic_id = $2`,
      [studentId, topicId]
    );
    return rows[0];
  }

  /**
   * List all student attempts for all published questions in a topic.
   * Scoped to a teacher via the curricula ownership chain — prevents
   * cross-teacher IDOR.
   *
   * @param {number} topicId
   * @param {number} teacherId  — must own the curriculum
   * @returns {Promise<object[]>}
   */
  async listByTopicForTeacher(topicId, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT
         a.id, a.student_id, a.question_id,
         a.student_answer, a.is_correct, a.score,
         a.attempt_count, a.first_attempted_at, a.last_attempted_at,
         q.question_text, q.question_type, q.difficulty, q.marks,
         q.correct_answer, q.topic_id,
         s.name   AS student_name,
         s.username AS student_username
       FROM quiz_attempts a
       JOIN question_bank q ON q.id = a.question_id
       JOIN curricula      cu ON cu.id = q.curriculum_id
       JOIN students       s  ON s.id  = a.student_id
       WHERE q.topic_id = $1
         AND cu.teacher_id = $2
         AND cu.deleted_at IS NULL
       ORDER BY a.last_attempted_at DESC`,
      [topicId, teacherId]
    );
    return rows;
  }

  /**
   * List all student attempts for a single question.
   * Scoped to a teacher via the curricula ownership chain.
   *
   * @param {number} questionId
   * @param {number} teacherId  — must own the curriculum
   * @returns {Promise<object[]>}
   */
  async listByQuestionForTeacher(questionId, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT
         a.id, a.student_id, a.question_id,
         a.student_answer, a.is_correct, a.score,
         a.attempt_count, a.first_attempted_at, a.last_attempted_at,
         q.question_text, q.question_type, q.difficulty, q.marks,
         q.correct_answer, q.topic_id,
         s.name   AS student_name,
         s.username AS student_username
       FROM quiz_attempts a
       JOIN question_bank q ON q.id = a.question_id
       JOIN curricula      cu ON cu.id = q.curriculum_id
       JOIN students       s  ON s.id  = a.student_id
       WHERE a.question_id = $1
         AND cu.teacher_id = $2
         AND cu.deleted_at IS NULL
       ORDER BY a.last_attempted_at DESC`,
      [questionId, teacherId]
    );
    return rows;
  }
}

module.exports = new QuizAttemptRepository();
