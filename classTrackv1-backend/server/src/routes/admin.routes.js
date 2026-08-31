/**
 * server/src/routes/admin.routes.js
 */
const { Router } = require('express');
const controller     = require('../controllers/admin.controller');
const adminValidator = require('../validators/admin.validator');
const { authenticate, authorizeRoles } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');

const router = Router();
router.use(authenticate, authorizeRoles('admin'));

// ── Platform stats & audit logs ───────────────────────────────────────────────
router.get('/dashboard',                          controller.getDashboard);
router.get('/stats',                              controller.getStats);
router.get('/audit-logs',                         controller.getAuditLogs);

// ── Teacher management ────────────────────────────────────────────────────────
router.post('/teachers',                          validate(adminValidator.createTeacher),  controller.createTeacher);
router.get('/teachers',                           controller.listTeachers);
router.get('/teachers/:id',                       controller.getTeacher);
router.patch('/teachers/:id',                     validate(adminValidator.updateTeacher),  controller.updateTeacher);
router.patch('/teachers/:id/status',              validate(adminValidator.setTeacherStatus), controller.setTeacherStatus);
router.patch('/teachers/:id/toggle-active',       controller.toggleTeacherActive);
router.post('/teachers/:id/reset-password',       controller.resetTeacherPassword);
router.patch('/teachers/:id/classroom',           validate(adminValidator.assignClassroom), controller.assignTeacherClassroom);
router.delete('/teachers/:id/classroom/:classroomId', controller.removeTeacherFromClassroom);

// ── Teacher Registration Codes ────────────────────────────────────────────────
router.post('/teacher-registration-codes',        validate(adminValidator.createRegistrationCode), controller.createTeacherRegistrationCode);
router.get('/teacher-registration-codes',         controller.listTeacherRegistrationCodes);
router.post('/teacher-registration-codes/:id/revoke', controller.revokeTeacherRegistrationCode);

// ── Classroom management ──────────────────────────────────────────────────────
router.post('/classrooms',                        validate(adminValidator.createClassroom), controller.createClassroom);
router.get('/classrooms',                         controller.listClassrooms);

module.exports = router;
