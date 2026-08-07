/**
 * server/src/routes/admin.routes.js
 */
const { Router } = require('express');
const controller  = require('../controllers/admin.controller');
const adminValidator = require('../validators/admin.validator');
const { authenticate, authorizeRoles } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');

const router = Router();
router.use(authenticate, authorizeRoles('admin'));

router.get('/stats',                              controller.getStats);
router.get('/audit-logs',                         controller.getAuditLogs);

router.post('/teachers',                          validate(adminValidator.createTeacher),  controller.createTeacher);
router.get('/teachers',                           controller.listTeachers);
router.patch('/teachers/:id/toggle-active',       controller.toggleTeacherActive);
router.post('/teachers/:id/reset-password',       controller.resetTeacherPassword);

router.post('/classrooms',                        validate(adminValidator.createClassroom), controller.createClassroom);
router.get('/classrooms',                         controller.listClassrooms);

module.exports = router;
