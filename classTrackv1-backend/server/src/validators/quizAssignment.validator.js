/**
 * server/src/validators/quizAssignment.validator.js
 *
 * Joi validators for the Quiz Assignment API (Sprint 7).
 */
const Joi = require('joi');

// ── Create / Update Quiz ──────────────────────────────────────────────────────

const createQuiz = {
  body: Joi.object({
    classroomId:       Joi.number().integer().positive().required(),
    title:             Joi.string().trim().min(1).max(200).required(),
    instructions:      Joi.string().trim().max(2000).optional().allow('', null).default(null),
    timeLimitMinutes:  Joi.number().integer().min(1).max(300).optional().allow(null).default(null),
    dueDate:           Joi.string().isoDate().optional().allow(null).default(null),
    shuffleQuestions:  Joi.boolean().optional().default(false),
    allowRetake:       Joi.boolean().optional().default(false),
  }),
};

const updateQuiz = {
  params: Joi.object({ quizId: Joi.number().integer().positive().required() }),
  body: Joi.object({
    title:             Joi.string().trim().min(1).max(200).optional(),
    instructions:      Joi.string().trim().max(2000).optional().allow('', null),
    timeLimitMinutes:  Joi.number().integer().min(1).max(300).optional().allow(null),
    dueDate:           Joi.string().isoDate().optional().allow(null),
    shuffleQuestions:  Joi.boolean().optional(),
    allowRetake:       Joi.boolean().optional(),
  }).min(1),
};

// ── Param-only validators ─────────────────────────────────────────────────────

const quizIdParam = {
  params: Joi.object({ quizId: Joi.number().integer().positive().required() }),
};

const quizQuestionParam = {
  params: Joi.object({
    quizId:     Joi.number().integer().positive().required(),
    questionId: Joi.number().integer().positive().required(),
  }),
};

// ── Question management ───────────────────────────────────────────────────────

/**
 * POST /teacher/quiz-assignments/:quizId/questions/batch
 *
 * Body must contain EITHER:
 *   sources:     [{ topicId: number, count: number }]  — quick-select
 *   questionIds: number[]                               — manual select
 */
const batchAddQuestions = {
  params: Joi.object({ quizId: Joi.number().integer().positive().required() }),
  body: Joi.object({
    sources: Joi.array()
      .items(
        Joi.object({
          topicId: Joi.number().integer().positive().required(),
          count:   Joi.number().integer().min(1).max(500).required(),
        })
      )
      .min(1)
      .optional(),
    questionIds: Joi.array()
      .items(Joi.number().integer().positive())
      .min(1)
      .optional(),
  }).or('sources', 'questionIds'),
};

const addQuestion = {
  params: Joi.object({ quizId: Joi.number().integer().positive().required() }),
  body: Joi.object({
    questionId:    Joi.number().integer().positive().required(),
    marksOverride: Joi.number().positive().optional().allow(null).default(null),
  }),
};

const reorderQuestions = {
  params: Joi.object({ quizId: Joi.number().integer().positive().required() }),
  body: Joi.object({
    questionIds: Joi.array()
      .items(Joi.number().integer().positive())
      .min(1)
      .required(),
  }),
};

// ── Student: Submit quiz ──────────────────────────────────────────────────────

const submitQuiz = {
  params: Joi.object({ quizId: Joi.number().integer().positive().required() }),
  body: Joi.object({
    answers: Joi.array()
      .items(
        Joi.object({
          questionId:    Joi.number().integer().positive().required(),
          studentAnswer: Joi.string().trim().min(1).max(5000).required(),
        })
      )
      .min(1)
      .required(),
  }),
};

const studentAttemptParam = {
  params: Joi.object({
    quizId:        Joi.number().integer().positive().required(),
    studentId:     Joi.number().integer().positive().required(),
    attemptNumber: Joi.number().integer().positive().required(),
  }),
};

module.exports = {
  createQuiz,
  updateQuiz,
  quizIdParam,
  quizQuestionParam,
  studentAttemptParam,
  addQuestion,
  batchAddQuestions,
  reorderQuestions,
  submitQuiz,
};
