/**
 * server/tests/integration/auth.integration.test.js
 *
 * Boundary: real Express app (app.js), real routing/validation/controllers/
 * services, real JWT signing/verification — everything EXCEPT the database
 * layer is genuine. Repositories and the raw connection pool are mocked so
 * this suite runs without a live MySQL instance (useful for CI).
 */

// --- Mock the database layer BEFORE requiring app.js (Jest hoists these) ---
jest.mock('../../src/database/connection', () => ({
  pool: { query: jest.fn() },
  testConnection: jest.fn(),
}));

jest.mock('../../src/repositories/admin.repository', () => ({
  findByEmail: jest.fn(), findById: jest.fn(), updateById: jest.fn(),
  updateLastLogin: jest.fn(), markEmailVerified: jest.fn(),
  incrementFailedAttempts: jest.fn(), resetFailedAttempts: jest.fn(), lockUntil: jest.fn(),
  isCurrentlyLocked: jest.fn().mockReturnValue(false),
}));

jest.mock('../../src/repositories/teacher.repository', () => ({
  findByEmail: jest.fn(), findById: jest.fn(), updateById: jest.fn(),
  updateLastLogin: jest.fn(), markEmailVerified: jest.fn(), updatePassword: jest.fn(),
  incrementFailedAttempts: jest.fn(), resetFailedAttempts: jest.fn(), lockUntil: jest.fn(),
  isCurrentlyLocked: jest.fn().mockReturnValue(false),
}));

jest.mock('../../src/repositories/student.repository', () => ({
  findByUsername: jest.fn(), findById: jest.fn(), existsByUsername: jest.fn(),
  findByEmail: jest.fn(), findByMobile: jest.fn(),
  updateById: jest.fn(), updateLastLogin: jest.fn(), updatePassword: jest.fn(), create: jest.fn(),
  incrementFailedAttempts: jest.fn(), resetFailedAttempts: jest.fn(), lockUntil: jest.fn(),
  isCurrentlyLocked: jest.fn().mockReturnValue(false),
}));

jest.mock('../../src/repositories/classroom.repository', () => ({
  findByCode: jest.fn(), existsByCode: jest.fn(),
}));

jest.mock('../../src/repositories/audit.repository', () => ({
  insert: jest.fn().mockResolvedValue(undefined),
  list: jest.fn(),
}));

jest.mock('../../src/repositories/loginHistory.repository', () => ({
  record: jest.fn().mockResolvedValue(undefined),
  listForUser: jest.fn(), countRecentFailures: jest.fn(),
}));

jest.mock('../../src/repositories/refreshToken.repository', () => ({
  insert: jest.fn().mockResolvedValue(1),
  findByHash: jest.fn(), findValidByHash: jest.fn(),
  rotate: jest.fn(), revokeById: jest.fn(), revokeAllForUser: jest.fn(),
}));

jest.mock('../../src/repositories/emailVerificationToken.repository', () => ({
  insert: jest.fn(), findValidByHash: jest.fn(), markUsed: jest.fn(), invalidateAllForUser: jest.fn(),
}));

jest.mock('../../src/repositories/passwordResetToken.repository', () => ({
  insert: jest.fn(), findValidByHash: jest.fn(), markUsed: jest.fn(), invalidateAllForUser: jest.fn(),
}));

