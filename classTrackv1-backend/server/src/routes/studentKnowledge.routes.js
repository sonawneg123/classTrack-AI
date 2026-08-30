/**
 * server/src/routes/studentKnowledge.routes.js
 *
 * Read-only curriculum hierarchy for students.
 *
 * Routes are scoped to:
 *   authenticate → authorizeRoles('student') → authorizePermissions(QUIZ_ATTEMPT)
 *
 * Student sees only the hierarchy owned by their classroom's teacher.
 * All ownership checks are server-side — frontend filtering is insufficient.
 *
 * Route map:
 *   GET /student/knowledge/curricula
 *   GET /student/knowledge/curricula/:curriculumId/subjects
 *   GET /student/knowledge/subjects/:subjectId/chapters
 *   GET /student/knowledge/chapters/:chapterId/topics
 */
const { Router } = require('express');
const controller = require('../controllers/studentKnowledge.controller');
const { authenticate, authorizeRoles, authorizePermissions } = require('../middleware/auth.middleware');
const { PERMISSIONS } = require('../constants/permissions.constants');

const router = Router();
router.use(authenticate, authorizeRoles('student'), authorizePermissions(PERMISSIONS.QUIZ_ATTEMPT));

router.get('/curricula',                                    controller.listCurricula);
router.get('/curricula/:curriculumId/subjects',             controller.listSubjects);
router.get('/subjects/:subjectId/chapters',                 controller.listChapters);
router.get('/chapters/:chapterId/topics',                   controller.listTopics);

module.exports = router;
