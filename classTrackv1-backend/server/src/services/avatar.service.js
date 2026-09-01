/**
 * server/src/services/avatar.service.js
 *
 * Business logic for profile photo management.
 *
 * Storage model:
 *   - `avatar_path` column on admins/teachers/students stores a relative
 *     path from the server's working directory (e.g. 'uploads/avatars/abc.jpg').
 *   - The full URL is built by buildAvatarUrl() and returned to the client.
 *   - Actual image bytes live on disk under AVATAR_UPLOAD_DIR.
 *   - The design is intentionally easy to migrate to S3: replace the disk
 *     I/O in deleteAvatarFile() with an S3 deleteObject call, and update
 *     buildAvatarUrl() to return a CDN URL instead.
 *
 * Security:
 *   - The user ID comes from req.user (set by authenticate middleware) — never
 *     from client-supplied data.
 *   - Filenames are server-generated random hex strings (see avatarUpload.middleware).
 *   - Internal filesystem paths are never returned to the client.
 */
const path   = require('path');
const fs     = require('fs');
const config = require('../config');
const { ApiError } = require('../utils/response.util');
const logger = require('../utils/logger.util');

const REPO_BY_ROLE = {
  admin:   require('../repositories/admin.repository'),
  teacher: require('../repositories/teacher.repository'),
  student: require('../repositories/student.repository'),
};

// ── URL construction ─────────────────────────────────────────────────────────

/**
 * Build the public URL a client can use to load the avatar image.
 *
 * The frontend calls /api/v1/account/avatar/:filename and the server
 * streams the file.  No auth is required to view avatars — they are
 * scoped by unguessable random filenames.
 *
 * @param {string|null} avatarPath  Relative storage path, e.g. 'uploads/avatars/abc.jpg'
 * @returns {string|null}
 */
function buildAvatarUrl(avatarPath) {
  if (!avatarPath) return null;
  const filename = path.basename(avatarPath);
  return `/api/v1/account/avatar/${filename}`;
}

// ── Profile retrieval ────────────────────────────────────────────────────────

/**
 * Returns the current user's profile including avatarUrl.
 * Re-queries the DB so the response is always up-to-date.
 */
async function getProfile(userId, role) {
  const repo = REPO_BY_ROLE[role];
  if (!repo) throw ApiError.forbidden();

  const account = await repo.findById(userId);
  if (!account) throw ApiError.notFound('Account not found.');

  return _toPublicProfile(role, account);
}

// ── Upload / replace ─────────────────────────────────────────────────────────

/**
 * Saves a newly uploaded avatar and replaces any existing one.
 *
 * Steps:
 *   1. Build the relative storage path from the uploaded file location.
 *   2. Persist the new path in the DB.
 *   3. Delete the old file (best-effort — never blocks the response).
 *
 * @param {number} userId
 * @param {string} role
 * @param {{ path: string }} file   - multer file object
 * @returns {object} Updated profile
 */
async function uploadAvatar(userId, role, file) {
  const repo = REPO_BY_ROLE[role];
  if (!repo) throw ApiError.forbidden();

  const account = await repo.findById(userId);
  if (!account) throw ApiError.notFound('Account not found.');

  // Convert absolute disk path to the relative path we store in DB
  const relativePath = path.relative(process.cwd(), file.path).replace(/\\/g, '/');
  const oldPath = account.avatar_path;

  await repo.updateById(userId, { avatar_path: relativePath, updated_at: new Date() });

  // Best-effort: delete the old file after the DB update succeeds
  if (oldPath) {
    _deleteAvatarFile(oldPath, userId, role);
  }

  const updated = await repo.findById(userId);
  logger.info('Avatar uploaded', { userId, role, filename: path.basename(relativePath) });
  return _toPublicProfile(role, updated);
}

// ── Remove ───────────────────────────────────────────────────────────────────

/**
 * Removes the user's avatar.
 *
 * Steps:
 *   1. Clear the avatar_path in the DB.
 *   2. Delete the stored file (best-effort).
 *
 * @param {number} userId
 * @param {string} role
 * @returns {object} Updated profile (avatarUrl will be null)
 */
async function removeAvatar(userId, role) {
  const repo = REPO_BY_ROLE[role];
  if (!repo) throw ApiError.forbidden();

  const account = await repo.findById(userId);
  if (!account) throw ApiError.notFound('Account not found.');

  const oldPath = account.avatar_path;
  if (!oldPath) {
    // Nothing to remove — return current profile (idempotent)
    return _toPublicProfile(role, account);
  }

  await repo.updateById(userId, { avatar_path: null, updated_at: new Date() });

  // Best-effort: delete the stored file
  _deleteAvatarFile(oldPath, userId, role);

  const updated = await repo.findById(userId);
  logger.info('Avatar removed', { userId, role });
  return _toPublicProfile(role, updated);
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function _toPublicProfile(role, account) {
  const avatarUrl = buildAvatarUrl(account.avatar_path);

  const base = {
    id:          account.id,
    name:        account.name,
    role,
    avatarUrl,
    isActive:    Boolean(account.is_active),
    createdAt:   account.created_at ?? null,
    lastLoginAt: account.last_login_at ?? null,
  };

  if (role === 'student') {
    return { ...base, username: account.username ?? null, classroomId: account.classroom_id ?? null };
  }
  return { ...base, email: account.email ?? null };
}

/**
 * Deletes a stored avatar file.
 * Never throws — failures are logged but do not affect the HTTP response.
 *
 * @param {string} relativePath - relative path stored in DB
 * @param {number} userId
 * @param {string} role
 */
function _deleteAvatarFile(relativePath, userId, role) {
  try {
    const absPath = path.resolve(process.cwd(), relativePath);

    // Safety: only delete files inside our AVATAR_UPLOAD_DIR — prevent
    // path traversal in case of a corrupt DB value.
    const allowedDir = path.resolve(process.cwd(), config.upload.avatarDir);
    if (!absPath.startsWith(allowedDir + path.sep) && absPath !== allowedDir) {
      logger.warn('Avatar delete blocked: path outside avatarDir', {
        relativePath,
        userId,
        role,
      });
      return;
    }

    if (fs.existsSync(absPath)) {
      fs.unlink(absPath, (err) => {
        if (err) {
          logger.warn('Failed to delete old avatar file', {
            relativePath,
            userId,
            role,
            error: err.message,
          });
        }
      });
    }
  } catch (err) {
    logger.warn('Error in _deleteAvatarFile', { relativePath, userId, role, error: err.message });
  }
}

module.exports = { getProfile, uploadAvatar, removeAvatar, buildAvatarUrl };
