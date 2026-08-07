/**
 * server/src/middleware/rateLimiter.middleware.js
 */
const rateLimit = require('express-rate-limit');
const config    = require('../config');

function _makeResponseBody(message) {
  return { success: false, message };
}

const loginLimiter = rateLimit({
  ...config.rateLimit.login,
  standardHeaders: true,
  legacyHeaders:   false,
  message: _makeResponseBody('Too many login attempts. Please wait 15 minutes and try again.'),
  keyGenerator: (req) => `login:${req.ip}`,
});

const registerLimiter = rateLimit({
  ...config.rateLimit.register,
  standardHeaders: true,
  legacyHeaders:   false,
  message: _makeResponseBody('Too many registration attempts. Please try again later.'),
  keyGenerator: (req) => `register:${req.ip}`,
});

const refreshLimiter = rateLimit({
  ...config.rateLimit.refresh,
  standardHeaders: true,
  legacyHeaders:   false,
  message: _makeResponseBody('Too many token refresh attempts. Please try again later.'),
  keyGenerator: (req) => `refresh:${req.ip}`,
});

const forgotPasswordLimiter = rateLimit({
  ...config.rateLimit.forgotPassword,
  standardHeaders: true,
  legacyHeaders:   false,
  message: _makeResponseBody('Too many password reset requests. Please try again later.'),
  keyGenerator: (req) => `forgot-password:${req.ip}`,
});

module.exports = { loginLimiter, registerLimiter, refreshLimiter, forgotPasswordLimiter };
