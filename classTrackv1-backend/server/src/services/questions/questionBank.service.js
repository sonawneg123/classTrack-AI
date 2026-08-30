/**
 * server/src/services/questions/questionBank.service.js
 *
 * Business logic for question bank lifecycle management.
 *
 * Lifecycle: pending_approval → approved → published
 *                              ↘ rejected
 *                                       → archived
 *
 * Ownership enforcement:
 *   - All teacher-facing operations verify the question belongs to the
 *     teacher's curriculum chain before executing.
 *   - Students can only view published questions in a curriculum owned
 *     by their classroom teacher.
 */
const { ApiError } = require('../../utils/response.util');
const logger = require('../../utils/logger.util');
const questionRepo  = require('../../repositories/questionBank.repository');
const attemptRepo   = require('../../repositories/quizAttempt.repository');
const topicRepo     = require('../../repositories/topic.repository');
const { pool }      = require('../../database/connection');

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Verify a question exists and belongs to the teacher.
 * Returns the question row.
 */
async function _requireOwnedQuestion(questionId, teacherId) {
  const q = await questionRepo.findByIdForTeacher(questionId, teacherId);
  if (!q) throw ApiError.notFound('Question not found.');
  return q;
}

/**
 * Get the teacher_id that owns the classroom a student belongs to.
 */
async function _getStudentTeacherId(studentId) {
  const [rows] = await pool.query(
    `SELECT c.teacher_id
     FROM classrooms c
     JOIN students   s ON s.classroom_id = c.id
     WHERE s.id = $1`,
    [studentId]
  );
  if (!rows || rows.length === 0) throw ApiError.notFound('Student classroom not found.');
  return rows[0].teacher_id;
}

// ── Teacher operations ────────────────────────────────────────────────────────

/**
 * List all questions for a topic (teacher view — all statuses).
 */
async function listByTopic(topicId, teacherId, opts = {}) {
  // Verify the teacher owns the topic
  const topic = await topicRepo.findOwnedById(topicId, teacherId);
  if (!topic) throw ApiError.notFound('Topic not found.');
  return questionRepo.listByTopic(topicId, teacherId, opts);
}

/**
 * List questions in the review queue (pending_approval + approved).
 * Optionally filter by a single status.
 */
async function listReviewQueue(teacherId, opts = {}) {
  return questionRepo.listReviewQueue(teacherId, opts);
}

/**
 * List all questions pending teacher approval.
 * @deprecated Use listReviewQueue instead.
 */
async function listPendingApproval(teacherId) {
  return questionRepo.listReviewQueue(teacherId, { status: 'pending_approval' });
}

/**
 * List all published questions for a teacher (across all topics or filtered).
 */
async function listPublishedForTeacher(teacherId, opts = {}) {
  return questionRepo.listPublishedForTeacher(teacherId, opts);
}

/**
 * Get a single question (teacher).
 */
async function getQuestionForTeacher(questionId, teacherId) {
  return _requireOwnedQuestion(questionId, teacherId);
}

/**
 * Approve a question (pending_approval → approved).
 * Only a teacher who owns the curriculum may approve.
 */
async function approveQuestion(questionId, teacherId) {
  const q = await _requireOwnedQuestion(questionId, teacherId);
  if (q.status !== 'pending_approval') {
    throw ApiError.badRequest(
      `Only questions in "pending_approval" status can be approved. Current: "${q.status}"`
    );
  }
  const updated = await questionRepo.updateStatus(questionId, teacherId, 'approved', {
    approvedBy: teacherId,
    approvedAt: new Date().toISOString(),
  });
  if (!updated) throw ApiError.internal('Failed to approve question.');
  logger.info('[QuestionBank] Question approved', { questionId, teacherId });
  return updated;
}

/**
 * Reject a question (pending_approval → rejected).
 */
