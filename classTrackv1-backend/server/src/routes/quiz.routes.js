/**
 * server/src/routes/quiz.routes.js
 *
 * Quiz Assignment routes — Sprint 7.
 *
 * Mounts two route groups:
 *   /api/v1/teacher/quiz-assignments  — teacher CRUD + builder
 *   /api/v1/student/quiz-assignments  — student quiz taking
 *
 * Both groups are mounted directly on the v1 router via:
 *   router.use('/', quizRoutes);
 *
 * Route map:
 *
 *   Teacher:
 *     POST   /teacher/quiz-assignments                         create quiz
 *     GET    /teacher/quiz-assignments                         list all quizzes
 *     GET    /teacher/quiz-assignments/:quizId                 get quiz + questions
 *     PATCH  /teacher/quiz-assignments/:quizId                 update draft
 *     DELETE /teacher/quiz-assignments/:quizId                 soft delete
 *     PATCH  /teacher/quiz-assignments/:quizId/publish         publish
 *     PATCH  /teacher/quiz-assignments/:quizId/archive         archive
 *     POST   /teacher/quiz-assignments/:quizId/questions       add question (single)
 *     POST   /teacher/quiz-assignments/:quizId/questions/batch add questions (batch)
 *     DELETE /teacher/quiz-assignments/:quizId/questions/:qId  remove question
 *     PUT    /teacher/quiz-assignments/:quizId/questions/order reorder
 *     GET    /teacher/quiz-assignments/:quizId/results         get results
 *
 *   Student:
 *     GET    /student/quiz-assignments                         list assigned quizzes
 *     GET    /student/quiz-assignments/:quizId                 get quiz detail
 *     POST   /student/quiz-assignments/:quizId/start          start attempt
 *     POST   /student/quiz-assignments/:quizId/submit         submit answers
 *     GET    /student/quiz-assignments/:quizId/attempt         get latest attempt
 *     GET    /student/quiz-assignments/:quizId/attempts        list all attempts
 */
const { Router } = require('express');
const { authenticate, authorizeRoles, authorizePermissions } = require('../middleware/auth.middleware');
const validate    = require('../middleware/validate.middleware');
const controller  = require('../controllers/quizAssignment.controller');
const v           = require('../validators/quizAssignment.validator');
const { PERMISSIONS } = require('../constants/permissions.constants');

const router = Router();

// ── Teacher routes ────────────────────────────────────────────────────────────
const teacherRouter = Router();
teacherRouter.use(authenticate, authorizeRoles('teacher'));

const CAN_CREATE  = authorizePermissions(PERMISSIONS.QUIZ_CREATE);
const CAN_MANAGE  = authorizePermissions(PERMISSIONS.QUIZ_MANAGE_OWN);

teacherRouter.post(
  '/',
  CAN_CREATE,
  validate(v.createQuiz),
  controller.createQuiz
);

teacherRouter.get(
  '/',
  CAN_MANAGE,
  controller.listQuizzes
);

teacherRouter.get(
  '/:quizId',
  CAN_MANAGE,
  validate(v.quizIdParam),
  controller.getQuiz
);

teacherRouter.patch(
  '/:quizId',
  CAN_MANAGE,
  validate(v.updateQuiz),
  controller.updateQuiz
);

teacherRouter.delete(
  '/:quizId',
  CAN_MANAGE,
  validate(v.quizIdParam),
  controller.deleteQuiz
);

teacherRouter.patch(
  '/:quizId/publish',
  CAN_MANAGE,
  validate(v.quizIdParam),
  controller.publishQuiz
);

teacherRouter.patch(
  '/:quizId/archive',
  CAN_MANAGE,
  validate(v.quizIdParam),
  controller.archiveQuiz
);

// NOTE: /order and /batch must come before /:questionId to avoid param collision
teacherRouter.put(
  '/:quizId/questions/order',
  CAN_MANAGE,
  validate(v.reorderQuestions),
  controller.reorderQuestions
);

// Batch add: POST /teacher/quiz-assignments/:quizId/questions/batch
// Supports quick-select (sources) and manual-select (questionIds) modes.
teacherRouter.post(
  '/:quizId/questions/batch',
  CAN_MANAGE,
  validate(v.batchAddQuestions),
  controller.batchAddQuestions
);

teacherRouter.post(
  '/:quizId/questions',
  CAN_MANAGE,
  validate(v.addQuestion),
  controller.addQuestion
);

teacherRouter.delete(
  '/:quizId/questions/:questionId',
  CAN_MANAGE,
  validate(v.quizQuestionParam),
  controller.removeQuestion
);

teacherRouter.get(
  '/:quizId/results',
  CAN_MANAGE,
  validate(v.quizIdParam),
  controller.getQuizResults
);

teacherRouter.get(
  '/:quizId/results/pdf',
  CAN_MANAGE,
  validate(v.quizIdParam),
  controller.getQuizResultsPdf
);

teacherRouter.get(
  '/:quizId/students/:studentId/attempts/:attemptNumber',
  CAN_MANAGE,
  validate(v.studentAttemptParam),
  controller.getStudentAttemptDetail
);

// ── Student routes ────────────────────────────────────────────────────────────
const studentRouter = Router();
studentRouter.use(authenticate, authorizeRoles('student'));

const CAN_ATTEMPT = authorizePermissions(PERMISSIONS.QUIZ_ATTEMPT);

studentRouter.get(
  '/',
  CAN_ATTEMPT,
  controller.listMyQuizzes
);

studentRouter.get(
  '/:quizId',
  CAN_ATTEMPT,
  validate(v.quizIdParam),
  controller.getMyQuiz
);

studentRouter.post(
  '/:quizId/start',
  CAN_ATTEMPT,
  validate(v.quizIdParam),
  controller.startQuiz
);

studentRouter.post(
  '/:quizId/submit',
  CAN_ATTEMPT,
  validate(v.submitQuiz),
  controller.submitQuiz
);

studentRouter.get(
  '/:quizId/attempt',
  CAN_ATTEMPT,
  validate(v.quizIdParam),
  controller.getMyAttempt
);

studentRouter.get(
  '/:quizId/attempts',
  CAN_ATTEMPT,
  validate(v.quizIdParam),
  controller.listMyAttempts
);

// Mount both router groups
router.use('/teacher/quiz-assignments', teacherRouter);
router.use('/student/quiz-assignments', studentRouter);

module.exports = router;
