/**
 * server/src/repositories/studentTopicMastery.repository.js
 *
 * Data access for the student_topic_mastery table.
 *
 * Sprint 3 Phase 1 — Practice Session + Mastery
 *
 * Concurrency safety:
 *   updateMastery() uses INSERT ... ON CONFLICT DO UPDATE which is an atomic
 *   upsert in PostgreSQL (no separate SELECT + INSERT).  The calling service
 *   acquires a transaction-level FOR UPDATE lock on the row before calling
 *   this method, ensuring concurrent session completions for the same
 *   (student, topic) are serialised correctly.
 */
const BaseRepository = require('./base.repository');

class StudentTopicMasteryRepository extends BaseRepository {
  constructor() { super('student_topic_mastery'); }

  /**
   * Find a mastery record for a student + topic.
   * Returns null if no mastery data exists yet.
   *
   * @param {number} studentId
   * @param {number} topicId
   * @returns {Promise<object|null>}
   */
  async findByStudentAndTopic(studentId, topicId) {
    const [rows] = await this.pool.query(
      `SELECT * FROM student_topic_mastery
       WHERE student_id = $1 AND topic_id = $2
       LIMIT 1`,
      [studentId, topicId]
    );
    return rows[0] || null;
  }

  /**
   * Atomically upsert mastery for a (student, topic) pair.
   *
   * On first insert: creates the row with the provided values.
   * On conflict (row exists): updates the row with the new values.
   *
   * This is the ONLY write path to student_topic_mastery — all mastery
   * writes go through here, ensuring the UNIQUE constraint is always
   * respected and no duplicates can be created.
   *
   * @param {object} data
   * @param {number} data.studentId
   * @param {number} data.topicId
   * @param {number} data.masteryScore           0.0 – 1.0
   * @param {number} data.sessionsCompleted
   * @param {number} data.questionsAttempted
   * @param {number} data.questionsCorrect
   * @param {number} data.consecutiveCorrect
   * @param {number} data.consecutiveIncorrect
   * @param {string|Date} data.lastSessionAt
   * @param {object} [client]  Optional pg transaction client
   * @returns {Promise<object>}  The upserted row
   */
  async upsertMastery({
    studentId,
    topicId,
    masteryScore,
    sessionsCompleted,
    questionsAttempted,
    questionsCorrect,
    consecutiveCorrect,
    consecutiveIncorrect,
    lastSessionAt,
  }, client) {
    const executor = client || this.pool;
    const [rows] = await executor.query(
      `INSERT INTO student_topic_mastery
         (student_id, topic_id,
          mastery_score, sessions_completed,
          questions_attempted, questions_correct,
          consecutive_correct, consecutive_incorrect,
          last_session_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       ON CONFLICT (student_id, topic_id) DO UPDATE SET
         mastery_score         = EXCLUDED.mastery_score,
         sessions_completed    = EXCLUDED.sessions_completed,
         questions_attempted   = EXCLUDED.questions_attempted,
         questions_correct     = EXCLUDED.questions_correct,
         consecutive_correct   = EXCLUDED.consecutive_correct,
         consecutive_incorrect = EXCLUDED.consecutive_incorrect,
         last_session_at       = EXCLUDED.last_session_at,
         updated_at            = NOW()
       RETURNING *`,
      [
        studentId, topicId,
        masteryScore, sessionsCompleted,
        questionsAttempted, questionsCorrect,
        consecutiveCorrect, consecutiveIncorrect,
        lastSessionAt,
      ]
    );
    return rows[0];
  }

  /**
   * Lock and fetch a mastery row for update within a transaction.
   * Returns null if no row exists yet (first session for this topic).
   *
   * @param {number} studentId
   * @param {number} topicId
   * @param {object} client  pg transaction client
   * @returns {Promise<object|null>}
   */
  async lockForUpdate(studentId, topicId, client) {
    const [rows] = await client.query(
      `SELECT * FROM student_topic_mastery
       WHERE student_id = $1 AND topic_id = $2
       FOR UPDATE`,
      [studentId, topicId]
    );
    return rows[0] || null;
  }

  /**
   * List all mastery records for a student (for display).
   * Ordered by mastery_score descending (best mastery first).
   *
   * @param {number} studentId
   * @returns {Promise<object[]>}
   */
  async listByStudent(studentId) {
    const [rows] = await this.pool.query(
      `SELECT stm.*, t.name AS topic_name
       FROM student_topic_mastery stm
       JOIN topics t ON t.id = stm.topic_id
       WHERE stm.student_id = $1
       ORDER BY stm.mastery_score DESC, stm.last_session_at DESC`,
      [studentId]
    );
    return rows;
  }
}

module.exports = new StudentTopicMasteryRepository();
