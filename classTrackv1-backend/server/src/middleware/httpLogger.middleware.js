/**
 * server/src/middleware/httpLogger.middleware.js
 *
 * Logs every HTTP request: method, path, status code, and response time.
 * Never logs Authorization headers, passwords, or request bodies
 * that might contain credentials.
 */
const logger = require('../utils/logger.util');

function httpLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const level      = res.statusCode >= 500 ? 'error'
                     : res.statusCode >= 400 ? 'warn'
                     : 'info';

    logger[level]('HTTP request', {
      requestId:  req.requestId,
      method:     req.method,
      path:       req.path,
      status:     res.statusCode,
      durationMs,
      ip:         req.ip,
      userAgent:  req.headers['user-agent'],
      userId:     req.user?.id,
      role:       req.user?.role,
    });
  });

  next();
}

module.exports = httpLogger;
