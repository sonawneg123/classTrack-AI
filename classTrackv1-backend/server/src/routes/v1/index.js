/**
 * server/src/routes/v1/index.js
 *
 * /api/v1 is the versioned API surface. Auth gets the full new IAM module
 * (routes/v1/auth.routes.js). The other domains (admin/teacher/student/
 * account) are NOT re-implemented here — their existing routers are
 * re-mounted as-is, so /api/v1/teacher/... behaves identically to
 * /api/teacher/... today. This keeps the versioning consistent without
 * touching any business logic outside the auth module, per the task scope.
 */
const { Router } = require('express');
const router = Router();

const authRoutesV1            = require('./auth.routes');
const accountRoutes           = require('../account.routes');
const adminRoutes             = require('../admin.routes');
const teacherRoutes           = require('../teacher.routes');
const studentRoutes           = require('../student.routes');
const knowledgeRoutes         = require('../knowledge.routes');
const studentKnowledgeRoutes  = require('../studentKnowledge.routes');
const questionRoutes          = require('../question.routes');
const practiceRoutes          = require('../practice.routes');
const quizRoutes              = require('../quiz.routes');
const controller              = require('../../controllers/account.controller');

router.use('/auth',             authRoutesV1);
// Public avatar file serving — no authenticate middleware.
// Filenames are random-hex, so unguessable without DB access.
router.get('/account/avatar/:filename', controller.serveAvatar);
router.use('/account',          accountRoutes);
router.use('/admin',            adminRoutes);
router.use('/teacher',          teacherRoutes);
router.use('/student',          studentRoutes);
router.use('/knowledge',        knowledgeRoutes);
// Student read-only hierarchy — separate router so teacher-only knowledge
// routes are never accidentally accessible to students.
router.use('/student/knowledge', studentKnowledgeRoutes);
router.use('/questions',         questionRoutes);
router.use('/practice',          practiceRoutes);
// Sprint 7 — Quiz assignments (routes carry full /teacher/quiz-assignments and
//             /student/quiz-assignments prefixes, mounted directly on v1)
router.use('/',                  quizRoutes);

module.exports = router;
