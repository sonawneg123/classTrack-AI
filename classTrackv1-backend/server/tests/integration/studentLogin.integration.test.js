/**
 * server/tests/integration/studentLogin.integration.test.js
 *
 * Integration tests for POST /api/v1/auth/student/login — supports both
 * email and mobile number as the identifier.
 *
 * Boundary: real Express app, real routing/validation/controllers/services,
 * real JWT signing — only the database layer is mocked.
 */

// ── Mock database layer BEFORE requiring app ─────────────────────────────────

jest.mock('../../src/middleware/rateLimiter.middleware', () => {
  const passThrough = (_req, _res, next) => next();
  return {
    loginLimiter:          passThrough,
    registerLimiter:       passThrough,
    refreshLimiter:        passThrough,
    forgotPasswordLimiter: passThrough,
  };
});

jest.mock('../../src/database/connection', () => ({
  pool: { query: jest.fn() },
  testConnection: jest.fn(),
}));

jest.mock('../../src/repositories/student.repository', () => ({
  findByEmail:      jest.fn(),
  findByMobile:     jest.fn(),
  findById:         jest.fn(),
  existsByEmail:    jest.fn(),
  existsByMobile:   jest.fn(),
  existsByUsername: jest.fn(),
  create:           jest.fn(),
  updateLastLogin:  jest.fn(),
  incrementFailedAttempts: jest.fn(),
  resetFailedAttempts:     jest.fn(),
  lockUntil:               jest.fn(),
  isCurrentlyLocked:       jest.fn().mockReturnValue(false),
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

jest.mock('../../src/repositories/classroom.repository', () => ({
  findByCode: jest.fn(),
}));

jest.mock('../../src/repositories/audit.repository', () => ({
  insert: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/repositories/loginHistory.repository', () => ({
  record: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/repositories/refreshToken.repository', () => ({
  insert:           jest.fn().mockResolvedValue(1),
  findByHash:       jest.fn(),
  findValidByHash:  jest.fn(),
  rotate:           jest.fn(),
  revokeById:       jest.fn(),
  revokeAllForUser: jest.fn(),
}));

jest.mock('../../src/repositories/emailVerificationToken.repository', () => ({
  insert: jest.fn(), findValidByHash: jest.fn(),
  markUsed: jest.fn(), invalidateAllForUser: jest.fn(),
}));

jest.mock('../../src/repositories/passwordResetToken.repository', () => ({
  insert: jest.fn(), findValidByHash: jest.fn(),
  markUsed: jest.fn(), invalidateAllForUser: jest.fn(),
}));

jest.mock('../../src/services/email.service', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

// ── Test subject ──────────────────────────────────────────────────────────────

const request     = require('supertest');
const bcrypt      = require('bcryptjs');
const app         = require('../../app');
const studentRepo = require('../../src/repositories/student.repository');

const LOGIN_URL = '/api/v1/auth/student/login';

const PASSWORD = 'StudentPass@123';

beforeEach(async () => {
  jest.clearAllMocks();
  studentRepo.isCurrentlyLocked.mockReturnValue(false);
});

async function makeStudent(overrides = {}) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  return {
    id: 99, name: 'Riya Patel',
    email: 'riya.patel@student.com',
    mobile_number: '+919876543210',
    password_hash: passwordHash,
    is_active: true,
    classroom_id: 7,
    failed_login_attempts: 0,
    locked_until: null,
    ...overrides,
  };
}

// ── Email login ──────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/student/login — email identifier', () => {
  it('returns 200 with token pair when email + password are valid', async () => {
    const student = await makeStudent();
    studentRepo.findByEmail.mockResolvedValue(student);

    const res = await request(app)
      .post(LOGIN_URL)
      .send({ identifier: 'riya.patel@student.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ id: 99, role: 'student', name: 'Riya Patel' });
  });

  it('normalizes email to lowercase before lookup', async () => {
    const student = await makeStudent();
    studentRepo.findByEmail.mockResolvedValue(student);

    await request(app)
      .post(LOGIN_URL)
      .send({ identifier: 'RIYA.PATEL@STUDENT.COM', password: PASSWORD });

    expect(studentRepo.findByEmail).toHaveBeenCalledWith('riya.patel@student.com');
  });

  it('returns 401 on wrong password (generic message — no account enumeration)', async () => {
    const student = await makeStudent();
    studentRepo.findByEmail.mockResolvedValue(student);
    studentRepo.incrementFailedAttempts.mockResolvedValue(1);

    const res = await request(app)
      .post(LOGIN_URL)
      .send({ identifier: 'riya.patel@student.com', password: 'WrongPass@999' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email/mobile or password.');
  });

  it('returns 401 for unknown email — same generic message', async () => {
    studentRepo.findByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post(LOGIN_URL)
      .send({ identifier: 'ghost@student.com', password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email/mobile or password.');
  });
});

// ── Mobile login ─────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/student/login — mobile identifier', () => {
  it('returns 200 when E.164 mobile number + password are valid', async () => {
    const student = await makeStudent();
    studentRepo.findByMobile.mockResolvedValue(student);

    const res = await request(app)
      .post(LOGIN_URL)
      .send({ identifier: '+919876543210', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.role).toBe('student');
  });

  it('normalizes mobile to E.164 before lookup (local 10-digit format)', async () => {
    const student = await makeStudent();
    studentRepo.findByMobile.mockResolvedValue(student);

    await request(app)
      .post(LOGIN_URL)
      .send({ identifier: '9876543210', password: PASSWORD });

    // Service should normalize to E.164 and call findByMobile
    expect(studentRepo.findByMobile).toHaveBeenCalledWith('+919876543210');
    expect(studentRepo.findByEmail).not.toHaveBeenCalled();
  });

  it('normalizes leading-zero mobile (09876543210 → +919876543210)', async () => {
    const student = await makeStudent();
    studentRepo.findByMobile.mockResolvedValue(student);

    await request(app)
      .post(LOGIN_URL)
      .send({ identifier: '09876543210', password: PASSWORD });

    expect(studentRepo.findByMobile).toHaveBeenCalledWith('+919876543210');
  });

  it('returns 401 for unknown mobile — same generic message', async () => {
    studentRepo.findByMobile.mockResolvedValue(null);

    const res = await request(app)
      .post(LOGIN_URL)
      .send({ identifier: '+919999999999', password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email/mobile or password.');
  });

  it('routes to findByMobile (not findByEmail) for non-email identifiers', async () => {
    studentRepo.findByMobile.mockResolvedValue(null);

    await request(app)
      .post(LOGIN_URL)
      .send({ identifier: '+919876543210', password: PASSWORD });

    expect(studentRepo.findByMobile).toHaveBeenCalledTimes(1);
    expect(studentRepo.findByEmail).not.toHaveBeenCalled();
  });
});

// ── Lockout ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/student/login — account lockout', () => {
  it('returns 403 when the account is already locked', async () => {
    studentRepo.isCurrentlyLocked.mockReturnValue(true);
    const student = await makeStudent({
      locked_until: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    studentRepo.findByEmail.mockResolvedValue(student);

    const res = await request(app)
      .post(LOGIN_URL)
      .send({ identifier: 'riya.patel@student.com', password: PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/too many failed login attempts/i);
  });

  it('increments failed attempts counter on wrong password', async () => {
    const student = await makeStudent();
    studentRepo.findByEmail.mockResolvedValue(student);
    studentRepo.incrementFailedAttempts.mockResolvedValue(1);

    await request(app)
      .post(LOGIN_URL)
      .send({ identifier: 'riya.patel@student.com', password: 'Wrong@999' });

    expect(studentRepo.incrementFailedAttempts).toHaveBeenCalledWith(99);
  });
});

// ── Disabled account ─────────────────────────────────────────────────────────

describe('POST /api/v1/auth/student/login — disabled account', () => {
  it('returns 401 (generic) when account is disabled', async () => {
    const student = await makeStudent({ is_active: false });
    studentRepo.findByEmail.mockResolvedValue(student);
    studentRepo.incrementFailedAttempts.mockResolvedValue(1);

    const res = await request(app)
      .post(LOGIN_URL)
      .send({ identifier: 'riya.patel@student.com', password: PASSWORD });

    // Disabled accounts get the same generic 401 to avoid account status enumeration
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email/mobile or password.');
  });
});

// ── Validation ───────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/student/login — input validation', () => {
  it('returns 400 when identifier is missing', async () => {
    const res = await request(app)
      .post(LOGIN_URL)
      .send({ password: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed.');
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post(LOGIN_URL)
      .send({ identifier: 'riya.patel@student.com' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed.');
  });
});
