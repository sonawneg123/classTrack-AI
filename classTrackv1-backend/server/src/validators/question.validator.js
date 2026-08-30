/**
 * server/src/validators/question.validator.js
 *
 * Joi validators for the Question Bank API.
 */
const Joi = require('joi');
const { SUPPORTED_TYPES, SUPPORTED_DIFFICULTIES } = require('../services/questions/questionValidation.service');

const config = require('../config');
const MAX_Q = config.questionGeneration.maxQuestionsPerRequest;

const questionIdParam = {
  params: Joi.object({ questionId: Joi.number().integer().positive().required() }),
};

const topicIdParam = {
  params: Joi.object({ topicId: Joi.number().integer().positive().required() }),
};

const generateQuestions = {
  body: Joi.object({
    topicId:      Joi.number().integer().positive().required(),
    questionType: Joi.string().valid(...SUPPORTED_TYPES).required(),
    difficulty:   Joi.string().valid(...SUPPORTED_DIFFICULTIES).optional().default('medium'),
    count:        Joi.number().integer().min(1).max(MAX_Q).optional().default(5),
  }),
};

const listByTopic = {
  params: Joi.object({ topicId: Joi.number().integer().positive().required() }),
  query: Joi.object({
    status: Joi.string()
      .valid('generated','validated','pending_approval','approved','published','rejected','archived','practice')
      .optional(),
  }),
};

const rejectQuestion = {
  params: Joi.object({ questionId: Joi.number().integer().positive().required() }),
  body: Joi.object({
    reason: Joi.string().max(500).optional().allow('', null),
  }),
};

const submitAttempt = {
  params: Joi.object({ questionId: Joi.number().integer().positive().required() }),
  body: Joi.object({
    studentAnswer: Joi.string().min(1).max(5000).required(),
  }),
};

const listMyAttempts = {
  query: Joi.object({
    topicId: Joi.number().integer().positive().optional(),
  }),
};

module.exports = {
  questionIdParam,
  topicIdParam,
  generateQuestions,
  listByTopic,
  rejectQuestion,
  submitAttempt,
  listMyAttempts,
};