// Email is a real console-transport in test env (no SMTP configured) — no
// network I/O — but we still spy on it to assert it was invoked correctly.
jest.mock('../../src/services/email.service', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const bcrypt  = require('bcryptjs');
const app = require('../../app');

const teacherRepo = require('../../src/repositories/teacher.repository');
const studentRepo = require('../../src/repositories/student.repository');
const refreshTokenRepo = require('../../src/repositories/refreshToken.repository');
const emailService = require('../../src/services/email.service');
const { pool } = require('../../src/database/connection');

describe('Auth API — /api/v1/auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    teacherRepo.isCurrentlyLocked.mockReturnValue(false);
  });

  // -------------------------------------------------------------------------
  describe('POST /api/v1/auth/teacher/login', () => {
    it('returns 200 with an access + refresh token pair on valid credentials', async () => {
      const passwordHash = await bcrypt.hash('Teacher@123', 10);
      teacherRepo.findByEmail.mockResolvedValue({
        id: 42, name: 'Ms. Rao', email: 'teacher@classtrack.ai',
        password_hash: passwordHash, is_active: 1, failed_login_attempts: 0,
      });

      const res = await request(app)
        .post('/api/v1/auth/teacher/login')
        .send({ email: 'teacher@classtrack.ai', password: 'Teacher@123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data.refreshToken).toEqual(expect.any(String));
      expect(res.body.data.token).toBe(res.body.data.accessToken); // legacy alias present
      expect(res.body.data.permissions).toEqual(expect.arrayContaining(['task:create']));
      expect(res.body.data.user).toMatchObject({ id: 42, role: 'teacher' });

      expect(teacherRepo.resetFailedAttempts).toHaveBeenCalledWith(42);
    });

    it('returns 401 with a generic message on wrong password, and increments the failure counter', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword', 10);
      teacherRepo.findByEmail.mockResolvedValue({
        id: 42, name: 'Ms. Rao', email: 'teacher@classtrack.ai',
        password_hash: passwordHash, is_active: 1,
      });
      teacherRepo.incrementFailedAttempts.mockResolvedValue(1);

      const res = await request(app)
        .post('/api/v1/auth/teacher/login')
        .send({ email: 'teacher@classtrack.ai', password: 'WrongPassword' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email or password.');
      expect(teacherRepo.incrementFailedAttempts).toHaveBeenCalledWith(42);
    });

    it('returns 401 for a completely unknown email — same generic message (no user enumeration)', async () => {
      teacherRepo.findByEmail.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/auth/teacher/login')
        .send({ email: 'nobody@classtrack.ai', password: 'Whatever123' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid email or password.');
    });

    it('locks the account and returns 401 once the failure threshold is reached', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword', 10);
      teacherRepo.findByEmail.mockResolvedValue({
        id: 42, name: 'Ms. Rao', email: 'teacher@classtrack.ai',
        password_hash: passwordHash, is_active: 1,
      });
      // Simulate this being the 5th failure (default MAX_FAILED_LOGIN_ATTEMPTS)
      teacherRepo.incrementFailedAttempts.mockResolvedValue(5);

      const res = await request(app)
        .post('/api/v1/auth/teacher/login')
        .send({ email: 'teacher@classtrack.ai', password: 'WrongPassword' });

      expect(res.status).toBe(401); // this specific request still reports invalid credentials
      expect(teacherRepo.lockUntil).toHaveBeenCalledWith(42, expect.any(Date));
    });

    it('returns 403 when the account is already locked', async () => {
      teacherRepo.isCurrentlyLocked.mockReturnValue(true);
      teacherRepo.findByEmail.mockResolvedValue({
        id: 42, name: 'Ms. Rao', email: 'teacher@classtrack.ai',
        password_hash: 'irrelevant', is_active: 1,
        locked_until: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      const res = await request(app)
        .post('/api/v1/auth/teacher/login')
        .send({ email: 'teacher@classtrack.ai', password: 'Teacher@123' });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/too many failed login attempts/i);
    });

    it('returns a 400 validation error envelope for a missing password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/teacher/login')
        .send({ email: 'teacher@classtrack.ai' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation failed.');
      expect(res.body.errors.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('POST /api/v1/auth/refresh', () => {
    it('rotates a valid refresh token and returns a new pair', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue({
        id: 1, user_id: 42, user_role: 'teacher',
        revoked_at: null, expires_at: new Date(Date.now() + 100000).toISOString(),
      });
      refreshTokenRepo.insert.mockResolvedValue(2);
      teacherRepo.findById.mockResolvedValue({ id: 42, name: 'Ms. Rao', is_active: 1 });

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'a-sufficiently-long-raw-refresh-token-value' });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(refreshTokenRepo.rotate).toHaveBeenCalledWith(1, 2);
    });

    it('returns 401 and revokes every session when a rotated token is reused', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue({
        id: 1, user_id: 42, user_role: 'teacher',
        revoked_at: new Date().toISOString(), // already rotated once — this is reuse
        expires_at: new Date(Date.now() + 100000).toISOString(),
      });

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'a-sufficiently-long-raw-refresh-token-value' });

      expect(res.status).toBe(401);
      expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith(42, 'teacher');
    });

    it('returns a 400 validation error for a refresh token that is too short', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'short' });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  describe('POST /api/v1/auth/forgot-password', () => {
    const adminRepo = require('../../src/repositories/admin.repository');
    const passwordResetRepo = require('../../src/repositories/passwordResetToken.repository');

    it('returns a generic message and invokes sendPasswordResetEmail for a teacher account', async () => {
      adminRepo.findByEmail.mockResolvedValue(null);
      teacherRepo.findByEmail.mockResolvedValue({ id: 42, name: 'Ms. Rao', email: 'teacher@classtrack.ai' });
      passwordResetRepo.invalidateAllForUser.mockResolvedValue(undefined);
      passwordResetRepo.insert.mockResolvedValue(99);

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'teacher@classtrack.ai' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/if an account with that email exists/i);

      // Token was stored before the email was sent
      expect(passwordResetRepo.invalidateAllForUser).toHaveBeenCalledWith(42, 'teacher');
      expect(passwordResetRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 42, userRole: 'teacher', tokenHash: expect.any(String), expiresAt: expect.any(Date) })
      );
      // NEVER the raw token — only the hash is passed to the repo
      const insertedHash = passwordResetRepo.insert.mock.calls[0][0].tokenHash;
      expect(insertedHash).toHaveLength(64); // SHA-256 hex = 64 chars

      // Email was dispatched
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'teacher@classtrack.ai', 'Ms. Rao', expect.any(String)
      );
      // Raw token passed to email must NOT equal the stored hash
      const rawTokenPassedToEmail = emailService.sendPasswordResetEmail.mock.calls[0][2];
      expect(rawTokenPassedToEmail).not.toBe(insertedHash);
    });

    it('returns a generic message and invokes sendPasswordResetEmail for an admin account', async () => {
      adminRepo.findByEmail.mockResolvedValue({ id: 1, name: 'Super Admin', email: 'admin@classtrack.ai' });
      passwordResetRepo.invalidateAllForUser.mockResolvedValue(undefined);
      passwordResetRepo.insert.mockResolvedValue(100);

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'admin@classtrack.ai' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/if an account with that email exists/i);
      expect(passwordResetRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, userRole: 'admin' })
      );
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      // Admin is found first (before teacher lookup) — teacher repo must not be called
      expect(teacherRepo.findByEmail).not.toHaveBeenCalled();
    });

    it('returns a generic message and invokes sendPasswordResetEmail for a student account', async () => {
      adminRepo.findByEmail.mockResolvedValue(null);
      teacherRepo.findByEmail.mockResolvedValue(null);
      studentRepo.findByEmail.mockResolvedValue({ id: 2, name: 'Ganesh Sonawne', email: 'sonawneg123@gmail.com' });
      passwordResetRepo.invalidateAllForUser.mockResolvedValue(undefined);
      passwordResetRepo.insert.mockResolvedValue(101);

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('X-Forwarded-For', '10.0.5.1')
        .send({ email: 'sonawneg123@gmail.com' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/if an account with that email exists/i);

      // Token stored with correct role
      expect(passwordResetRepo.invalidateAllForUser).toHaveBeenCalledWith(2, 'student');
      expect(passwordResetRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 2, userRole: 'student', tokenHash: expect.any(String), expiresAt: expect.any(Date) })
      );
      // SHA-256 hash stored (64 hex chars), never the raw token
      const insertedHash = passwordResetRepo.insert.mock.calls[0][0].tokenHash;
      expect(insertedHash).toHaveLength(64);

      // Email dispatched with student's email and name
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'sonawneg123@gmail.com', 'Ganesh Sonawne', expect.any(String)
      );
      // Raw token passed to email != stored hash
      const rawTokenPassedToEmail = emailService.sendPasswordResetEmail.mock.calls[0][2];
      expect(rawTokenPassedToEmail).not.toBe(insertedHash);
    });

    it('resolves student email after case-normalization and whitespace trimming', async () => {
      adminRepo.findByEmail.mockResolvedValue(null);
      teacherRepo.findByEmail.mockResolvedValue(null);
      // studentRepo.findByEmail is called with the normalized (lower-trimmed) value
      studentRepo.findByEmail.mockResolvedValue({ id: 2, name: 'Ganesh Sonawne', email: 'sonawneg123@gmail.com' });
      passwordResetRepo.invalidateAllForUser.mockResolvedValue(undefined);
      passwordResetRepo.insert.mockResolvedValue(101);

      // The validator strips whitespace and normalises inside Joi; the service
      // also trims+lowercases before forwarding to the repo's findByEmail.
      // A mixed-case input still finds the student account.
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('X-Forwarded-For', '10.0.6.1')
        .send({ email: 'SONAWNEG123@GMAIL.COM' });

      expect(res.status).toBe(200);
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      expect(passwordResetRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 2, userRole: 'student' })
      );
    });

    it('returns the SAME generic message when the account does not exist (no enumeration)', async () => {
      adminRepo.findByEmail.mockResolvedValue(null);
      teacherRepo.findByEmail.mockResolvedValue(null);
      studentRepo.findByEmail.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'ghost@classtrack.ai' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/if an account with that email exists/i);
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(passwordResetRepo.insert).not.toHaveBeenCalled();
    });

    // NOTE: the forgotPasswordLimiter allows 5 requests per hour per IP.
    // Tests that need to exceed that use a distinct X-Forwarded-For IP so
    // the rate-limit counter is isolated from the other tests in this suite.

    it('returns 200 even when sendPasswordResetEmail throws (error is swallowed to prevent information leakage)', async () => {
      adminRepo.findByEmail.mockResolvedValue(null);
      teacherRepo.findByEmail.mockResolvedValue({ id: 42, name: 'Ms. Rao', email: 'teacher@classtrack.ai' });
      passwordResetRepo.invalidateAllForUser.mockResolvedValue(undefined);
      passwordResetRepo.insert.mockResolvedValue(99);
      emailService.sendPasswordResetEmail.mockRejectedValue(new Error('SMTP unavailable'));

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('X-Forwarded-For', '10.0.1.1')
        .send({ email: 'teacher@classtrack.ai' });

      // Must still return 200 — email failures must never propagate to the client
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/if an account with that email exists/i);
    });

    it('returns 200 even when student SMTP throws (SMTP failure preserves non-enumerable behavior)', async () => {
      adminRepo.findByEmail.mockResolvedValue(null);
      teacherRepo.findByEmail.mockResolvedValue(null);
      studentRepo.findByEmail.mockResolvedValue({ id: 2, name: 'Ganesh Sonawne', email: 'sonawneg123@gmail.com' });
      passwordResetRepo.invalidateAllForUser.mockResolvedValue(undefined);
      passwordResetRepo.insert.mockResolvedValue(101);
      emailService.sendPasswordResetEmail.mockRejectedValue(new Error('SMTP unavailable'));

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('X-Forwarded-For', '10.0.7.1')
        .send({ email: 'sonawneg123@gmail.com' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/if an account with that email exists/i);
    });

    it('rejects a missing email field with 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('X-Forwarded-For', '10.0.2.1')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects an invalid email format with 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('X-Forwarded-For', '10.0.3.1')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('stores a SHA-256 token hash (not the raw token) in the database', async () => {
      adminRepo.findByEmail.mockResolvedValue(null);
      teacherRepo.findByEmail.mockResolvedValue({ id: 42, name: 'Ms. Rao', email: 'teacher@classtrack.ai' });
      passwordResetRepo.invalidateAllForUser.mockResolvedValue(undefined);
      passwordResetRepo.insert.mockResolvedValue(99);

      await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('X-Forwarded-For', '10.0.4.1')
        .send({ email: 'teacher@classtrack.ai' });

      const storedHash = passwordResetRepo.insert.mock.calls[0][0].tokenHash;
      const rawToken   = emailService.sendPasswordResetEmail.mock.calls[0][2];

      // The stored value must be the SHA-256 hex hash of the raw token
      const { createHash } = require('crypto');
      expect(storedHash).toBe(createHash('sha256').update(rawToken).digest('hex'));
      // Raw token and stored hash must be different strings
      expect(rawToken).not.toBe(storedHash);
    });

    it('stores SHA-256 hash (not raw token) in the database for a student account', async () => {
      adminRepo.findByEmail.mockResolvedValue(null);
      teacherRepo.findByEmail.mockResolvedValue(null);
      studentRepo.findByEmail.mockResolvedValue({ id: 2, name: 'Ganesh Sonawne', email: 'sonawneg123@gmail.com' });
      passwordResetRepo.invalidateAllForUser.mockResolvedValue(undefined);
      passwordResetRepo.insert.mockResolvedValue(101);

      await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('X-Forwarded-For', '10.0.8.1')
        .send({ email: 'sonawneg123@gmail.com' });

      const storedHash = passwordResetRepo.insert.mock.calls[0][0].tokenHash;
      const rawToken   = emailService.sendPasswordResetEmail.mock.calls[0][2];

      const { createHash } = require('crypto');
      expect(storedHash).toBe(createHash('sha256').update(rawToken).digest('hex'));
      expect(rawToken).not.toBe(storedHash);
      expect(storedHash).toHaveLength(64); // SHA-256 hex
    });
  });

  // -------------------------------------------------------------------------
  describe('POST /api/v1/auth/logout (authenticated)', () => {
    it('requires a valid access token', async () => {
      const res = await request(app).post('/api/v1/auth/logout').send({});
      expect(res.status).toBe(401);
    });

    it('revokes the session for an authenticated request', async () => {
      // authenticate() middleware reads the account straight from the pool
      pool.query.mockResolvedValue([[{ id: 42, name: 'Ms. Rao', is_active: 1 }]]);
      refreshTokenRepo.findByHash.mockResolvedValue({ id: 7, revoked_at: null });

      const { issueAccessToken } = require('../../src/services/token.service');
      const accessToken = issueAccessToken({ id: 42, role: 'teacher', name: 'Ms. Rao' });

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken: 'a-sufficiently-long-raw-refresh-token-value' });

      expect(res.status).toBe(200);
      expect(refreshTokenRepo.revokeById).toHaveBeenCalledWith(7);
    });
  });

  // -------------------------------------------------------------------------
  describe('GET /api/v1/auth/me', () => {
    it('returns 401 with no Authorization header', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 with an invalid/garbage token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not-a-real-token');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with id, role, name, permissions, and a safe profile for a valid token (admin/teacher — email)', async () => {
      pool.query.mockResolvedValue([[{
        id: 1, name: 'Super Admin', email: 'admin@classtrack.ai', is_active: 1,
        password_hash: 'should-never-appear-in-response',
        failed_login_attempts: 0, locked_until: null,
        created_at: '2026-01-01T00:00:00.000Z', last_login_at: null,
      }]]);

      const { issueAccessToken } = require('../../src/services/token.service');
      const accessToken = issueAccessToken({ id: 1, role: 'admin', name: 'Super Admin' });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            id: 1,
            role: 'admin',
            name: 'Super Admin',
            permissions: expect.arrayContaining(['platform:manage']),
            profile: expect.objectContaining({ email: 'admin@classtrack.ai', isActive: true }),
          }),
        })
      );
      expect(JSON.stringify(res.body)).not.toMatch(/password_hash|failed_login_attempts|locked_until/);
    });

    it('returns username and classroomId (not email) for a student token', async () => {
      pool.query.mockResolvedValue([[{
        id: 9, name: 'Riya Patel', username: 'riya_patel', classroom_id: 3, is_active: 1,
        password_hash: 'irrelevant', failed_login_attempts: 0, locked_until: null,
        created_at: '2026-01-01T00:00:00.000Z', last_login_at: null,
      }]]);

      const { issueAccessToken } = require('../../src/services/token.service');
      const accessToken = issueAccessToken({ id: 9, role: 'student', name: 'Riya Patel', classroomId: 3 });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('student');
      expect(res.body.data.profile).toEqual(
        expect.objectContaining({ username: 'riya_patel', classroomId: 3 })
      );
      // Students now have an email column (nullable) — legacy students
      // registered without email will have null, not undefined.
      expect(res.body.data.profile.email).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('Response envelope consistency', () => {
    it('every error response matches { success:false, message, errors }', async () => {
      const res = await request(app).post('/api/v1/auth/teacher/login').send({});
      expect(res.body).toEqual(
        expect.objectContaining({
          success: false,
          message: expect.any(String),
          errors: expect.any(Array),
        })
      );
    });

    it('includes an X-Request-Id header on every response for log correlation', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-request-id']).toBeTruthy();
    });

    it('does not leak the X-Powered-By header (helmet)', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });
});
