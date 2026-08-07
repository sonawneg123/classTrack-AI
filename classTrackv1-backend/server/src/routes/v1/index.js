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

const authRoutesV1  = require('./auth.routes');
const accountRoutes  = require('../account.routes');
const adminRoutes    = require('../admin.routes');
const teacherRoutes  = require('../teacher.routes');
const studentRoutes  = require('../student.routes');

router.use('/auth',    authRoutesV1);
router.use('/account', accountRoutes);
router.use('/admin',   adminRoutes);
router.use('/teacher', teacherRoutes);
router.use('/student', studentRoutes);

module.exports = router;
