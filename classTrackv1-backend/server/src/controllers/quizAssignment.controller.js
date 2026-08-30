/**
 * server/src/controllers/quizAssignment.controller.js
 *
 * HTTP handlers for the Quiz Assignment API (Sprint 7).
 * Business logic is fully delegated to quizAssignment.service.js — no SQL here.
 *
 * All handlers use asyncHandler for consistent error forwarding.
 */
const { ApiResponse, asyncHandler } = require('../utils/response.util');
const service = require('../services/quizAssignment.service');

// ── Teacher: Quiz CRUD ────────────────────────────────────────────────────────

const createQuiz = asyncHandler(async (req, res) => {
  const data = await service.createQuiz(req.user.id, req.body);
  new ApiResponse(201, 'Quiz assignment created.', { quiz: data }).send(res);
});

const listQuizzes = asyncHandler(async (req, res) => {
  const data = await service.listQuizzes(req.user.id);
  new ApiResponse(200, 'Quiz assignments retrieved.', { quizzes: data }).send(res);
});

const getQuiz = asyncHandler(async (req, res) => {
  const data = await service.getQuiz(Number(req.params.quizId), req.user.id);
  new ApiResponse(200, 'Quiz assignment retrieved.', { quiz: data }).send(res);
});

const updateQuiz = asyncHandler(async (req, res) => {
  const data = await service.updateQuiz(Number(req.params.quizId), req.user.id, req.body);
  new ApiResponse(200, 'Quiz assignment updated.', { quiz: data }).send(res);
});

const publishQuiz = asyncHandler(async (req, res) => {
  const data = await service.publishQuiz(Number(req.params.quizId), req.user.id);
  new ApiResponse(200, 'Quiz assignment published.', { quiz: data }).send(res);
});

const archiveQuiz = asyncHandler(async (req, res) => {
  await service.archiveQuiz(Number(req.params.quizId), req.user.id);
  new ApiResponse(200, 'Quiz assignment archived.').send(res);
});

const deleteQuiz = asyncHandler(async (req, res) => {
  await service.deleteQuiz(Number(req.params.quizId), req.user.id);
  new ApiResponse(200, 'Quiz assignment deleted.').send(res);
});

// ── Teacher: Question management ──────────────────────────────────────────────

const addQuestion = asyncHandler(async (req, res) => {
  const { questionId, marksOverride } = req.body;
  const data = await service.addQuestion(
    Number(req.params.quizId),
    req.user.id,
    Number(questionId),
    marksOverride ?? null
  );
  new ApiResponse(201, 'Question added to quiz.', { quizQuestion: data }).send(res);
});

const batchAddQuestions = asyncHandler(async (req, res) => {
  const { sources, questionIds } = req.body;
  const data = await service.addQuestionsBatch(
    Number(req.params.quizId),
    req.user.id,
    { sources, questionIds }
  );
  new ApiResponse(201, `${data.added} question(s) added to quiz.`, data).send(res);
});

const removeQuestion = asyncHandler(async (req, res) => {
  await service.removeQuestion(
    Number(req.params.quizId),
    req.user.id,
    Number(req.params.questionId)
  );
  new ApiResponse(200, 'Question removed from quiz.').send(res);
});

const reorderQuestions = asyncHandler(async (req, res) => {
  await service.reorderQuestions(
    Number(req.params.quizId),
    req.user.id,
    req.body.questionIds
  );
  new ApiResponse(200, 'Questions reordered.').send(res);
});

// ── Teacher: Results ──────────────────────────────────────────────────────────

const getQuizResults = asyncHandler(async (req, res) => {
  const data = await service.getQuizResults(Number(req.params.quizId), req.user.id);
  new ApiResponse(200, 'Quiz results retrieved.', data).send(res);
});

const getStudentAttemptDetail = asyncHandler(async (req, res) => {
  const quizId       = Number(req.params.quizId);
  const studentId    = Number(req.params.studentId);
  const attemptNumber = Number(req.params.attemptNumber);
  const data = await service.getStudentAttemptDetail(quizId, studentId, attemptNumber, req.user.id);
  new ApiResponse(200, 'Student attempt detail retrieved.', data).send(res);
});

const getQuizResultsPdf = asyncHandler(async (req, res) => {
  const quizId = Number(req.params.quizId);
  const doc = await service.getQuizResultsPdf(quizId, req.user.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="quiz-results-${quizId}.pdf"`
  );
  doc.pipe(res);
});

// ── Student: Quiz access ──────────────────────────────────────────────────────

const listMyQuizzes = asyncHandler(async (req, res) => {
  const data = await service.listMyQuizzes(req.user.id);
  new ApiResponse(200, 'My quizzes retrieved.', { quizzes: data }).send(res);
});

const getMyQuiz = asyncHandler(async (req, res) => {
  const data = await service.getMyQuiz(Number(req.params.quizId), req.user.id);
  new ApiResponse(200, 'Quiz retrieved.', { quiz: data }).send(res);
});

const startQuiz = asyncHandler(async (req, res) => {
  const data = await service.startQuiz(Number(req.params.quizId), req.user.id);
  new ApiResponse(200, 'Quiz attempt started.', { attempt: data }).send(res);
});

const submitQuiz = asyncHandler(async (req, res) => {
  const data = await service.submitQuiz(
    Number(req.params.quizId),
    req.user.id,
    req.body.answers
  );
  new ApiResponse(200, 'Quiz submitted successfully.', data).send(res);
});

const getMyAttempt = asyncHandler(async (req, res) => {
  const data = await service.getMyAttempt(Number(req.params.quizId), req.user.id);
  new ApiResponse(200, 'Attempt retrieved.', data ? { attempt: data } : null).send(res);
});

const listMyAttempts = asyncHandler(async (req, res) => {
  const data = await service.listMyAttempts(Number(req.params.quizId), req.user.id);
  new ApiResponse(200, 'Attempt history retrieved.', { attempts: data }).send(res);
});

module.exports = {
  // Teacher
  createQuiz, listQuizzes, getQuiz, updateQuiz,
  publishQuiz, archiveQuiz, deleteQuiz,
  addQuestion, batchAddQuestions, removeQuestion, reorderQuestions,
  getQuizResults, getStudentAttemptDetail, getQuizResultsPdf,
  // Student
  listMyQuizzes, getMyQuiz, startQuiz, submitQuiz,
  getMyAttempt, listMyAttempts,
};
