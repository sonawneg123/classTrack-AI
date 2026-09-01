/**
 * server/src/middleware/avatarUpload.middleware.js
 *
 * Multer configuration specifically for profile-photo / avatar uploads.
 *
 * Kept separate from upload.middleware.js (submission uploads) and
 * knowledgeUpload.middleware.js (RAG documents) so each upload type
 * can have independent configuration without risking cross-contamination.
 *
 * Security measures:
 *   - MIME-type allowlist  (multer fileFilter)
 *   - File size cap        (config.upload.avatarMaxSizeMb)
 *   - Random UUIDv4-style filename — never use the original filename
 *   - Stored under uploads/avatars/ — separate from submission uploads
 *   - Magic-byte verification runs AFTER multer saves the file
 *   - SVG explicitly rejected (XSS risk)
 */

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const config = require('../config');
const { ApiError } = require('../utils/response.util');
const logger = require('../utils/logger.util');

// ── Avatar upload directory ────────────────────────────────────────────────
const AVATAR_UPLOAD_DIR = path.resolve(process.cwd(), config.upload.avatarDir);
if (!fs.existsSync(AVATAR_UPLOAD_DIR)) {
  fs.mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });
}

// ── Allowed MIME types ────────────────────────────────────────────────────
const ALLOWED_AVATAR_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

// ── Multer storage — randomised filename, never use originalname ──────────
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATAR_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const randomHex = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z.]/g, '') || '.jpg';
    cb(null, `${Date.now()}-${randomHex}${ext}`);
  },
});

const avatarFileFilter = (req, file, cb) => {
  if (ALLOWED_AVATAR_MIME.has(file.mimetype)) {
    return cb(null, true);
  }
  cb(ApiError.badRequest('Unsupported file type. Please upload a JPEG, PNG, or WebP image.'));
};

const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: avatarFileFilter,
  limits: { fileSize: config.upload.avatarMaxSizeMb * 1024 * 1024 },
});

/**
 * Magic-byte verification — runs after multer saves the file.
 * Rejects MIME-spoofed files (e.g. a .exe renamed to .jpg).
 */
function validateAvatarSignature(req, res, next) {
  if (!req.file) return next();

  try {
    const { path: filePath, mimetype } = req.file;
    const fd     = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(16);
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);

    let valid = false;
    if (mimetype === 'image/jpeg' || mimetype === 'image/jpg') {
      valid = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    } else if (mimetype === 'image/png') {
      valid = header[0] === 0x89 && header[1] === 0x50 &&
              header[2] === 0x4e && header[3] === 0x47;
    } else if (mimetype === 'image/webp') {
      valid = header.slice(0, 4).toString('ascii') === 'RIFF' &&
              header.slice(8, 12).toString('ascii') === 'WEBP';
    }

    if (!valid) {
      fs.unlink(filePath, () => {});
      logger.warn('[AvatarUpload] File signature mismatch', {
        mimetype,
        originalname: req.file.originalname,
        userId: req.user?.id,
        userRole: req.user?.role,
      });
      return next(ApiError.badRequest(
        'This image file appears corrupted or does not match its declared type. Please re-save the image and try again.'
      ));
    }

    next();
  } catch (err) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    next(err);
  }
}

module.exports = { avatarUpload, validateAvatarSignature, AVATAR_UPLOAD_DIR };
