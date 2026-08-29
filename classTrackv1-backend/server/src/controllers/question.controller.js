/**
 * server/src/controllers/question.controller.js
 *
 * HTTP handlers for the Question Bank API.
 * Business logic delegated to service layer — no SQL here.
 */
const { ApiResponse, asyncHandler } = require('../utils/response.util');
const questionBankService   = require('../services/questions/questionBank.service');
const questionGenService    = require('../services/questions/questionGeneration.service');

// ── Question Generation ────────────────────────────────────────────────────────

/**
 * POST /api/v1/questions/generate
 *
 * Teachers use their own teacherId as ownerTeacherId.
 * Students use their classroom's teacher as ownerTeacherId (resolved in service).
 */
const generateQuestions = asyncHandler(async (req, res) => {
  const { topicId, questionType, difficulty, count } = req.body;
  const user = req.user;

  // For students, resolve the teacher who owns the topic
  // (enforced in the generation service — ownership is verified there).
  // For teachers, they ARE the owner.
  let ownerTeacherId;
  if (user.role === 'teacher') {
    ownerTeacherId = user.id;
  } else {
    // Student: the ownerTeacherId is resolved inside the generation service
    // via the student's classroom teacher.
    ownerTeacherId = await _resolveTeacherForStudent(user.id);
  }

  const result = await questionGenService.generateQuestions({
    topicId, questionType, difficulty, count,
    requesterId:     user.id,
    requesterRole:   user.role,
    ownerTeacherId,
  });

  new ApiResponse(201, 'Questions generated and stored as pending approval.', result).send(res);
});

// ── Question Bank — Teacher Views ──────────────────────────────────────────────

/**
 * GET /api/v1/questions/topics/:topicId
 * Teacher: list all questions for a topic.
 */
const listByTopic = asyncHandler(async (req, res) => {
  const { topicId } = req.params;
  const { status } = req.query;
  const data = await questionBankService.listByTopic(
    Number(topicId),
    req.user.id,
    status ? { status } : {}
  );
  new ApiResponse(200, 'Questions retrieved.', { questions: data }).send(res);
});

/**
 * GET /api/v1/questions/pending-approval
 * Teacher: list all questions awaiting approval.
 */
const listPendingApproval = asyncHandler(async (req, res) => {
  const data = await questionBankService.listPendingApproval(req.user.id);
  new ApiResponse(200, 'Pending questions retrieved.', { questions: data }).send(res);
});

/**
 * GET /api/v1/questions/:questionId
 * Teacher: get a single question.
 */
const getQuestion = asyncHandler(async (req, res) => {
  const data = await questionBankService.getQuestionForTeacher(
    Number(req.params.questionId),
    req.user.id
  );
  new ApiResponse(200, 'Question retrieved.', data).send(res);
});

// ── Lifecycle Transitions ─────────────────────────────────────────────────────

/**
 * PATCH /api/v1/questions/:questionId/approve
 */
const approveQuestion = asyncHandler(async (req, res) => {
  const data = await questionBankService.approveQuestion(
    Number(req.params.questionId),
    req.user.id
  );
  new ApiResponse(200, 'Question approved.', data).send(res);
});

/**
 * PATCH /api/v1/questions/:questionId/reject
 */
const rejectQuestion = asyncHandler(async (req, res) => {
  const data = await questionBankService.rejectQuestion(
    Number(req.params.questionId),
    req.user.id,
    req.body.reason
  );
  new ApiResponse(200, 'Question rejected.', data).send(res);
});

/**
 * PATCH /api/v1/questions/:questionId/publish
 */
const publishQuestion = asyncHandler(async (req, res) => {
  const data = await questionBankService.publishQuestion(
    Number(req.params.questionId),
    req.user.id
  );
  new ApiResponse(200, 'Question published.', data).send(res);
});

/**
 * PATCH /api/v1/questions/:questionId/archive
 */
const archiveQuestion = asyncHandler(async (req, res) => {
  const data = await questionBankService.archiveQuestion(
    Number(req.params.questionId),
    req.user.id
  );
  new ApiResponse(200, 'Question archived.', data).send(res);
});

// ── Student Views ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/questions/my-questions
 * Student: list all questions the student generated (all statuses).
 * Optional query param: ?topicId=<number>
 */
const listMyQuestions = asyncHandler(async (req, res) => {
  const { topicId } = req.query;
  const opts = topicId ? { topicId: Number(topicId) } : {};
  const data = await questionBankService.listByStudent(req.user.id, opts);
  new ApiResponse(200, 'My questions retrieved.', { questions: data }).send(res);
});

/**
 * GET /api/v1/questions/topics/:topicId/published
 * Student: list published questions for a topic.
 */
const listPublishedForStudent = asyncHandler(async (req, res) => {
  const data = await questionBankService.listPublishedForStudent(
    Number(req.params.topicId),
    req.user.id
  );
  new ApiResponse(200, 'Published questions retrieved.', { questions: data }).send(res);
});

/**
 * GET /api/v1/questions/:questionId/view
 * Student: view a single published question.
 */
const viewPublishedQuestion = asyncHandler(async (req, res) => {
  const data = await questionBankService.getPublishedQuestion(
    Number(req.params.questionId),
    req.user.id
  );
  new ApiResponse(200, 'Question retrieved.', data).send(res);
});

// ── Internal helpers ──────────────────────────────────────────────────────────

const { pool } = require('../database/connection');

async function _resolveTeacherForStudent(studentId) {
  const [rows] = await pool.query(
    `SELECT c.teacher_id FROM classrooms c
     JOIN students s ON s.classroom_id = c.id
     WHERE s.id = $1`,
    [studentId]
  );
  if (!rows || rows.length === 0) {
    const { ApiError } = require('../utils/response.util');
    throw ApiError.forbidden('Cannot resolve teacher for your classroom.');
  }
  return rows[0].teacher_id;
}

module.exports = {
  generateQuestions,
  listByTopic,
  listPendingApproval,
  getQuestion,
  approveQuestion,
  rejectQuestion,
  publishQuestion,
  archiveQuestion,
  listMyQuestions,
  listPublishedForStudent,
  viewPublishedQuestion,
};
