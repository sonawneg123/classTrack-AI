/**
 * server/src/utils/token.util.js
 *
 * Opaque, high-entropy tokens for refresh tokens, email verification, and
 * password reset — distinct from JWTs (jwt.util.js), which are used only
 * for short-lived access tokens.
 *
 * Why not JWTs for these too? A refresh/reset/verification token must be
 * revocable and single-use. A signed JWT can't be "un-issued" without a
 * denylist — a random token stored (hashed) in the DB is trivially
 * revocable by deleting/marking the row, and naturally single-use by
 * checking `used_at`/`revoked_at`.
 *
 * SECURITY: only the SHA-256 hash of a token is ever persisted. The raw
 * token is shown to the client exactly once (in the API response or the
 * emailed link) and can never be recovered from the database.
 */
const crypto = require('crypto');

/** Generates a cryptographically random URL-safe token string. */
function generateRawToken(byteLength = 48) {
  return crypto.randomBytes(byteLength).toString('base64url');
}

/** SHA-256 hashes a raw token for storage/lookup. Deterministic, one-way. */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/** Returns a Date object `minutes` from now — convenience for expiry columns. */
function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function hoursFromNow(hours) {
  return minutesFromNow(hours * 60);
}

module.exports = { generateRawToken, hashToken, minutesFromNow, hoursFromNow };