async function rejectQuestion(questionId, teacherId, reason) {
  const q = await _requireOwnedQuestion(questionId, teacherId);
  if (!['pending_approval', 'approved'].includes(q.status)) {
    throw ApiError.badRequest(
      `Only "pending_approval" or "approved" questions can be rejected. Current: "${q.status}"`
    );
  }
  const updated = await questionRepo.updateStatus(questionId, teacherId, 'rejected', {
    rejectedReason: reason || null,
  });
  if (!updated) throw ApiError.internal('Failed to reject question.');
  logger.info('[QuestionBank] Question rejected', { questionId, teacherId, reason });
  return updated;
}

/**
 * Publish a question.
 * Allowed transitions:
 *   pending_approval → published  (teacher directly publishes without separate approve step)
 *   approved         → published  (teacher previously approved, now publishes)
 *
 * Only these two statuses can be published.
 * Practice, generated, rejected, archived questions cannot be published.
 */
async function publishQuestion(questionId, teacherId) {
  const q = await _requireOwnedQuestion(questionId, teacherId);
  const publishableStatuses = ['pending_approval', 'approved'];
  if (!publishableStatuses.includes(q.status)) {
    throw ApiError.badRequest(
      `Only "pending_approval" or "approved" questions can be published. Current: "${q.status}"`
    );
  }
  // When publishing directly from pending_approval, set approved_by = teacher
  const extra = q.status === 'pending_approval'
    ? { approvedBy: teacherId, approvedAt: new Date().toISOString() }
    : {};
  const updated = await questionRepo.updateStatus(questionId, teacherId, 'published', extra);
  if (!updated) throw ApiError.internal('Failed to publish question.');
  logger.info('[QuestionBank] Question published', { questionId, teacherId, fromStatus: q.status });
  return updated;
}

/**
 * Archive a question.
 * Any non-archived question may be archived.
 */
async function archiveQuestion(questionId, teacherId) {
  const q = await _requireOwnedQuestion(questionId, teacherId);
  if (q.status === 'archived') {
    throw ApiError.badRequest('Question is already archived.');
  }
  const updated = await questionRepo.updateStatus(questionId, teacherId, 'archived');
  if (!updated) throw ApiError.internal('Failed to archive question.');
  logger.info('[QuestionBank] Question archived', { questionId, teacherId });
  return updated;
}

// ── Student operations ────────────────────────────────────────────────────────

/**
 * List all questions created by a student (all statuses) — "my questions" view.
 * Optionally filtered to a single topic.
 *
 * @param {number} studentId
 * @param {object} [opts]
 * @param {number} [opts.topicId]  — optional topic filter
 */
async function listByStudent(studentId, opts = {}) {
  const teacherId = await _getStudentTeacherId(studentId);
  return questionRepo.listByStudent(studentId, teacherId, opts);
}

/**
 * List published questions for a topic accessible to a student.
 * Resolves the teacher who owns the curriculum from the student's classroom.
 */
async function listPublishedForStudent(topicId, studentId) {
  const teacherId = await _getStudentTeacherId(studentId);
  return questionRepo.listPublishedForStudent(topicId, teacherId);
}

/**
 * Get a single published question accessible to a student.
 */
async function getPublishedQuestion(questionId, studentId) {
  const teacherId = await _getStudentTeacherId(studentId);
  const q = await questionRepo.findPublishedById(questionId, teacherId);
  if (!q) throw ApiError.notFound('Question not found.');
  return q;
}

// ── Quiz Attempt (Student) ───────────────────────────────────────────────────

/**
 * Auto-score question types that support exact-match comparison.
 * Returns { isCorrect: boolean|null, score: number|null }
 *   - isCorrect is null for free-text types that cannot be auto-scored.
 *   - score mirrors question.marks when correct, 0 when wrong, null for free-text.
 */
function _autoScore(questionType, correctAnswer, studentAnswer, marks) {
  const AUTO_SCORE_TYPES = ['mcq', 'true_false', 'one_word', 'fill_blank'];
  if (!AUTO_SCORE_TYPES.includes(questionType)) {
    // Free-text: cannot auto-score — teacher/AI review needed in a future sprint.
    return { isCorrect: null, score: null };
  }
  const isCorrect =
    correctAnswer.trim().toLowerCase() === studentAnswer.trim().toLowerCase();
  return {
    isCorrect,
    score: isCorrect ? Number(marks) : 0,
  };
}

