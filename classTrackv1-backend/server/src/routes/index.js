/**
 * server/src/routes/index.js
 *
 * Registers every route group on the Express app.
 * Import order: public → authenticated → role-specific.
 */
const { Router } = require('express');
const router = Router();

const authRoutes    = require('./auth.routes');
const accountRoutes = require('./account.routes');
const adminRoutes   = require('./admin.routes');
const teacherRoutes = require('./teacher.routes');
const studentRoutes = require('./student.routes');

router.use('/auth',    authRoutes);
router.use('/account', accountRoutes);
router.use('/admin',   adminRoutes);
router.use('/teacher', teacherRoutes);
router.use('/student', studentRoutes);

module.exports = router;
