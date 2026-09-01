/**
 * server/src/routes/account.routes.js
 */
const { Router } = require('express');
const controller  = require('../controllers/account.controller');
const authCtrl    = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const validate    = require('../middleware/validate.middleware');
const authValidator = require('../validators/auth.validator');
const { avatarUpload, validateAvatarSignature } = require('../middleware/avatarUpload.middleware');

const router = Router();
router.use(authenticate);

router.post('/change-password', validate(authValidator.changePassword), authCtrl.changeOwnPassword);

router.get('/notifications',             controller.getNotifications);
router.patch('/notifications/read-all',  controller.markAllNotificationsRead);
router.patch('/notifications/:id/read',  controller.markNotificationRead);

// ── Profile ──────────────────────────────────────────────────────────────────

router.get('/profile', controller.getProfile);

// ── Profile photo ─────────────────────────────────────────────────────────────
// PUT accepts both new uploads and replacements.
router.put(
  '/profile/photo',
  avatarUpload.single('photo'),
  validateAvatarSignature,
  controller.uploadProfilePhoto
);

router.delete('/profile/photo', controller.deleteProfilePhoto);

// ── Avatar file serving (public — no auth required) ──────────────────────────
// Note: This route is NOT inside the authenticate middleware above.
// We export a separate router function for the public endpoint, mounted
// explicitly below (without the router.use(authenticate) guard).
module.exports = router;
