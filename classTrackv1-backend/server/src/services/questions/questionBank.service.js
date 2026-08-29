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
const questionRepo = require('../../repositories/questionBank.repository');
const topicRepo    = require('../../repositories/topic.repository');
const { pool }     = require('../../database/connection');

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
 * List all questions pending teacher approval.
 */
async function listPendingApproval(teacherId) {
  return questionRepo.listPendingApproval(teacherId);
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
 * Publish a question (approved → published).
 * Only approved questions can be published.
 */
async function publishQuestion(questionId, teacherId) {
  const q = await _requireOwnedQuestion(questionId, teacherId);
  if (q.status !== 'approved') {
    throw ApiError.badRequest(
      `Only "approved" questions can be published. Current: "${q.status}"`
    );
  }
  const updated = await questionRepo.updateStatus(questionId, teacherId, 'published');
  if (!updated) throw ApiError.internal('Failed to publish question.');
  logger.info('[QuestionBank] Question published', { questionId, teacherId });
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

module.exports = {
  // Teacher
  listByTopic,
  listPendingApproval,
  getQuestionForTeacher,
  approveQuestion,
  rejectQuestion,
  publishQuestion,
  archiveQuestion,
  // Student
  listByStudent,
  listPublishedForStudent,
  getPublishedQuestion,
};
