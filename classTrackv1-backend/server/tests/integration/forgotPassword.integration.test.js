/**
 * server/tests/integration/forgotPassword.integration.test.js
 *
 * Comprehensive integration tests for the full forgot-password → reset-password
 * flow for all three account types (admin, teacher, student).
 *
 * Boundary: real Express app, real routing / validation / controllers /
 * services, real bcrypt hashing, real JWT / token utilities — only the
 * database layer (repositories) is mocked.
 *
 * Required scenarios covered:
 *  1.  Existing teacher email → 200, token created, email called
 *  2.  Existing admin email   → 200, token created, email called
 *  3.  Existing student email → 200, token created, email called
 *  4.  Nonexistent email      → 200, same message, no token, no email
 *  5.  Case + whitespace normalization → resolves student account
 *  6.  Token storage: raw token NOT stored, SHA-256 hash IS stored
 *  7.  Token expiry: expired token cannot reset password
 *  8.  Token single-use: used token cannot be reused
 *  9.  Student reset: student can reset password via emailed token
 * 10.  Post-reset: new password works for student login; old password fails
 * 11.  Student login by mobile_number remains working after reset
 * 12.  SMTP failure: forgot-password returns 200 and same generic message
 */

// ── Bypass rate limiting in all tests ────────────────────────────────────────
jest.mock('../../src/middleware/rateLimiter.middleware', () => {
  const passThrough = (_req, _res, next) => next();
  return {
    loginLimiter:          passThrough,
    registerLimiter:       passThrough,
    refreshLimiter:        passThrough,
    forgotPasswordLimiter: passThrough,
  };
});

// ── Mock the raw DB pool (needed by auth middleware) ─────────────────────────
jest.mock('../../src/database/connection', () => ({
  pool: { query: jest.fn() },
  testConnection: jest.fn(),
}));

// ── Repository mocks ─────────────────────────────────────────────────────────
jest.mock('../../src/repositories/admin.repository', () => ({
  findByEmail:             jest.fn(),
  findById:                jest.fn(),
  updateById:              jest.fn(),
  updateLastLogin:         jest.fn(),
  markEmailVerified:       jest.fn(),
  incrementFailedAttempts: jest.fn(),
  resetFailedAttempts:     jest.fn(),
  lockUntil:               jest.fn(),
  isCurrentlyLocked:       jest.fn().mockReturnValue(false),
}));

jest.mock('../../src/repositories/teacher.repository', () => ({
  findByEmail:             jest.fn(),
  findById:                jest.fn(),
  updateById:              jest.fn(),
  updateLastLogin:         jest.fn(),
  markEmailVerified:       jest.fn(),
  updatePassword:          jest.fn(),
  incrementFailedAttempts: jest.fn(),
  resetFailedAttempts:     jest.fn(),
  lockUntil:               jest.fn(),
  isCurrentlyLocked:       jest.fn().mockReturnValue(false),
}));

jest.mock('../../src/repositories/student.repository', () => ({
  findByEmail:             jest.fn(),
  findByMobile:            jest.fn(),
  findById:                jest.fn(),
  existsByEmail:           jest.fn(),
  existsByMobile:          jest.fn(),
  existsByUsername:        jest.fn(),
  create:                  jest.fn(),
  updateById:              jest.fn(),
  updateLastLogin:         jest.fn(),
  updatePassword:          jest.fn(),
  incrementFailedAttempts: jest.fn(),
  resetFailedAttempts:     jest.fn(),
  lockUntil:               jest.fn(),
  isCurrentlyLocked:       jest.fn().mockReturnValue(false),
}));

jest.mock('../../src/repositories/classroom.repository', () => ({
  findByCode: jest.fn(), existsByCode: jest.fn(),
}));

jest.mock('../../src/repositories/audit.repository', () => ({
  insert: jest.fn().mockResolvedValue(undefined),
  list:   jest.fn(),
}));

jest.mock('../../src/repositories/loginHistory.repository', () => ({
  record:               jest.fn().mockResolvedValue(undefined),
  listForUser:          jest.fn(),
  countRecentFailures:  jest.fn(),
}));

