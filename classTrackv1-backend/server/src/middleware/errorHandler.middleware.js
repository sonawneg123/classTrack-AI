/**
 * server/src/middleware/errorHandler.middleware.js
 *
 * Single place where ALL unhandled errors end up.
 * - ApiError instances      → deterministic status code + message
 * - multer errors           → 400/413
 * - JWT errors              → 401
 * - Unexpected errors       → 500 (hides implementation detail from client)
 *
 * Every error response uses the same envelope:
 *   { success: false, message, errors: [], requestId }
 *
 * Errors are also written to the structured logger so they appear in log files.
 */
const multer = require('multer');
const { ApiError } = require('../utils/response.util');
const logger = require('../utils/logger.util');

function errorHandler(err, req, res, next) {
  // Multer file-size errors
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? `File exceeds the ${process.env.MAX_UPLOAD_MB || 15} MB limit.`
      : err.message;
    return _respond(res, 400, message, [], req.requestId);
  }

  // Our own structured errors
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error('API error', { requestId: req.requestId, error: err.message, stack: err.stack });
    }
    return _respond(res, err.statusCode, err.message, err.errors, req.requestId);
  }

  // JWT verification failures arriving without going through auth middleware
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return _respond(res, 401, 'Invalid or expired token.', [], req.requestId);
  }

  // MySQL duplicate-entry errors
  if (err.code === 'ER_DUP_ENTRY') {
    return _respond(res, 409, 'A record with this value already exists.', [], req.requestId);
  }

  // Unexpected / programming errors — log fully, hide detail from client
  logger.error('Unhandled error', {
    requestId: req.requestId,
    error:     err.message,
    stack:     err.stack,
    path:      req.path,
    method:    req.method,
  });

  _respond(res, 500, 'An unexpected error occurred. Please try again.', [], req.requestId);
}

function _respond(res, statusCode, message, errors = [], requestId) {
  return res.status(statusCode).json({
    success:   false,
    message,
    errors,
    requestId: requestId || undefined,
  });
}

module.exports = errorHandler;
