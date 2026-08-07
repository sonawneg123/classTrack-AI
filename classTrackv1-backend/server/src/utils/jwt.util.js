/**
 * server/src/utils/jwt.util.js
 */
const jwt    = require('jsonwebtoken');
const config = require('../config');

/**
 * Signs a JWT. `expiresIn` defaults to the legacy 7-day expiry
 * (config.jwt.expiresIn) so every existing call site — the pre-v1
 * /api/auth routes, changeOwnPassword, etc. — is completely unaffected.
 * token.service.js passes config.jwt.accessTokenExpiresIn explicitly for
 * the new short-lived v1 access tokens.
 */
function signToken(payload, expiresIn = config.jwt.expiresIn) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

module.exports = { signToken, verifyToken };
