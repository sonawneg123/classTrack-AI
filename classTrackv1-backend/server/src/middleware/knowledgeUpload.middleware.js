/**
 * server/src/middleware/knowledgeUpload.middleware.js
 *
 * Multer configuration for knowledge document uploads.
 * Handles PDF, DOCX, and TXT.  Separate from the submission upload
 * middleware to allow independent configuration (size, path, types).
 *
 * Security measures:
 *   - MIME-type allowlist (multer fileFilter)
 *   - File size cap (config.rag.maxSizeMb)
 *   - Randomised filename to prevent path traversal
 *   - Magic-byte verification for PDF and TXT (DOCX verified by mammoth)
 *   - Stored outside the web root (no static file serving)
 */
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const config = require('../config');
const { ApiError } = require('../utils/response.util');
const logger = require('../utils/logger.util');

// Ensure the knowledge upload directory exists
const KNOWLEDGE_UPLOAD_DIR = path.resolve(process.cwd(), config.rag.uploadDir);
if (!fs.existsSync(KNOWLEDGE_UPLOAD_DIR)) {
  fs.mkdirSync(KNOWLEDGE_UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME = {
  'application/pdf':                                                  'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain':                                                       'txt',
};

const knowledgeStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, KNOWLEDGE_UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Random hex name — never use the original filename as a path component
    const randomName = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z.]/g, '');
    cb(null, `${Date.now()}-${randomName}${ext}`);
  },
});

const knowledgeFileFilter = (req, file, cb) => {
  if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
  cb(ApiError.badRequest('Unsupported file type. Only PDF, DOCX, and TXT files are accepted.'));
};

const knowledgeUpload = multer({
  storage: knowledgeStorage,
  fileFilter: knowledgeFileFilter,
  limits: { fileSize: config.rag.maxSizeMb * 1024 * 1024 },
});

/**
 * Post-multer magic-byte validation for knowledge documents.
 * DOCX files are ZIP-based and will be validated by mammoth at extraction time.
 */
function validateKnowledgeFileSignature(req, res, next) {
  if (!req.file) return next();
  const { path: filePath, mimetype } = req.file;

  try {
    const fd     = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(16);
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);

    let valid = true;
    if (mimetype === 'application/pdf') {
      valid = header.slice(0, 4).toString('ascii') === '%PDF';
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // DOCX is a ZIP — starts with PK (0x50 0x4B)
      valid = header[0] === 0x50 && header[1] === 0x4B;
    } else if (mimetype === 'text/plain') {
      // Ensure file is actually text (no null bytes in first 2KB)
      const sample = fs.readFileSync(filePath).slice(0, 2048);
      valid = !sample.includes(0x00);
    }

    if (!valid) {
      fs.unlink(filePath, () => {});
      logger.warn('[KnowledgeUpload] File signature mismatch', { mimetype, originalname: req.file.originalname });
      return next(ApiError.badRequest('File content does not match its declared type. Please re-export and re-upload.'));
    }
    next();
  } catch (err) {
    fs.unlink(filePath, () => {});
    next(err);
  }
}

/** Map MIME type to our internal file_type enum value. */
function mimeToKnowledgeFileType(mimetype) {
  return ALLOWED_MIME[mimetype] || 'txt';
}

module.exports = {
  knowledgeUpload,
  validateKnowledgeFileSignature,
  mimeToKnowledgeFileType,
  KNOWLEDGE_UPLOAD_DIR,
};
