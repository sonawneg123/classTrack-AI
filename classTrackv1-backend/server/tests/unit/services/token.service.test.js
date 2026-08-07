/**
 * server/tests/unit/services/token.service.test.js
 *
 * Repositories are mocked — this test exercises the token-management logic
 * in isolation, without a real database.
 */
jest.mock('../../../src/repositories/refreshToken.repository');
jest.mock('../../../src/repositories/audit.repository');

const refreshTokenRepo = require('../../../src/repositories/refreshToken.repository');
const auditRepo        = require('../../../src/repositories/audit.repository');
const tokenService      = require('../../../src/services/token.service');
const jwt                = require('jsonwebtoken');
const config              = require('../../../src/config');

describe('token.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('issueAccessToken', () => {
    it('signs a JWT whose payload matches the input account', () => {
      const token = tokenService.issueAccessToken({ id: 7, role: 'teacher', name: 'Ms. Rao' });
      const decoded = jwt.verify(token, config.jwt.secret);
      expect(decoded).toMatchObject({ id: 7, role: 'teacher', name: 'Ms. Rao' });
    });

    it('includes classroomId only when provided (students)', () => {
      const withClassroom = jwt.decode(tokenService.issueAccessToken({ id: 1, role: 'student', name: 'S', classroomId: 5 }));
      const withoutClassroom = jwt.decode(tokenService.issueAccessToken({ id: 1, role: 'teacher', name: 'T' }));
      expect(withClassroom.classroomId).toBe(5);
      expect(withoutClassroom.classroomId).toBeUndefined();
    });

    it('expires within the configured access-token window (not the legacy 7d expiry)', () => {
      const token = tokenService.issueAccessToken({ id: 1, role: 'admin', name: 'A' });
      const decoded = jwt.decode(token);
      const lifetimeSeconds = decoded.exp - decoded.iat;
      // JWT_ACCESS_EXPIRES_IN defaults to 15m = 900s
      expect(lifetimeSeconds).toBeLessThanOrEqual(900);
    });
  });

  describe('issueTokenPair', () => {
    it('persists a hashed refresh token and returns the raw token + permissions', async () => {
      refreshTokenRepo.insert.mockResolvedValue(123);

      const result = await tokenService.issueTokenPair(
        { id: 9, role: 'teacher', name: 'Teacher Nine' },
        { ipAddress: '1.2.3.4', userAgent: 'jest-test' }
      );

      expect(refreshTokenRepo.insert).toHaveBeenCalledTimes(1);
      const insertArgs = refreshTokenRepo.insert.mock.calls[0][0];
      expect(insertArgs.userId).toBe(9);
      expect(insertArgs.userRole).toBe('teacher');
      expect(insertArgs.tokenHash).toMatch(/^[a-f0-9]{64}$/); // stored value is hashed, never raw

      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken).not.toBe(insertArgs.tokenHash); // raw !== hash
      expect(result.permissions).toEqual(expect.arrayContaining(['task:create', 'submission:grade']));
    });
  });

  describe('refreshTokenPair', () => {
    const accountLookup = jest.fn().mockResolvedValue({ id: 9, name: 'Teacher Nine', is_active: 1 });

    it('rejects an unknown token', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(null);
      await expect(
        tokenService.refreshTokenPair('nonexistent-raw-token', { accountLookup })
      ).rejects.toThrow('Invalid refresh token.');
    });

    it('rejects and revokes the whole session family on reuse of an already-rotated token', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue({
        id: 1, user_id: 9, user_role: 'teacher',
        revoked_at: new Date().toISOString(), // already used once — this is a reuse
        expires_at: new Date(Date.now() + 100000).toISOString(),
      });

      await expect(
        tokenService.refreshTokenPair('stolen-token', { accountLookup })
      ).rejects.toThrow('Invalid refresh token.');

      expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith(9, 'teacher');
      expect(auditRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'refresh_token_reuse_detected' })
      );
    });

    it('rejects an expired token without treating it as reuse', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue({
        id: 2, user_id: 9, user_role: 'teacher',
        revoked_at: null,
        expires_at: new Date(Date.now() - 1000).toISOString(), // already expired
      });

      await expect(
        tokenService.refreshTokenPair('expired-token', { accountLookup })
      ).rejects.toThrow('Refresh token has expired');

      expect(refreshTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('rejects when the account has since been disabled', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue({
        id: 3, user_id: 9, user_role: 'teacher',
        revoked_at: null,
        expires_at: new Date(Date.now() + 100000).toISOString(),
      });
      const disabledLookup = jest.fn().mockResolvedValue({ id: 9, name: 'T', is_active: 0 });

      await expect(
        tokenService.refreshTokenPair('valid-token-disabled-account', { accountLookup: disabledLookup })
      ).rejects.toThrow('disabled');
    });

    it('on success: rotates the token (revokes old, links to new) and returns a fresh pair', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue({
        id: 4, user_id: 9, user_role: 'teacher',
        revoked_at: null,
        expires_at: new Date(Date.now() + 100000).toISOString(),
      });
      refreshTokenRepo.insert.mockResolvedValue(999);

      const result = await tokenService.refreshTokenPair('valid-raw-token', { accountLookup });

      expect(refreshTokenRepo.rotate).toHaveBeenCalledWith(4, 999);
      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(auditRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'token_refreshed' })
      );
    });
  });

  describe('revokeRefreshToken', () => {
    it('revokes a found, not-yet-revoked token', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue({ id: 5, revoked_at: null });
      await tokenService.revokeRefreshToken('some-raw-token');
      expect(refreshTokenRepo.revokeById).toHaveBeenCalledWith(5);
    });

    it('is a no-op when the token does not exist', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(null);
      await tokenService.revokeRefreshToken('unknown-token');
      expect(refreshTokenRepo.revokeById).not.toHaveBeenCalled();
    });
  });

  describe('revokeAllSessions', () => {
    it('delegates straight to the repository', async () => {
      await tokenService.revokeAllSessions(9, 'teacher');
      expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith(9, 'teacher');
    });
  });
});