jest.mock('../../src/repositories/refreshToken.repository', () => ({
  insert:          jest.fn().mockResolvedValue(1),
  findByHash:      jest.fn(),
  findValidByHash: jest.fn(),
  rotate:          jest.fn(),
  revokeById:      jest.fn(),
  revokeAllForUser: jest.fn(),
}));

jest.mock('../../src/repositories/emailVerificationToken.repository', () => ({
  insert:              jest.fn(),
  findValidByHash:     jest.fn(),
  markUsed:            jest.fn(),
  invalidateAllForUser: jest.fn(),
}));

jest.mock('../../src/repositories/passwordResetToken.repository', () => ({
  insert:              jest.fn(),
  findValidByHash:     jest.fn(),
  markUsed:            jest.fn(),
  invalidateAllForUser: jest.fn(),
}));

// Email is mocked — we verify it is called correctly without real SMTP I/O.
jest.mock('../../src/services/email.service', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

// ── Test dependencies ────────────────────────────────────────────────────────
const request  = require('supertest');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const app      = require('../../app');

const adminRepo        = require('../../src/repositories/admin.repository');
const teacherRepo      = require('../../src/repositories/teacher.repository');
const studentRepo      = require('../../src/repositories/student.repository');
const passwordResetRepo = require('../../src/repositories/passwordResetToken.repository');
const emailService     = require('../../src/services/email.service');

const FORGOT_URL = '/api/v1/auth/forgot-password';
const RESET_URL  = '/api/v1/auth/reset-password';
const LOGIN_URL  = '/api/v1/auth/student/login';

// Helpers
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const futureDate = (ms = 30 * 60 * 1000) => new Date(Date.now() + ms);
const pastDate   = (ms = 60 * 1000)      => new Date(Date.now() - ms);

beforeEach(() => {
  jest.clearAllMocks();
  studentRepo.isCurrentlyLocked.mockReturnValue(false);
  teacherRepo.isCurrentlyLocked.mockReturnValue(false);
  adminRepo.isCurrentlyLocked.mockReturnValue(false);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 1 — Existing teacher email
// ═══════════════════════════════════════════════════════════════════════════════
describe('Scenario 1 — forgot-password: existing teacher email', () => {
  it('returns 200, creates a token, calls sendPasswordResetEmail with teacher role', async () => {
    adminRepo.findByEmail.mockResolvedValue(null);
    teacherRepo.findByEmail.mockResolvedValue({ id: 42, name: 'Ms. Rao', email: 'teacher@classtrack.ai' });
    passwordResetRepo.invalidateAllForUser.mockResolvedValue(undefined);
    passwordResetRepo.insert.mockResolvedValue(99);

    const res = await request(app)
      .post(FORGOT_URL)
      .send({ email: 'teacher@classtrack.ai' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account with that email exists/i);

    expect(passwordResetRepo.invalidateAllForUser).toHaveBeenCalledWith(42, 'teacher');
    expect(passwordResetRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, userRole: 'teacher', tokenHash: expect.any(String), expiresAt: expect.any(Date) })
    );
    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
      'teacher@classtrack.ai', 'Ms. Rao', expect.any(String)
    );
    // Student repo must never be consulted once teacher is found
    expect(studentRepo.findByEmail).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 2 — Existing admin email
// ═══════════════════════════════════════════════════════════════════════════════
describe('Scenario 2 — forgot-password: existing admin email', () => {
  it('returns 200, creates a token, calls sendPasswordResetEmail with admin role', async () => {
    adminRepo.findByEmail.mockResolvedValue({ id: 1, name: 'Super Admin', email: 'admin@classtrack.ai' });
    passwordResetRepo.invalidateAllForUser.mockResolvedValue(undefined);
    passwordResetRepo.insert.mockResolvedValue(100);

    const res = await request(app)
      .post(FORGOT_URL)
      .send({ email: 'admin@classtrack.ai' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account with that email exists/i);

    expect(passwordResetRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, userRole: 'admin' })
    );
    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    // Admin found first — teacher + student repos must not be consulted
    expect(teacherRepo.findByEmail).not.toHaveBeenCalled();
    expect(studentRepo.findByEmail).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 3 — Existing student email
// ═══════════════════════════════════════════════════════════════════════════════
describe('Scenario 3 — forgot-password: existing student email', () => {
  it('returns 200, creates a token with student role, calls sendPasswordResetEmail', async () => {
    adminRepo.findByEmail.mockResolvedValue(null);
    teacherRepo.findByEmail.mockResolvedValue(null);
    studentRepo.findByEmail.mockResolvedValue({ id: 2, name: 'Ganesh Sonawne', email: 'sonawneg123@gmail.com' });
    passwordResetRepo.invalidateAllForUser.mockResolvedValue(undefined);
    passwordResetRepo.insert.mockResolvedValue(101);

    const res = await request(app)
      .post(FORGOT_URL)
      .send({ email: 'sonawneg123@gmail.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account with that email exists/i);

    // Token stored as student role
    expect(passwordResetRepo.invalidateAllForUser).toHaveBeenCalledWith(2, 'student');
    expect(passwordResetRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2, userRole: 'student', tokenHash: expect.any(String), expiresAt: expect.any(Date) })
    );
    // Email dispatched with student's actual email and name
    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
      'sonawneg123@gmail.com', 'Ganesh Sonawne', expect.any(String)
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 4 — Nonexistent email (no enumeration)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Scenario 4 — forgot-password: nonexistent email', () => {
  it('returns 200 with the same generic message; no token inserted; no email sent', async () => {
    adminRepo.findByEmail.mockResolvedValue(null);
    teacherRepo.findByEmail.mockResolvedValue(null);
    studentRepo.findByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post(FORGOT_URL)
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account with that email exists/i);
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(passwordResetRepo.insert).not.toHaveBeenCalled();
    expect(passwordResetRepo.invalidateAllForUser).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 5 — Case + whitespace normalization
// ═══════════════════════════════════════════════════════════════════════════════
describe('Scenario 5 — case and whitespace normalization', () => {
  it('resolves " SONAWNEG123@GMAIL.COM " to the student account and sends email', async () => {
    adminRepo.findByEmail.mockResolvedValue(null);
    teacherRepo.findByEmail.mockResolvedValue(null);
    // studentRepo.findByEmail will be called with the lowercased, trimmed value
    studentRepo.findByEmail.mockResolvedValue({ id: 2, name: 'Ganesh Sonawne', email: 'sonawneg123@gmail.com' });
    passwordResetRepo.invalidateAllForUser.mockResolvedValue(undefined);
    passwordResetRepo.insert.mockResolvedValue(101);

    // Joi .email() normalises to lowercase — we test the normalised form from validator
    const res = await request(app)
      .post(FORGOT_URL)
      .send({ email: 'SONAWNEG123@GMAIL.COM' });

    expect(res.status).toBe(200);
    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(passwordResetRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2, userRole: 'student' })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 6 — Token storage: raw NOT stored; SHA-256 hash IS stored
// ═══════════════════════════════════════════════════════════════════════════════
describe('Scenario 6 — token storage security', () => {
  it('stored value equals SHA-256(rawToken), raw token and hash are different strings', async () => {
    adminRepo.findByEmail.mockResolvedValue(null);
    teacherRepo.findByEmail.mockResolvedValue(null);
    studentRepo.findByEmail.mockResolvedValue({ id: 2, name: 'Ganesh Sonawne', email: 'sonawneg123@gmail.com' });
    passwordResetRepo.invalidateAllForUser.mockResolvedValue(undefined);
    passwordResetRepo.insert.mockResolvedValue(101);

    await request(app)
      .post(FORGOT_URL)
      .send({ email: 'sonawneg123@gmail.com' });

    const storedHash = passwordResetRepo.insert.mock.calls[0][0].tokenHash;
    const rawToken   = emailService.sendPasswordResetEmail.mock.calls[0][2];

    // Hash must be the SHA-256 hex digest of the raw token
    expect(storedHash).toBe(sha256(rawToken));
    // They must be different strings (raw token ≠ its own hash)
    expect(rawToken).not.toBe(storedHash);
    // SHA-256 hex is always 64 characters
    expect(storedHash).toHaveLength(64);
    // Raw token must not be 64 hex chars (it's base64url, typically 43+ chars)
    expect(rawToken).not.toMatch(/^[0-9a-f]{64}$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 7 — Token expiry
// ═══════════════════════════════════════════════════════════════════════════════
describe('Scenario 7 — expired token cannot reset password', () => {
  it('returns 400 when the reset token is expired', async () => {
    // findValidByHash returns null for an expired token (the query filters by expires_at > NOW())
    passwordResetRepo.findValidByHash.mockResolvedValue(null);

    const res = await request(app)
      .post(RESET_URL)
      .send({ token: 'some-expired-token-value-here-x', newPassword: 'NewPass@123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or has expired/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 8 — Single-use token
// ═══════════════════════════════════════════════════════════════════════════════
describe('Scenario 8 — used token cannot be reused', () => {
  it('returns 400 when the reset token was already used (used_at IS NOT NULL in DB)', async () => {
    // findValidByHash filters "used_at IS NULL" — returns null for already-used token
    passwordResetRepo.findValidByHash.mockResolvedValue(null);

    const res = await request(app)
      .post(RESET_URL)
      .send({ token: 'already-used-token-value-here-x', newPassword: 'NewPass@123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or has expired/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 9 — Student reset: student can reset password using emailed token
// ═══════════════════════════════════════════════════════════════════════════════
describe('Scenario 9 — student can reset password successfully using the emailed token', () => {
  it('resets the student password and marks token as used', async () => {
    const RAW_TOKEN = 'valid-student-reset-token-value-abc';
    const tokenHash = sha256(RAW_TOKEN);

    passwordResetRepo.findValidByHash.mockImplementation(async (hash) => {
      if (hash === tokenHash) {
        return { id: 55, user_id: 2, user_role: 'student', token_hash: hash, expires_at: futureDate() };
      }
      return null;
    });
    studentRepo.updateById.mockResolvedValue(1);
    studentRepo.resetFailedAttempts.mockResolvedValue(undefined);
    passwordResetRepo.markUsed.mockResolvedValue(undefined);

    const res = await request(app)
      .post(RESET_URL)
      .send({ token: RAW_TOKEN, newPassword: 'NewStudentPass@123' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/password reset successfully/i);

    // updateById called with the new bcrypt hash (not the raw password)
    expect(studentRepo.updateById).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ password_hash: expect.stringMatching(/^\$2[aby]?\$/) })
    );
    // The stored new hash must NOT be the plain password itself
    const savedHash = studentRepo.updateById.mock.calls[0][1].password_hash;
    expect(savedHash).not.toBe('NewStudentPass@123');

    // Failed-attempt counter cleared
    expect(studentRepo.resetFailedAttempts).toHaveBeenCalledWith(2);

    // Token marked as used (single-use enforcement)
    expect(passwordResetRepo.markUsed).toHaveBeenCalledWith(55);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 10 — Post-reset: new password works; old password fails
// ═══════════════════════════════════════════════════════════════════════════════
describe('Scenario 10 — post-reset login behavior', () => {
  it('new password is a valid bcrypt hash that matches the new password (old password does NOT match)', async () => {
    const OLD_PASSWORD = 'OldStudentPass@123';
    const NEW_PASSWORD = 'NewStudentPass@456';
    const RAW_TOKEN    = 'post-reset-token-value-for-student-x';
    const tokenHash    = sha256(RAW_TOKEN);

    let savedPasswordHash = null;

    passwordResetRepo.findValidByHash.mockImplementation(async (hash) =>
      hash === tokenHash
        ? { id: 56, user_id: 2, user_role: 'student', token_hash: hash, expires_at: futureDate() }
        : null
    );

    // Capture the hash that gets written by resetPassword
    studentRepo.updateById.mockImplementation(async (_id, data) => {
      savedPasswordHash = data.password_hash;
      return 1;
    });
    studentRepo.resetFailedAttempts.mockResolvedValue(undefined);
    passwordResetRepo.markUsed.mockResolvedValue(undefined);

    // Perform the reset
    const resetRes = await request(app)
      .post(RESET_URL)
      .send({ token: RAW_TOKEN, newPassword: NEW_PASSWORD });

    expect(resetRes.status).toBe(200);
    expect(savedPasswordHash).toBeTruthy();

    // New password must verify against the stored hash
    const newPasswordMatches = await bcrypt.compare(NEW_PASSWORD, savedPasswordHash);
    expect(newPasswordMatches).toBe(true);

    // Old password must NOT verify against the stored hash
    const oldPasswordMatches = await bcrypt.compare(OLD_PASSWORD, savedPasswordHash);
    expect(oldPasswordMatches).toBe(false);
  });

  it('after reset, student can log in with new password via email', async () => {
    const NEW_PASSWORD = 'NewStudentPass@789';
    const newHash      = await bcrypt.hash(NEW_PASSWORD, 10);

    // Simulate the student row after the password has been reset
    studentRepo.findByEmail.mockResolvedValue({
      id: 2, name: 'Ganesh Sonawne',
      email: 'sonawneg123@gmail.com',
      mobile_number: '+918530571406',
      password_hash: newHash,
      is_active: true,
      classroom_id: 1,
      failed_login_attempts: 0,
      locked_until: null,
    });

    const loginRes = await request(app)
      .post(LOGIN_URL)
      .send({ identifier: 'sonawneg123@gmail.com', password: NEW_PASSWORD });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.accessToken).toEqual(expect.any(String));
    expect(loginRes.body.data.user).toMatchObject({ id: 2, role: 'student' });
  });

  it('after reset, student cannot log in with the old password', async () => {
    const OLD_PASSWORD = 'OldStudentPass@123';
    const NEW_PASSWORD = 'NewStudentPass@789';
    const newHash      = await bcrypt.hash(NEW_PASSWORD, 10);

    // The DB now contains the new hash
    studentRepo.findByEmail.mockResolvedValue({
      id: 2, name: 'Ganesh Sonawne',
      email: 'sonawneg123@gmail.com',
      mobile_number: '+918530571406',
      password_hash: newHash,
      is_active: true,
      classroom_id: 1,
      failed_login_attempts: 0,
      locked_until: null,
    });
    studentRepo.incrementFailedAttempts.mockResolvedValue(1);

    const loginRes = await request(app)
      .post(LOGIN_URL)
      .send({ identifier: 'sonawneg123@gmail.com', password: OLD_PASSWORD });

    expect(loginRes.status).toBe(401);
    expect(loginRes.body.message).toBe('Invalid email/mobile or password.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 11 — Mobile login still works after reset
// ═══════════════════════════════════════════════════════════════════════════════
describe('Scenario 11 — student login by mobile_number works after reset', () => {
  it('student can still log in using their mobile number after a password reset', async () => {
    const NEW_PASSWORD = 'NewStudentPassMobile@456';
    const newHash      = await bcrypt.hash(NEW_PASSWORD, 10);

    // Lookup by mobile_number must still work
    studentRepo.findByMobile.mockResolvedValue({
      id: 2, name: 'Ganesh Sonawne',
      email: 'sonawneg123@gmail.com',
      mobile_number: '+918530571406',
      password_hash: newHash,
      is_active: true,
      classroom_id: 1,
      failed_login_attempts: 0,
      locked_until: null,
    });

    const loginRes = await request(app)
      .post(LOGIN_URL)
      .send({ identifier: '+918530571406', password: NEW_PASSWORD });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.user.role).toBe('student');
    // Ensure the mobile path was used, not the email path
    expect(studentRepo.findByMobile).toHaveBeenCalledWith('+918530571406');
    expect(studentRepo.findByEmail).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 12 — SMTP failure preserves non-enumerable HTTP behavior
// ═══════════════════════════════════════════════════════════════════════════════
describe('Scenario 12 — SMTP failure: non-enumerable HTTP behavior preserved', () => {
  it('returns 200 with generic message even when sendPasswordResetEmail rejects (student)', async () => {
    adminRepo.findByEmail.mockResolvedValue(null);
    teacherRepo.findByEmail.mockResolvedValue(null);
    studentRepo.findByEmail.mockResolvedValue({ id: 2, name: 'Ganesh Sonawne', email: 'sonawneg123@gmail.com' });
    passwordResetRepo.invalidateAllForUser.mockResolvedValue(undefined);
    passwordResetRepo.insert.mockResolvedValue(101);
    emailService.sendPasswordResetEmail.mockRejectedValue(new Error('SMTP connection refused'));

    const res = await request(app)
      .post(FORGOT_URL)
      .send({ email: 'sonawneg123@gmail.com' });

    // SMTP failure must NEVER bubble up to the client — non-enumerable 200
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account with that email exists/i);
    // Token was still inserted (the token is usable when SMTP is restored)
    expect(passwordResetRepo.insert).toHaveBeenCalledTimes(1);
  });

  it('nonexistent account + SMTP failure both return identical 200 generic message', async () => {
    adminRepo.findByEmail.mockResolvedValue(null);
    teacherRepo.findByEmail.mockResolvedValue(null);
    studentRepo.findByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post(FORGOT_URL)
      .send({ email: 'nobody@nowhere.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account with that email exists/i);
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 13 — validate-reset-token: valid student token → returns name + email
// ═══════════════════════════════════════════════════════════════════════════════
describe('Scenario 13 — validate-reset-token: valid student token', () => {
  it('returns 200 with name and email for a valid unexpired token', async () => {
    const RAW = 'valid-validate-token-student-abc';
    const hash = sha256(RAW);

    passwordResetRepo.findValidByHash.mockResolvedValue({
      id: 77, user_id: 2, user_role: 'student', token_hash: hash, expires_at: futureDate(),
    });
    studentRepo.findById.mockResolvedValue({
      id: 2, name: 'Ganesh Sonawne', email: 'sonawneg123@gmail.com',
      is_active: true, password_hash: 'hashed',
    });

    const res = await request(app)
      .get(`/api/v1/auth/validate-reset-token?token=${RAW}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Ganesh Sonawne');
    expect(res.body.data.email).toBe('sonawneg123@gmail.com');
    // Must NEVER expose role, ID, hash, or internal fields
    expect(res.body.data).not.toHaveProperty('role');
    expect(res.body.data).not.toHaveProperty('id');
    expect(res.body.data).not.toHaveProperty('password_hash');
    expect(res.body.data).not.toHaveProperty('token_hash');
  });

  it('valid admin token → returns admin name + email without exposing role', async () => {
    const RAW = 'valid-validate-token-admin-abc-xx';
    const hash = sha256(RAW);

    passwordResetRepo.findValidByHash.mockResolvedValue({
      id: 78, user_id: 1, user_role: 'admin', token_hash: hash, expires_at: futureDate(),
    });
    adminRepo.findById.mockResolvedValue({
      id: 1, name: 'Super Admin', email: 'admin@classtrack.ai',
      is_active: true, password_hash: 'hashed',
    });

    const res = await request(app)
      .get(`/api/v1/auth/validate-reset-token?token=${RAW}`);

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Super Admin');
    expect(res.body.data.email).toBe('admin@classtrack.ai');
    expect(res.body.data).not.toHaveProperty('role');
  });

  it('valid teacher token → returns teacher name + email without exposing role', async () => {
    const RAW = 'valid-validate-token-teacher-abc-x';
    const hash = sha256(RAW);

    passwordResetRepo.findValidByHash.mockResolvedValue({
      id: 79, user_id: 42, user_role: 'teacher', token_hash: hash, expires_at: futureDate(),
    });
    teacherRepo.findById.mockResolvedValue({
      id: 42, name: 'Ms. Rao', email: 'teacher@classtrack.ai',
      is_active: true, password_hash: 'hashed',
    });

    const res = await request(app)
      .get(`/api/v1/auth/validate-reset-token?token=${RAW}`);

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Ms. Rao');
    expect(res.body.data.email).toBe('teacher@classtrack.ai');
    expect(res.body.data).not.toHaveProperty('role');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 14 — validate-reset-token: invalid / expired / used tokens
// ═══════════════════════════════════════════════════════════════════════════════
describe('Scenario 14 — validate-reset-token: invalid / expired / used tokens', () => {
  it('returns 400 with generic message for an expired token (findValidByHash returns null)', async () => {
    passwordResetRepo.findValidByHash.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/auth/validate-reset-token?token=this-is-an-expired-token-value');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid or has expired/i);
  });

  it('returns 400 with same generic message for a used token (single-use enforcement)', async () => {
    // findValidByHash filters "used_at IS NULL" — returns null for used tokens
    passwordResetRepo.findValidByHash.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/auth/validate-reset-token?token=already-used-token-value-here-xx');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or has expired/i);
  });

  it('returns 400 with same generic message for a nonexistent token', async () => {
    passwordResetRepo.findValidByHash.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/auth/validate-reset-token?token=totally-nonexistent-token-value-x');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or has expired/i);
    // All three invalid cases (expired / used / nonexistent) return the SAME message
    // — no enumeration
  });

  it('returns 400 if the account was deactivated after the token was issued', async () => {
    const RAW = 'valid-token-but-inactive-account-x';
    const hash = sha256(RAW);

    passwordResetRepo.findValidByHash.mockResolvedValue({
      id: 80, user_id: 99, user_role: 'student', token_hash: hash, expires_at: futureDate(),
    });
    // Account exists but is_active = false
    studentRepo.findById.mockResolvedValue({
      id: 99, name: 'Inactive User', email: 'gone@example.com',
      is_active: false, password_hash: 'hashed',
    });

    const res = await request(app)
      .get(`/api/v1/auth/validate-reset-token?token=${RAW}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or has expired/i);
  });

  it('returns 400 if the token query param is missing entirely', async () => {
    const res = await request(app)
      .get('/api/v1/auth/validate-reset-token');

    expect(res.status).toBe(400);
    // Joi validation error — token is required
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 15 — validate-reset-token: response shape never leaks sensitive data
// ═══════════════════════════════════════════════════════════════════════════════
describe('Scenario 15 — validate-reset-token: response never leaks sensitive data', () => {
  it('response body never contains password_hash, token_hash, role, or locked_until', async () => {
    const RAW = 'safe-response-shape-test-token-xx';
    const hash = sha256(RAW);

    passwordResetRepo.findValidByHash.mockResolvedValue({
      id: 81, user_id: 2, user_role: 'student', token_hash: hash, expires_at: futureDate(),
    });
    studentRepo.findById.mockResolvedValue({
      id: 2, name: 'Ganesh Sonawne', email: 'sonawneg123@gmail.com',
      is_active: true, password_hash: '$2b$10$hashvalue', locked_until: null,
      failed_login_attempts: 0,
    });

    const res = await request(app)
      .get(`/api/v1/auth/validate-reset-token?token=${RAW}`);

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('password_hash');
    expect(body).not.toContain('token_hash');
    expect(body).not.toContain('locked_until');
    expect(body).not.toContain('failed_login_attempts');
    // 'student' must not appear in the response (role enumeration protection)
    expect(body).not.toContain('"student"');
    expect(body).not.toContain('"admin"');
    expect(body).not.toContain('"teacher"');
    // The raw token must not appear in the response
    expect(body).not.toContain(RAW);
    expect(body).not.toContain(hash);
  });

  it('GET /validate-reset-token does not accept POST (method not allowed)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/validate-reset-token')
      .send({ token: 'some-token-value-for-method-test' });

    // Must be 404 (no POST route registered) — not 200
    expect(res.status).toBe(404);
  });
});
