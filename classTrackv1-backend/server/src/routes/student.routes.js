/**
 * server/src/routes/student.routes.js
 */
const { Router } = require('express');
const controller = require('../controllers/student.controller');
const { authenticate, authorizeRoles } = require('../middleware/auth.middleware');
const { upload, validateFileSignature } = require('../middleware/upload.middleware');

const router = Router();
router.use(authenticate, authorizeRoles('student'));

router.get('/tasks',                                     controller.getMyTasks);
router.post('/tasks/:taskId/submit',
  upload.single('file'), validateFileSignature,          controller.submitTask);
router.get('/submissions',                               controller.getMySubmissions);
router.get('/submissions/:submissionId/history',         controller.getMySubmissionHistory);
router.get('/report',                                    controller.downloadMyReport);

module.exports = router;
