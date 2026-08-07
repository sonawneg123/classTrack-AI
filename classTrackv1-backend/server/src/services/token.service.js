/**
 * server/src/services/token.service.js
 *
 * Enterprise session model:
 *   - Access token:  short-lived JWT (default 15m), sent as a Bearer header,
 *                     verified stateless by auth.middleware.js (unchanged).
 *   - Refresh token: opaque random string, long-lived (default 30d), stored
 *                     ONLY as a SHA-256 hash in `refresh_tokens`. Presented
 *                     to POST /api/v1/auth/refresh to obtain a new access
 *                     token. Rotates on every use (old token is revoked and
 *                     linked to its replacement).
 *
 * Reuse detection: if a refresh token that has ALREADY been rotated (i.e.
 * `replaced_by_token_id` is set / it's revoked) is presented again, that is
 * a strong signal the token was stolen and used by both the legitimate
 * client and an attacker. The response: revoke the entire token family for
 * that user, forcing a fresh login everywhere.
 */
const config = require('../config');
const { signToken } = require('../utils/jwt.util');
const { generateRawToken, hashToken } = require('../utils/token.util');
const { permissionsForRole } = require('../constants/permissions.constants');
const { ApiError } = require('../utils/response.util');
const logger = require('../utils/logger.util');

const refreshTokenRepo = require('../repositories/refreshToken.repository');
const auditRepo = require('../repositories/audit.repository');

/**
 * Builds a short-lived access token. Payload shape is intentionally
 * IDENTICAL to the legacy long-lived token (id, role, name, classroomId)
 * so auth.middleware.js and every existing controller/service that reads
 * req.user works completely unchanged.
 */
function issueAccessToken({ id, role, name, classroomId }) {
  return signToken(
    { id, role, name, ...(classroomId ? { classroomId } : {}) },
    config.jwt.accessTokenExpiresIn
  );
}

/** Issues a new refresh token, persists its hash, returns the RAW token (shown once). */
async function issueRefreshToken({ userId, userRole, ipAddress, userAgent }) {
  const rawToken = generateRawToken(config.jwt.refreshTokenBytes);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + _parseDurationMs(config.jwt.refreshTokenExpiresIn));

  const id = await refreshTokenRepo.insert({ userId, userRole, tokenHash, expiresAt, ipAddress, userAgent });
  return { rawToken, id, expiresAt };
}

/** Issues both tokens together — the standard result of any successful login. */
async function issueTokenPair(account, { ipAddress, userAgent } = {}) {
  const accessToken = issueAccessToken(account);
  const { rawToken: refreshToken } = await issueRefreshToken({
    userId: account.id, userRole: account.role, ipAddress, userAgent,
  });
  return { accessToken, refreshToken, permissions: permissionsForRole(account.role) };
}

/**
 * Exchanges a valid, unused refresh token for a new access + refresh pair.
 * Implements rotation: the presented token is revoked and linked to its
 * replacement in the same operation the new one is issued.
 *
 * Throws ApiError.unauthorized on any invalid/expired/reused token — the
 * caller (controller) always returns a generic 401 regardless of the exact
 * reason, so a client can't distinguish "expired" from "reused" from
 * "revoked" by response content (that distinction is only in the server log).
 */
async function refreshTokenPair(rawRefreshToken, { ipAddress, userAgent, accountLookup }) {
  const tokenHash = hashToken(rawRefreshToken);
  const existing = await refreshTokenRepo.findByHash(tokenHash);

  if (!existing) {
    throw ApiError.unauthorized('Invalid refresh token.');
  }

  const isReused = existing.revoked_at !== null;
  if (isReused) {
    // Theft signal — nuke every session for this user and force re-login.
    await refreshTokenRepo.revokeAllForUser(existing.user_id, existing.user_role);
    await auditRepo.insert({
      actorType: existing.user_role, actorId: existing.user_id,
      action: 'refresh_token_reuse_detected', targetType: 'refresh_token', targetId: existing.id,
    });
    logger.error('Refresh token reuse detected — all sessions revoked', {
      userId: existing.user_id, role: existing.user_role,
    });
    throw ApiError.unauthorized('Invalid refresh token.');
  }

  if (new Date(existing.expires_at) <= new Date()) {
    throw ApiError.unauthorized('Refresh token has expired. Please log in again.');
  }

  // Look up the current account state (so a disabled/locked account can't refresh either)
  const account = await accountLookup(existing.user_id, existing.user_role);
  if (!account) throw ApiError.unauthorized('Account no longer exists.');
  if ('is_active' in account && !account.is_active) {
    throw ApiError.forbidden('Your account has been disabled. Contact your administrator.');
  }

  const accessToken = issueAccessToken({ id: account.id, role: existing.user_role, name: account.name, classroomId: account.classroom_id });
  const { rawToken: newRefreshToken, id: newTokenId } = await issueRefreshToken({
    userId: existing.user_id, userRole: existing.user_role, ipAddress, userAgent,
  });

  await refreshTokenRepo.rotate(existing.id, newTokenId);

  await auditRepo.insert({
    actorType: existing.user_role, actorId: existing.user_id, action: 'token_refreshed',
  });

  return { accessToken, refreshToken: newRefreshToken, permissions: permissionsForRole(existing.user_role) };
}

/** Revokes a single refresh token — "log out this device". */
async function revokeRefreshToken(rawRefreshToken) {
  const tokenHash = hashToken(rawRefreshToken);
  const existing = await refreshTokenRepo.findByHash(tokenHash);
  if (existing && !existing.revoked_at) {
    await refreshTokenRepo.revokeById(existing.id);
  }
  return existing;
}

/** Revokes every refresh token for a user — "log out everywhere". */
async function revokeAllSessions(userId, userRole) {
  await refreshTokenRepo.revokeAllForUser(userId, userRole);
}

// ---------------------------------------------------------------------------
// Internal: parse "15m" / "30d" / "7d" style duration strings to milliseconds.
// Only the units actually used by this project's config are supported.
// ---------------------------------------------------------------------------
function _parseDurationMs(duration) {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) throw new Error(`Invalid duration format: "${duration}" (expected e.g. "15m", "30d")`);
  const value = Number(match[1]);
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return value * unitMs;
}

module.exports = {
  issueAccessToken, issueRefreshToken, issueTokenPair,
  refreshTokenPair, revokeRefreshToken, revokeAllSessions,
};
