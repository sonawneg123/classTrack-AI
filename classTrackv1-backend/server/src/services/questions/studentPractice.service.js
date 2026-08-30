/**
 * server/src/services/questions/studentPractice.service.js
 *
 * Student AI Practice — Sprint 6
 *
 * A completely separate service from questionBank.service.js.
 * Student practice questions are:
 *   1. Generated using the same RAG pipeline as teacher questions.
 *   2. Stored in question_bank with status = 'practice' and created_by_role = 'student'.
 *   3. NOT visible in the teacher's approval queue.
 *   4. NOT part of the teacher's official assignment pool.
 *   5. Immediately answerable by the student who generated them.
 *   6. Attempts persisted in quiz_attempts (same table — different ownership scope).
 *
 * Security:
 *   - Every operation verifies the student owns the practice session.
 *   - Teacher IDs are resolved from the student's classroom (same ownership chain).
 *   - A student cannot see another student's practice questions.
 */

const { ApiError } = require('../../utils/response.util');
const logger        = require('../../utils/logger.util');
const questionRepo  = require('../../repositories/questionBank.repository');
const attemptRepo   = require('../../repositories/quizAttempt.repository');
const { generateQuestions: _generate } = require('./questionGeneration.service');
const { pool }      = require('../../database/connection');

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Get the teacher_id that owns the classroom a student belongs to.
 * Used for RAG retrieval ownership scoping.
 */
async function _getStudentTeacherId(studentId) {
  const [rows] = await pool.query(
    `SELECT c.teacher_id
     FROM classrooms c
     JOIN students   s ON s.classroom_id = c.id
     WHERE s.id = $1`,
    [studentId]
  );
  if (!rows || rows.length === 0) {
    throw ApiError.notFound('Your classroom was not found. Please contact your teacher.');
  }
  return rows[0].teacher_id;
}

// ── Auto-scoring (same logic as questionBank.service.js) ─────────────────────

const AUTO_SCORE_TYPES = ['mcq', 'true_false', 'one_word', 'fill_blank'];

function _autoScore(questionType, correctAnswer, studentAnswer, marks) {
  if (!AUTO_SCORE_TYPES.includes(questionType)) {
    return { isCorrect: null, score: null };
  }
  const isCorrect =
    correctAnswer.trim().toLowerCase() === studentAnswer.trim().toLowerCase();
  return {
    isCorrect,
    score: isCorrect ? Number(marks) : 0,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate student AI practice questions for a topic.
 *
 * Delegates to the existing questionGeneration.service (same RAG pipeline),
 * but overrides:
 *   - requesterRole = 'student'
 *   - createdByRole = 'student'
 *
 * After generation, updates all stored questions to status = 'practice'
 * so they bypass the teacher approval workflow.
 *
 * @param {object} params
 * @param {number}  params.studentId
 * @param {number}  params.topicId
 * @param {string}  params.questionType
 * @param {string}  params.difficulty
 * @param {number}  params.count
 * @returns {Promise<object>}  { generated, stored, questions }
 */
async function generatePracticeQuestions({ studentId, topicId, questionType, difficulty, count, requestId }) {
  const ownerTeacherId = await _getStudentTeacherId(studentId);

  // Delegate to the shared generation service.
  // Pass requestId through for structured RAG observability logs.
  const result = await _generate({
    topicId,
    questionType,
    difficulty,
    count,
    requesterId:   studentId,
    requesterRole: 'student',
    ownerTeacherId,
    requestId,
  });

  // INSUFFICIENT_CONTEXT — return directly without updating status
  // (no questions were stored, so no UPDATE needed).
  if (result.insufficientContext) {
    logger.info('[StudentPractice] Insufficient context for practice generation', {
      studentId, topicId, requestId,
    });
    return result;
  }

  if (result.stored === 0) {
    // Questions were generated but all were duplicates or invalid
    logger.info('[StudentPractice] No new practice questions stored', {
      studentId, topicId, skippedDuplicates: result.skippedDuplicates,
    });
    return result;
  }

  // Update stored questions from 'pending_approval' → 'practice'
  // so they never appear in the teacher's approval queue.
  const questionIds = result.questions.map((q) => q.id);
  await pool.query(
    `UPDATE question_bank
     SET status = 'practice', updated_at = NOW()
     WHERE id = ANY($1::int[])
       AND created_by = $2
       AND created_by_role = 'student'`,
    [questionIds, studentId]
  );

  // Update the returned questions' status field to reflect the change
  const practiceQuestions = result.questions.map((q) => ({
    ...q,
    status: 'practice',
  }));

  logger.info('[StudentPractice] Practice questions generated and marked as practice', {
    studentId, topicId, stored: result.stored,
  });

  return {
    ...result,
    questions: practiceQuestions,
  };
}

/**
 * List all practice questions for a student, optionally filtered by topic.
 * Returns only status = 'practice' questions created by this student.
 *
 * @param {number} studentId
 * @param {object} [opts]
 * @param {number} [opts.topicId]
 */
async function listPracticeQuestions(studentId, opts = {}) {
  return questionRepo.listPracticeByStudent(studentId, opts);
}

/**
 * Get a single practice question owned by a student.
 * Throws 404 if not found or not owned.
 *
 * @param {number} questionId
 * @param {number} studentId
 */
async function getPracticeQuestion(questionId, studentId) {
  const q = await questionRepo.findPracticeByIdForStudent(questionId, studentId);
  if (!q) throw ApiError.notFound('Practice question not found.');
  return q;
}

/**
 * Submit an answer to a student practice question.
 *
 * Business rules:
 *   1. Question must have status = 'practice'.
 *   2. Question must be owned by the student (created_by = studentId).
 *   3. Auto-scores MCQ / true_false / one_word / fill_blank.
 *   4. Upserts the attempt (same quiz_attempts table).
 *
 * @param {number} questionId
 * @param {number} studentId
 * @param {string} studentAnswer
 */
async function submitPracticeAttempt(questionId, studentId, studentAnswer) {
  if (!studentAnswer || !studentAnswer.trim()) {
    throw ApiError.badRequest('Answer cannot be empty.');
  }

  const q = await questionRepo.findPracticeByIdForStudent(questionId, studentId);
  if (!q) throw ApiError.notFound('Practice question not found.');

  const { isCorrect, score } = _autoScore(
    q.question_type,
    q.correct_answer,
    studentAnswer,
    q.marks
  );

  const attempt = await attemptRepo.upsert({
    studentId,
    questionId,
    studentAnswer: studentAnswer.trim(),
    isCorrect,
    score,
  });

  logger.info('[StudentPractice] Attempt recorded', {
    questionId, studentId, isCorrect, score,
    attemptCount: attempt.attempt_count,
  });

  return {
    attemptId:     attempt.id,
    questionId,
    studentAnswer: attempt.student_answer,
    isCorrect,
    score,
    attemptCount:  attempt.attempt_count,
    // Reveal correct answer + explanation immediately (it's practice)
    correctAnswer: q.correct_answer,
    explanation:   q.explanation,
  };
}

/**
 * Get the attempt for a specific practice question by this student.
 * Returns null if not yet attempted.
 */
async function getPracticeAttempt(questionId, studentId) {
  // Verify ownership first
  const q = await questionRepo.findPracticeByIdForStudent(questionId, studentId);
  if (!q) throw ApiError.notFound('Practice question not found.');
  return attemptRepo.findByStudentAndQuestion(studentId, questionId);
}

module.exports = {
  generatePracticeQuestions,
  listPracticeQuestions,
  getPracticeQuestion,
  submitPracticeAttempt,
  getPracticeAttempt,
};
