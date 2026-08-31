/**
 * server/src/services/questions/masteryUpdate.service.js
 *
 * Sprint 3 Phase 1 — Mastery calculation and persistence.
 *
 * Calculates topic mastery after a practice session is completed.
 * Uses a transaction + row-level locking (FOR UPDATE) to handle
 * concurrent session completions for the same (student, topic).
 *
 * Mastery algorithm (deterministic, explainable):
 *   sessionAccuracy = correct / total_scoreable  (0 if no scoreable questions)
 *   newScore = α * sessionAccuracy + (1 - α) * previousScore  (EMA)
 *   Cold start (first session): newScore = sessionAccuracy
 *
 * Where α = MASTERY_ALPHA = 0.4
 *
 * The returned mastery object includes the derived current_difficulty
 * (not persisted — computed from mastery_score at read time).
 */

const { ApiError } = require('../../utils/response.util');
const logger       = require('../../utils/logger.util');
const sessionRepo  = require('../../repositories/practiceSession.repository');
const masteryRepo  = require('../../repositories/studentTopicMastery.repository');
const { pool }     = require('../../database/connection');
const { calculateMastery, deriveDifficulty, deriveMasteryLevel } = require('../../utils/scoring.util');

/**
 * Update mastery for a student after completing a practice session.
 *
 * Uses a database transaction with FOR UPDATE to serialise concurrent
 * updates for the same (student, topic).
 *
 * @param {object} params
 * @param {number}     params.sessionId
 * @param {number}     params.studentId
 * @param {number}     params.topicId
 * @param {Date|string} params.sessionCompletedAt
 * @returns {Promise<object>}  The updated mastery row with derived fields
 */
async function updateMastery({ sessionId, studentId, topicId, sessionCompletedAt }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the mastery row for this (student, topic) to prevent concurrent updates.
    // If no row exists yet, lockForUpdate returns null and we create one atomically via upsert.
    await masteryRepo.lockForUpdate(studentId, topicId, client);

    // Fetch the session attempts (ownership already verified by completeSession)
    const attempts = await sessionRepo.getSessionAttempts(sessionId, studentId);

    // Fetch current mastery (outside the FOR UPDATE scope, but protected by lock above)
    const previousMastery = await masteryRepo.findByStudentAndTopic(studentId, topicId);

    // Calculate new mastery values
    const newValues = calculateMastery(attempts, previousMastery, sessionCompletedAt);

    // Persist atomically
    const updated = await masteryRepo.upsertMastery({
      studentId,
      topicId,
      masteryScore:        newValues.mastery_score,
      sessionsCompleted:   newValues.sessions_completed,
      questionsAttempted:  newValues.questions_attempted,
      questionsCorrect:    newValues.questions_correct,
      consecutiveCorrect:  newValues.consecutive_correct,
      consecutiveIncorrect: newValues.consecutive_incorrect,
      lastSessionAt:       newValues.last_session_at,
    }, client);

    await client.query('COMMIT');

    logger.info('[MasteryUpdate] Mastery updated', {
      studentId,
      topicId,
      sessionId,
      masteryScore:      updated.mastery_score,
      sessionsCompleted: updated.sessions_completed,
      questionsAttempted: updated.questions_attempted,
      questionsCorrect:  updated.questions_correct,
    });

    // Return mastery with derived (non-persisted) fields
    return _enrichMastery(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('[MasteryUpdate] Mastery calculation failed', {
      sessionId,
      studentId,
      topicId,
      error: err.message,
      stack: err.stack,
    });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get mastery for a student on a topic.
 * Returns null if no mastery data exists (student has not completed any session).
 *
 * @param {number} studentId
 * @param {number} topicId
 * @param {number} requestingStudentId  — must match studentId (IDOR guard)
 * @returns {Promise<object|null>}
 */
async function getMastery(studentId, topicId, requestingStudentId) {
  if (studentId !== requestingStudentId) {
    throw ApiError.forbidden('You cannot access another student\'s mastery data.');
  }
  const mastery = await masteryRepo.findByStudentAndTopic(studentId, topicId);
  return mastery ? _enrichMastery(mastery) : null;
}

/**
 * List all mastery records for a student.
 *
 * @param {number} studentId
 * @param {number} requestingStudentId  — must match studentId (IDOR guard)
 * @returns {Promise<object[]>}
 */
async function listMastery(studentId, requestingStudentId) {
  if (studentId !== requestingStudentId) {
    throw ApiError.forbidden('You cannot access another student\'s mastery data.');
  }
  const records = await masteryRepo.listByStudent(studentId);
  return records.map(_enrichMastery);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Add derived fields to a mastery row.
 * current_difficulty and mastery_level are NOT persisted — computed at read time.
 *
 * @param {object} mastery
 * @returns {object}
 */
function _enrichMastery(mastery) {
  const score = Number(mastery.mastery_score);
  return {
    ...mastery,
    mastery_score:        score,
    current_difficulty:   deriveDifficulty(score),
    mastery_level:        deriveMasteryLevel(score),
  };
}

module.exports = { updateMastery, getMastery, listMastery };
