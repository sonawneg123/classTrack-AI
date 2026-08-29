/**
 * server/src/routes/question.routes.js
 *
 * Question Bank API — Route map:
 *
 *   Generation (teacher + student)
 *     POST   /questions/generate
 *
 *   Teacher views
 *     GET    /questions/topics/:topicId            — all questions for a topic
 *     GET    /questions/pending-approval           — all pending approval
 *     GET    /questions/:questionId                — single question
 *
 *   Teacher lifecycle
 *     PATCH  /questions/:questionId/approve
 *     PATCH  /questions/:questionId/reject
 *     PATCH  /questions/:questionId/publish
 *     PATCH  /questions/:questionId/archive
 *
 *   Student views
 *     GET    /questions/topics/:topicId/published  — published questions for a topic
 *     GET    /questions/:questionId/view           — single published question
 */
const { Router } = require('express');
const rateLimit  = require('express-rate-limit');

const controller = require('../controllers/question.controller');
const validator  = require('../validators/question.validator');
const validate   = require('../middleware/validate.middleware');
const { authenticate, authorizeRoles, authorizePermissions } = require('../middleware/auth.middleware');
const { PERMISSIONS } = require('../constants/permissions.constants');

const router = Router();
router.use(authenticate);

// ── Rate limiter for generation endpoint ──────────────────────────────────────
// Prevents abuse of the LLM endpoint. A reasonable limit per window.
const generateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 generation requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many generation requests. Please slow down.' },
  skip: () => process.env.NODE_ENV === 'test',
});

// ── Permissions shortcuts ──────────────────────────────────────────────────────
const CAN_GENERATE  = authorizePermissions(PERMISSIONS.QUESTION_GENERATE);
const CAN_APPROVE   = authorizePermissions(PERMISSIONS.QUESTION_APPROVE);
const CAN_PUBLISH   = authorizePermissions(PERMISSIONS.QUESTION_PUBLISH);
const CAN_ARCHIVE   = authorizePermissions(PERMISSIONS.QUESTION_ARCHIVE);
const CAN_VIEW_OWN  = authorizePermissions(PERMISSIONS.QUESTION_VIEW_OWN);
const CAN_VIEW_APPROVED = authorizePermissions(PERMISSIONS.QUESTION_VIEW_APPROVED);

// ── Generation ────────────────────────────────────────────────────────────────
router.post(
  '/generate',
  generateLimiter,
  authorizeRoles('teacher', 'student'),
  CAN_GENERATE,
  validate(validator.generateQuestions),
  controller.generateQuestions
);

// ── Student: my generated questions (all statuses) ─────────────────────────────
// Must appear before /:questionId to avoid being swallowed by the param route.
router.get(
  '/my-questions',
  authorizeRoles('student'),
  CAN_VIEW_OWN,
  controller.listMyQuestions
);

// ── Teacher: approval queue ────────────────────────────────────────────────────
router.get(
  '/pending-approval',
  authorizeRoles('teacher'),
  CAN_VIEW_OWN,
  controller.listPendingApproval
);

// ── Teacher: topic-based listing ───────────────────────────────────────────────
router.get(
  '/topics/:topicId',
  authorizeRoles('teacher'),
  CAN_VIEW_OWN,
  validate(validator.listByTopic),
  controller.listByTopic
);

// ── Student: published questions for a topic ───────────────────────────────────
router.get(
  '/topics/:topicId/published',
  authorizeRoles('student'),
  CAN_VIEW_APPROVED,
  controller.listPublishedForStudent
);

// ── Teacher: get single question ───────────────────────────────────────────────
router.get(
  '/:questionId',
  authorizeRoles('teacher'),
  CAN_VIEW_OWN,
  validate(validator.questionIdParam),
  controller.getQuestion
);

// ── Student: view single published question ────────────────────────────────────
router.get(
  '/:questionId/view',
  authorizeRoles('student'),
  CAN_VIEW_APPROVED,
  validate(validator.questionIdParam),
  controller.viewPublishedQuestion
);

// ── Teacher: lifecycle transitions ─────────────────────────────────────────────
router.patch(
  '/:questionId/approve',
  authorizeRoles('teacher'),
  CAN_APPROVE,
  validate(validator.questionIdParam),
  controller.approveQuestion
);

router.patch(
  '/:questionId/reject',
  authorizeRoles('teacher'),
  CAN_APPROVE,
  validate(validator.rejectQuestion),
  controller.rejectQuestion
);

router.patch(
  '/:questionId/publish',
  authorizeRoles('teacher'),
  CAN_PUBLISH,
  validate(validator.questionIdParam),
  controller.publishQuestion
);

router.patch(
  '/:questionId/archive',
  authorizeRoles('teacher'),
  CAN_ARCHIVE,
  validate(validator.questionIdParam),
  controller.archiveQuestion
);

module.exports = router;
