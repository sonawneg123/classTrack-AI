/**
 * server/src/routes/practice.routes.js
 *
 * Student AI Practice API — Sprint 6
 *
 * All routes require:
 *   - authenticate (valid JWT)
 *   - authorizeRoles('student')
 *   - authorizePermissions(PERMISSIONS.QUESTION_PRACTICE_GENERATE)
 *
 * Route map:
 *
 *   POST   /practice/generate                         Generate practice questions
 *   GET    /practice/questions                        List my practice questions
 *   GET    /practice/questions/:questionId            Get single practice question
 *   POST   /practice/questions/:questionId/attempt   Submit an answer
 *   GET    /practice/questions/:questionId/attempt   Get my attempt for a question
 */
const { Router } = require('express');
const rateLimit   = require('express-rate-limit');

const controller  = require('../controllers/studentPractice.controller');
const validator   = require('../validators/question.validator');
const validate    = require('../middleware/validate.middleware');
const { authenticate, authorizeRoles, authorizePermissions } = require('../middleware/auth.middleware');
const { PERMISSIONS } = require('../constants/permissions.constants');

const router = Router();
router.use(authenticate, authorizeRoles('student'));

const CAN_PRACTICE = authorizePermissions(PERMISSIONS.QUESTION_PRACTICE_GENERATE);

// ── Rate limiter for generation endpoint ──────────────────────────────────────
const practiceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,                   // 15 practice generation requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many practice requests. Please slow down.' },
  skip: () => process.env.NODE_ENV === 'test',
});

// ── Generation ────────────────────────────────────────────────────────────────
router.post(
  '/generate',
  practiceLimiter,
  CAN_PRACTICE,
  validate(validator.generateQuestions),
  controller.generatePractice
);

// ── List and single question ──────────────────────────────────────────────────
router.get(
  '/questions',
  CAN_PRACTICE,
  validate(validator.listMyAttempts), // reuse topicId-optional query validator
  controller.listPracticeQuestions
);

router.get(
  '/questions/:questionId',
  CAN_PRACTICE,
  validate(validator.questionIdParam),
  controller.getPracticeQuestion
);

// ── Attempts ──────────────────────────────────────────────────────────────────

// GET must come before POST to avoid route ambiguity on /questions/:id/attempt
router.get(
  '/questions/:questionId/attempt',
  CAN_PRACTICE,
  validate(validator.questionIdParam),
  controller.getPracticeAttempt
);

router.post(
  '/questions/:questionId/attempt',
  CAN_PRACTICE,
  validate(validator.submitAttempt),
  controller.submitPracticeAttempt
);

module.exports = router;
