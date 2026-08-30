/**
 * server/src/controllers/question.controller.js
 *
 * HTTP handlers for the Question Bank API.
 * Business logic delegated to service layer — no SQL here.
 */
const { ApiResponse, asyncHandler } = require('../utils/response.util');
const questionBankService   = require('../services/questions/questionBank.service');
const questionGenService    = require('../services/questions/questionGeneration.service');

// ── Question Generation (TEACHER ONLY) ────────────────────────────────────────

/**
 * POST /api/v1/questions/generate
 *
 * Teacher generates questions for their official question bank.
 * These go through the full lifecycle: pending_approval → approved → published.
 *
 * Students use POST /api/v1/practice/generate for their own practice questions.
 */
const generateQuestions = asyncHandler(async (req, res) => {
  const { topicId, questionType, difficulty, count } = req.body;
  const user = req.user;
  const requestId = req.id || req.headers['x-request-id'];

  // Teacher: they ARE the owner of the curriculum
  const result = await questionGenService.generateQuestions({
    topicId, questionType, difficulty, count,
    requesterId:     user.id,
    requesterRole:   'teacher',
    ownerTeacherId:  user.id,
    requestId,
  });

  // Surface INSUFFICIENT_CONTEXT as a clear 200 response instead of 500
  if (result.insufficientContext) {
    return new ApiResponse(200, result.message, {
      code:                'INSUFFICIENT_CONTEXT',
      insufficientContext: true,
      generated:           0,
      stored:              0,
      questions:           [],
    }).send(res);
  }

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
 * GET /api/v1/questions/review-queue?status=pending_approval|approved
 * Teacher: list all questions in the review queue (pending_approval + approved).
 * Optional ?status= filter to narrow to one status.
 */
const listReviewQueue = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const data = await questionBankService.listReviewQueue(
    req.user.id,
    status ? { status } : {}
  );
  new ApiResponse(200, 'Review queue retrieved.', { questions: data }).send(res);
});

/**
 * GET /api/v1/questions/pending-approval
 * Teacher: list all questions awaiting approval.
 * @deprecated Prefer GET /questions/review-queue
 */
const listPendingApproval = asyncHandler(async (req, res) => {
  const data = await questionBankService.listPendingApproval(req.user.id);
  new ApiResponse(200, 'Pending questions retrieved.', { questions: data }).send(res);
});

/**
 * GET /api/v1/questions/published
 * Teacher: list all published questions (optionally filtered by ?topicId=).
 */
const listPublishedForTeacher = asyncHandler(async (req, res) => {
  const { topicId } = req.query;
  const data = await questionBankService.listPublishedForTeacher(
    req.user.id,
    topicId ? { topicId: Number(topicId) } : {}
  );
  new ApiResponse(200, 'Published questions retrieved.', { questions: data }).send(res);
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

// ── Quiz Attempts (Student) ───────────────────────────────────────────────────

/**
 * POST /api/v1/questions/:questionId/attempt
 * Student: submit an answer to a published question.
 *
 * Body: { studentAnswer: string }
 */
const submitAttempt = asyncHandler(async (req, res) => {
  const data = await questionBankService.submitAttempt(
    Number(req.params.questionId),
    req.user.id,
    req.body.studentAnswer
  );
  new ApiResponse(201, 'Answer submitted.', data).send(res);
});

/**
 * GET /api/v1/questions/my-attempts
 * Student: list all their attempts (all topics or filtered by ?topicId=).
 */
const listMyAttempts = asyncHandler(async (req, res) => {
  const { topicId } = req.query;
  const opts = topicId ? { topicId: Number(topicId) } : {};
  const data = await questionBankService.listMyAttempts(req.user.id, opts);
  new ApiResponse(200, 'Attempts retrieved.', { attempts: data }).send(res);
});

/**
 * GET /api/v1/questions/:questionId/my-attempt
 * Student: get their single attempt for one question (or null if not attempted).
 */
const getMyAttempt = asyncHandler(async (req, res) => {
  const data = await questionBankService.getMyAttempt(
    Number(req.params.questionId),
    req.user.id
  );
  new ApiResponse(200, 'Attempt retrieved.', data ?? null).send(res);
});

// ── Teacher: result views (Sprint 5) ─────────────────────────────────────────

/**
 * GET /api/v1/questions/topics/:topicId/results
 * Teacher: list all student attempts for every question in a topic.
 */
const listTopicResults = asyncHandler(async (req, res) => {
  const data = await questionBankService.listTopicResults(
    Number(req.params.topicId),
    req.user.id
  );
  new ApiResponse(200, 'Topic results retrieved.', { attempts: data }).send(res);
});

/**
 * GET /api/v1/questions/:questionId/results
 * Teacher: list all student attempts for a single question.
 */
const listQuestionResults = asyncHandler(async (req, res) => {
  const data = await questionBankService.listQuestionResults(
    Number(req.params.questionId),
    req.user.id
  );
  new ApiResponse(200, 'Question results retrieved.', { attempts: data }).send(res);
});

module.exports = {
  generateQuestions,
  listByTopic,
  listReviewQueue,
  listPendingApproval,
  listPublishedForTeacher,
  getQuestion,
  approveQuestion,
  rejectQuestion,
  publishQuestion,
  archiveQuestion,
  listMyQuestions,
  listPublishedForStudent,
  viewPublishedQuestion,
  // Quiz attempts (Sprint 4)
  submitAttempt,
  listMyAttempts,
  getMyAttempt,
  // Teacher result views (Sprint 5)
  listTopicResults,
  listQuestionResults,
};
