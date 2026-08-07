/**
 * server/src/routes/account.routes.js
 */
const { Router } = require('express');
const controller  = require('../controllers/account.controller');
const authCtrl    = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const validate    = require('../middleware/validate.middleware');
const authValidator = require('../validators/auth.validator');

const router = Router();
router.use(authenticate);

router.post('/change-password', validate(authValidator.changePassword), authCtrl.changeOwnPassword);

router.get('/notifications',             controller.getNotifications);
router.patch('/notifications/read-all',  controller.markAllNotificationsRead);
router.patch('/notifications/:id/read',  controller.markNotificationRead);

module.exports = router;