/**
 * Submit (or re-submit) an answer to a published question.
 *
 * Business rules:
 *   1. Question must be published.
 *   2. Question must be in the curriculum owned by the student's classroom teacher.
 *   3. studentAnswer must be non-empty.
 *   4. Upsert: if the student already attempted this question the row is
 *      updated in place (attempt_count incremented).
 *
 * @param {number} questionId
 * @param {number} studentId
 * @param {string} studentAnswer
 * @returns {Promise<object>} Attempt result with auto-score + question feedback
 */
async function submitAttempt(questionId, studentId, studentAnswer) {
  if (!studentAnswer || !studentAnswer.trim()) {
    throw ApiError.badRequest('Answer cannot be empty.');
  }

  // Resolve the teacher who owns the student's classroom (for ownership chain)
  const teacherId = await _getStudentTeacherId(studentId);

  // Verify the question is published and accessible to this student
  const q = await questionRepo.findPublishedById(questionId, teacherId);
  if (!q) throw ApiError.notFound('Question not found or not yet published.');

  // Auto-score
  const { isCorrect, score } = _autoScore(
    q.question_type,
    q.correct_answer,
    studentAnswer,
    q.marks
  );

  // Upsert attempt record
  const attempt = await attemptRepo.upsert({
    studentId,
    questionId,
    studentAnswer: studentAnswer.trim(),
    isCorrect,
    score,
  });

  logger.info('[QuizAttempt] Attempt recorded', {
    questionId, studentId,
    isCorrect, score,
    attemptCount: attempt.attempt_count,
  });

  return {
    attemptId:      attempt.id,
    questionId,
    studentAnswer:  attempt.student_answer,
    isCorrect,
    score,
    attemptCount:   attempt.attempt_count,
    // Reveal the correct answer and explanation after submitting
    correctAnswer:  q.correct_answer,
    explanation:    q.explanation,
  };
}

/**
 * List all quiz attempts by a student, optionally filtered by topic.
 * Each result includes the question text + type for display purposes.
 *
 * @param {number} studentId
 * @param {object} [opts]
 * @param {number} [opts.topicId]
 */
async function listMyAttempts(studentId, opts = {}) {
  return attemptRepo.listByStudent(studentId, opts.topicId || null);
}

/**
 * Get a single quiz attempt for a student + question.
 * Returns null if the student has not yet attempted this question.
 */
async function getMyAttempt(questionId, studentId) {
  return attemptRepo.findByStudentAndQuestion(studentId, questionId);
}

// ── Teacher Result Views (Sprint 5) ─────────────────────────────────────────

/**
 * List all student attempts for every question in a topic.
 * Teacher must own the topic's curriculum.
 *
 * @param {number} topicId
 * @param {number} teacherId
 * @returns {Promise<object[]>}
 */
async function listTopicResults(topicId, teacherId) {
  const topic = await topicRepo.findOwnedById(topicId, teacherId);
  if (!topic) throw ApiError.notFound('Topic not found.');
  return attemptRepo.listByTopicForTeacher(topicId, teacherId);
}

/**
 * List all student attempts for a single question.
 * Teacher must own the question's curriculum.
 *
 * @param {number} questionId
 * @param {number} teacherId
 * @returns {Promise<object[]>}
 */
async function listQuestionResults(questionId, teacherId) {
  await _requireOwnedQuestion(questionId, teacherId);
  return attemptRepo.listByQuestionForTeacher(questionId, teacherId);
}

module.exports = {
  // Teacher — question bank management
  listByTopic,
  listReviewQueue,
  listPendingApproval,
  listPublishedForTeacher,
  getQuestionForTeacher,
  approveQuestion,
  rejectQuestion,
  publishQuestion,
  archiveQuestion,
  // Teacher — result views (Sprint 5)
  listTopicResults,
  listQuestionResults,
  // Student — question browsing
  listByStudent,
  listPublishedForStudent,
  getPublishedQuestion,
  // Student — quiz attempts (Sprint 4)
  submitAttempt,
  listMyAttempts,
  getMyAttempt,
};
