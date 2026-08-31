/**
 * server/src/controllers/practiceSession.controller.js
 *
 * HTTP handlers for the Practice Session API (Sprint 3 Phase 1).
 *
 * All endpoints require:
 *   - authenticate (valid JWT)
 *   - authorizeRoles('student')
 *   - practice:session_manage permission
 *
 * Routes (all prefixed by /api/v1/practice):
 *   POST   /sessions               Create a new practice session
 *   GET    /sessions/:sessionId    Get a session (ownership-scoped)
 *   POST   /sessions/:sessionId/complete  Complete a session + trigger mastery
 *   GET    /mastery                List all mastery for this student
 *   GET    /mastery/:topicId       Get mastery for a specific topic
 */

const { ApiResponse, asyncHandler } = require('../utils/response.util');
const sessionService = require('../services/questions/practiceSession.service');
const masteryService = require('../services/questions/masteryUpdate.service');

// ── Practice Sessions ─────────────────────────────────────────────────────────

/**
 * POST /api/v1/practice/sessions
 *
 * Create a new practice session.
 * Called BEFORE the generate call so questions can be linked to the session.
 *
 * Body: { topicId, questionType?, difficulty?, questionCount? }
 */
const createSession = asyncHandler(async (req, res) => {
  const { topicId, questionType, difficulty, questionCount } = req.body;
  const studentId = req.user.id;

  const session = await sessionService.createSession({
    studentId,
    topicId:       Number(topicId),
    questionType:  questionType || null,
    difficulty:    difficulty   || null,
    questionCount: questionCount ? Number(questionCount) : 0,
  });

  new ApiResponse(201, 'Practice session created.', { session }).send(res);
});

/**
 * GET /api/v1/practice/sessions/:sessionId
 *
 * Get a practice session owned by this student.
 */
const getSession = asyncHandler(async (req, res) => {
  const session = await sessionService.getSession(
    Number(req.params.sessionId),
    req.user.id
  );
  new ApiResponse(200, 'Practice session retrieved.', { session }).send(res);
});

/**
 * POST /api/v1/practice/sessions/:sessionId/complete
 *
 * Mark a practice session as completed and trigger mastery update.
 *
 * Returns: { session, mastery }
 *   mastery will be null if the calculation failed (non-fatal).
 */
const completeSession = asyncHandler(async (req, res) => {
  const result = await sessionService.completeSession(
    Number(req.params.sessionId),
    req.user.id
  );
  new ApiResponse(200, 'Practice session completed.', result).send(res);
});

// ── Mastery ───────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/practice/mastery
 *
 * List all mastery records for the authenticated student.
 */
const listMastery = asyncHandler(async (req, res) => {
  const studentId = req.user.id;
  const records = await masteryService.listMastery(studentId, studentId);
  new ApiResponse(200, 'Mastery records retrieved.', { mastery: records }).send(res);
});

/**
 * GET /api/v1/practice/mastery/:topicId
 *
 * Get mastery for a specific topic for this student.
 * Returns null data if no mastery exists yet.
 */
const getTopicMastery = asyncHandler(async (req, res) => {
  const studentId = req.user.id;
  const topicId   = Number(req.params.topicId);
  const mastery   = await masteryService.getMastery(studentId, topicId, studentId);
  new ApiResponse(200, 'Topic mastery retrieved.', { mastery: mastery ?? null }).send(res);
});

module.exports = {
  createSession,
  getSession,
  completeSession,
  listMastery,
  getTopicMastery,
};
