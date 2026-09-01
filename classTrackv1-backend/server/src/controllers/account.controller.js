/**
 * server/src/controllers/account.controller.js
 */
const path         = require('path');
const fs           = require('fs');
const notifService = require('../services/notification.service');
const avatarService = require('../services/avatar.service');
const { ApiResponse, asyncHandler, ApiError } = require('../utils/response.util');
const config       = require('../config');
const logger       = require('../utils/logger.util');

// ── Notifications ────────────────────────────────────────────────────────────

const getNotifications = asyncHandler(async (req, res) => {
  const unreadOnly = req.query.unreadOnly === 'true';
  const limit      = Math.min(Number(req.query.limit) || 30, 100);
  const offset     = Number(req.query.offset) || 0;
  const data = await notifService.getNotifications(req.user.role, req.user.id, { unreadOnly, limit, offset });
  new ApiResponse(200, 'Notifications retrieved.', data).send(res);
});

const markNotificationRead = asyncHandler(async (req, res) => {
  await notifService.markRead(req.params.id, req.user.role, req.user.id);
  new ApiResponse(200, 'Marked as read.').send(res);
});

const markAllNotificationsRead = asyncHandler(async (req, res) => {
  await notifService.markAllRead(req.user.role, req.user.id);
  new ApiResponse(200, 'All notifications marked as read.').send(res);
});

// ── Profile / Avatar ─────────────────────────────────────────────────────────

/**
 * GET /account/profile
 * Returns the authenticated user's profile including avatarUrl.
 */
const getProfile = asyncHandler(async (req, res) => {
  const profile = await avatarService.getProfile(req.user.id, req.user.role);
  new ApiResponse(200, 'Profile retrieved.', profile).send(res);
});

/**
 * PUT /account/profile/photo
 * Uploads or replaces the authenticated user's profile photo.
 * File must have been processed by avatarUpload.single('photo') and
 * validateAvatarSignature before this handler runs.
 */
const uploadProfilePhoto = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest('No image file provided. Please select a JPEG, PNG, or WebP image.');
  }

  const profile = await avatarService.uploadAvatar(req.user.id, req.user.role, req.file);
  new ApiResponse(200, 'Profile photo updated successfully.', profile).send(res);
});

/**
 * DELETE /account/profile/photo
 * Removes the authenticated user's profile photo.
 */
const deleteProfilePhoto = asyncHandler(async (req, res) => {
  const profile = await avatarService.removeAvatar(req.user.id, req.user.role);
  new ApiResponse(200, 'Profile photo removed.', profile).send(res);
});

/**
 * GET /account/avatar/:filename
 * Serves a stored avatar image.
 *
 * Security:
 *   - Strips path traversal sequences from the filename.
 *   - Only serves files from within AVATAR_UPLOAD_DIR.
 *   - Returns 404 for missing files — never reveals filesystem details.
 *   - Access is intentionally public (no auth) because:
 *       (a) filenames are unguessable random hex strings.
 *       (b) profile photos are not classified data.
 *   - Sets appropriate cache headers (7-day public cache) since filenames
 *     change on every upload, making stale-image browser caching impossible.
 */
const serveAvatar = asyncHandler(async (req, res) => {
  // Sanitise: strip all path separators so only the bare filename remains
  const raw = req.params.filename || '';
  const filename = path.basename(raw);

  // Reject anything that still looks suspicious after basename extraction
  if (!filename || filename !== raw || /\.\./.test(filename)) {
    throw ApiError.notFound('Image not found.');
  }

  const avatarDir = path.resolve(process.cwd(), config.upload.avatarDir);
  const filePath  = path.join(avatarDir, filename);

  // Ensure the resolved path is still inside avatarDir
  if (!filePath.startsWith(avatarDir + path.sep)) {
    throw ApiError.notFound('Image not found.');
  }

  if (!fs.existsSync(filePath)) {
    throw ApiError.notFound('Image not found.');
  }

  // Cache for 7 days — filename changes on every upload so this is safe
  res.set('Cache-Control', 'public, max-age=604800, immutable');
  res.sendFile(filePath);
});

module.exports = {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getProfile,
  uploadProfilePhoto,
  deleteProfilePhoto,
  serveAvatar,
};
