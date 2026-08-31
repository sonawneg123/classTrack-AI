/**
 * server/src/services/questions/practiceSession.service.js
 *
 * Sprint 3 Phase 1 — Practice Session lifecycle management.
 *
 * Manages the create → complete lifecycle for practice sessions.
 * Session completion triggers mastery calculation (via masteryUpdate.service).
 *
 * This service wraps the existing studentPractice.service.js flow:
 *   1. createSession()       — creates a session BEFORE generation
 *   2. generatePracticeQuestions() — unchanged (existing service)
 *   3. submitPracticeAttempt() — modified to carry practiceSessionId
 *   4. completeSession()      — marks complete + triggers mastery update
 *
 * Security:
 *   - Every operation verifies the student owns the session.
 *   - A student cannot access another student's session.
 *   - A student cannot practice an unauthorized topic (ownership chain check).
 */

const { ApiError } = require('../../utils/response.util');
const logger       = require('../../utils/logger.util');
const sessionRepo  = require('../../repositories/practiceSession.repository');
const { pool }     = require('../../database/connection');

// Loaded lazily to avoid circular dependency
let _masteryService = null;
function getMasteryService() {
  if (!_masteryService) {
    _masteryService = require('./masteryUpdate.service');
  }
  return _masteryService;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Verify that a topic is accessible to a student via their classroom's teacher.
 * Prevents a student from practicing topics that don't belong to their curriculum.
 *
 * @param {number} studentId
 * @param {number} topicId
 * @throws {ApiError} 404 if the topic is not accessible
 */
async function _verifyTopicAccess(studentId, topicId) {
  const [rows] = await pool.query(
    `SELECT t.id
     FROM topics t
     JOIN chapters ch   ON ch.id  = t.chapter_id
     JOIN subjects  su  ON su.id  = ch.subject_id
     JOIN curricula cu  ON cu.id  = su.curriculum_id
     JOIN classrooms cl ON cl.teacher_id = cu.teacher_id
     JOIN students  s   ON s.classroom_id = cl.id
     WHERE t.id = $1
       AND s.id = $2
       AND t.deleted_at IS NULL
       AND ch.deleted_at IS NULL
       AND su.deleted_at IS NULL
       AND cu.deleted_at IS NULL`,
    [topicId, studentId]
  );
  if (!rows || rows.length === 0) {
    throw ApiError.forbidden('You do not have access to this topic.');
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a new practice session for a student.
 *
 * Called when the student clicks "Generate Practice".
 * Verifies topic access before creating the session.
 *
 * @param {object} params
 * @param {number} params.studentId
 * @param {number} params.topicId
 * @param {string} [params.questionType]
 * @param {string} [params.difficulty]
 * @param {number} [params.questionCount]
 * @returns {Promise<object>}  The created session
 */
async function createSession({ studentId, topicId, questionType, difficulty, questionCount = 0 }) {
  await _verifyTopicAccess(studentId, topicId);

  const session = await sessionRepo.create({
    studentId,
    topicId,
    questionType:  questionType  || null,
    difficulty:    difficulty    || null,
    questionCount: questionCount || 0,
  });

  logger.info('[PracticeSession] Session created', {
    sessionId:  session.id,
    studentId,
    topicId,
    questionType,
    difficulty,
    questionCount,
  });

  return session;
}

/**
 * Get a practice session by id, scoped to the requesting student.
 * Returns the session with a derived current_difficulty field.
 *
 * @param {number} sessionId
 * @param {number} studentId
 * @returns {Promise<object>}
 * @throws {ApiError} 404 if not found or not owned
 */
async function getSession(sessionId, studentId) {
  const session = await sessionRepo.findByIdForStudent(sessionId, studentId);
  if (!session) {
    throw ApiError.notFound('Practice session not found.');
  }
  return session;
}

/**
 * Complete a practice session and trigger mastery update.
 *
 * Business rules:
 *   1. Session must exist and be owned by this student.
 *   2. Session must be in 'active' state (not already completed).
 *   3. After completing, mastery is calculated from session attempts.
 *   4. Mastery update failures are logged but do NOT fail the completion.
 *
 * @param {number} sessionId
 * @param {number} studentId
 * @returns {Promise<object>}  { session, mastery }
 * @throws {ApiError} 404 if session not found or not owned
 * @throws {ApiError} 409 if session is already completed
 */
async function completeSession(sessionId, studentId) {
  // Ownership check
  const existing = await sessionRepo.findByIdForStudent(sessionId, studentId);
  if (!existing) {
    throw ApiError.notFound('Practice session not found.');
  }

  if (existing.status === 'completed') {
    throw ApiError.conflict('This practice session is already completed.');
  }

  // Mark completed
  const session = await sessionRepo.complete(sessionId, studentId);
  if (!session) {
    // Race condition: was completed between our read and the update
    throw ApiError.conflict('This practice session is already completed.');
  }

  logger.info('[PracticeSession] Session completed', {
    sessionId,
    studentId,
    topicId: session.topic_id,
  });

  // Trigger mastery update (best-effort — does not fail session completion)
  let mastery = null;
  try {
    mastery = await getMasteryService().updateMastery({
      sessionId,
      studentId,
      topicId: session.topic_id,
      sessionCompletedAt: session.completed_at,
    });
  } catch (masteryErr) {
    logger.error('[PracticeSession] Mastery update failed after session completion', {
      sessionId,
      studentId,
      topicId: session.topic_id,
      error: masteryErr.message,
    });
    // mastery stays null — client shows session complete without mastery data
  }

  return { session, mastery };
}

/**
 * Update the question count on an active session after generation.
 * Called by the controller after successful question generation.
 *
 * @param {number} sessionId
 * @param {number} studentId
 * @param {number} count
 * @returns {Promise<object|null>}
 */
async function updateSessionQuestionCount(sessionId, studentId, count) {
  return sessionRepo.updateQuestionCount(sessionId, studentId, count);
}

module.exports = {
  createSession,
  getSession,
  completeSession,
  updateSessionQuestionCount,
};
