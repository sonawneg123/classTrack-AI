/**
 * server/src/middleware/upload.middleware.js
 */
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const config = require('../config');
const logger = require('../utils/logger.util');
const { ApiError } = require('../utils/response.util');

const UPLOAD_DIR = path.resolve(process.cwd(), config.upload.uploadDir);
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'application/pdf', 'text/plain',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext    = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
  cb(new ApiError(400, 'Unsupported file type. Please upload a JPG/PNG photo, PDF, or .txt file.'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.upload.maxSizeMb * 1024 * 1024 },
});

function mimeToFileType(mimetype) {
  if (mimetype.startsWith('image/'))    return 'image';
  if (mimetype === 'application/pdf')   return 'pdf';
  if (mimetype === 'text/plain')        return 'txt';
  return 'text';
}

// Magic-byte (file signature) verification — runs after multer saves the file
function _verifySignature(filePath, mimetype) {
  const fd     = fs.openSync(filePath, 'r');
  const header = Buffer.alloc(16);
  fs.readSync(fd, header, 0, 16, 0);
  fs.closeSync(fd);

  if (mimetype === 'image/jpeg' || mimetype === 'image/jpg')
    return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (mimetype === 'image/png')
    return header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
  if (mimetype === 'image/webp')
    return header.slice(0, 4).toString('ascii') === 'RIFF' && header.slice(8, 12).toString('ascii') === 'WEBP';
  if (mimetype === 'application/pdf')
    return header.slice(0, 4).toString('ascii') === '%PDF';
  if (mimetype === 'text/plain') {
    const sample = fs.readFileSync(filePath).slice(0, 2048);
    let suspicious = 0;
    for (const byte of sample) {
      if (byte === 0) return false;
      if (byte < 9 || (byte > 13 && byte < 32)) suspicious++;
    }
    return suspicious / Math.max(sample.length, 1) < 0.05;
  }
  return false;
}

function validateFileSignature(req, res, next) {
  if (!req.file) return next();
  try {
    if (!_verifySignature(req.file.path, req.file.mimetype)) {
      fs.unlink(req.file.path, () => {});
      logger.warn('File signature mismatch', { mimetype: req.file.mimetype, originalname: req.file.originalname });
      return next(ApiError.badRequest(
        'This file does not match its claimed type. Please re-export and re-upload.'
      ));
    }
    next();
  } catch (err) {
    fs.unlink(req.file?.path, () => {});
    next(err);
  }
}

module.exports = { upload, mimeToFileType, validateFileSignature, UPLOAD_DIR };
