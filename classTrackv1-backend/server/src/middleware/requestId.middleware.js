/**
 * server/src/middleware/requestId.middleware.js
 *
 * Attaches a unique request ID to every request so log entries across the
 * lifecycle of one HTTP call can be correlated. The ID is also returned in
 * the X-Request-Id response header so the client can include it in bug
 * reports.
 */
const crypto = require('crypto');

function requestId(req, res, next) {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

module.exports = requestId;
