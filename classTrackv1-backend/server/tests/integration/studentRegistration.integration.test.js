/**
 * server/tests/integration/studentRegistration.integration.test.js
 *
 * Integration tests for POST /api/v1/auth/student/register — P1 (with
 * mandatory classroom code).
 *
 * Boundary: real Express app, real routing/validation/controllers/services,
 * real JWT signing — only the database layer is mocked.
 */

// ── Mock database layer BEFORE requiring app ─────────────────────────────────

// Bypass rate limiters in integration tests — they use in-memory stores that
// persist across test cases and cause 429s when many requests hit the same
// endpoint within a single test run.
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
  existsByEmail:    jest.fn(),
  existsByMobile:   jest.fn(),
  existsByUsername: jest.fn(),
  create:           jest.fn(),
  findById:         jest.fn(),
  findByEmail:      jest.fn(),
  findByMobile:     jest.fn(),
  isCurrentlyLocked: jest.fn().mockReturnValue(false),
  incrementFailedAttempts: jest.fn(),
  resetFailedAttempts: jest.fn(),
  lockUntil: jest.fn(),
  updateLastLogin: jest.fn(),
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

const request    = require('supertest');
const app        = require('../../app');
const studentRepo = require('../../src/repositories/student.repository');
const classroomRepo = require('../../src/repositories/classroom.repository');

const REGISTER_URL = '/api/v1/auth/student/register';

/** Active classroom fixture */
const ACTIVE_CLASSROOM = {
  id: 7, name: 'Grade 10A', is_active: true, deleted_at: null,
  class_code: 'DEMO1234', teacher_id: 1,
};

const VALID_BODY = {
  name:            'Riya Patel',
  email:           'riya.patel@student.com',
  mobile:          '+919876543210',
  classCode:       'DEMO1234',
  password:        'Secret@123',
  confirmPassword: 'Secret@123',
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default happy-path mocks
  studentRepo.existsByEmail.mockResolvedValue(false);
  studentRepo.existsByMobile.mockResolvedValue(false);
  studentRepo.existsByUsername.mockResolvedValue(false);
  studentRepo.create.mockResolvedValue(42);
  classroomRepo.findByCode.mockResolvedValue(ACTIVE_CLASSROOM);
});

// ── Valid registration ────────────────────────────────────────────────────────

describe('POST /api/v1/auth/student/register — valid classroom code', () => {
  it('returns 201 with tokens and a safe user object on valid input', async () => {
    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({
      id:    42,
      email: 'riya.patel@student.com',
      name:  'Riya Patel',
      role:  'student',
    });
  });

  it('links the student to the classroom resolved from the code', async () => {
    await request(app).post(REGISTER_URL).send(VALID_BODY);

    const createCall = studentRepo.create.mock.calls[0][0];
    expect(createCall.classroom_id).toBe(ACTIVE_CLASSROOM.id);
  });

  it('does NOT include password_hash in the response', async () => {
    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);

    expect(res.body.data?.user?.password_hash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash/);
  });

  it('assigns the student role and returns student permissions', async () => {
    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);

    expect(res.body.data.user.role).toBe('student');
    expect(res.body.data.permissions).toEqual(
      expect.arrayContaining(['submission:submit', 'submission:view_own'])
    );
  });
});

// ── Classroom code validation ─────────────────────────────────────────────────

describe('POST /api/v1/auth/student/register — classroom code validation', () => {
  it('returns 400 when classCode is missing', async () => {
    const { classCode: _omit, ...body } = VALID_BODY;
    const res = await request(app).post(REGISTER_URL).send(body);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Validation failed.');
    expect(studentRepo.create).not.toHaveBeenCalled();
  });

  it('returns 404 when classroom code does not exist', async () => {
    classroomRepo.findByCode.mockResolvedValue(null);

    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid classroom code/i);
    expect(studentRepo.create).not.toHaveBeenCalled();
  });

  it('returns 400 when classroom is inactive', async () => {
    classroomRepo.findByCode.mockResolvedValue({ ...ACTIVE_CLASSROOM, is_active: false });

    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/inactive/i);
    expect(studentRepo.create).not.toHaveBeenCalled();
  });

  it('returns 400 when classroom has been deleted', async () => {
    classroomRepo.findByCode.mockResolvedValue({
      ...ACTIVE_CLASSROOM, deleted_at: new Date().toISOString(),
    });

    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/no longer available/i);
    expect(studentRepo.create).not.toHaveBeenCalled();
  });

  it('looks up the classroom code case-insensitively (normalized to upper)', async () => {
    await request(app)
      .post(REGISTER_URL)
      .send({ ...VALID_BODY, classCode: 'demo1234' });

    // classroomRepo.findByCode is called with the normalized uppercase code
    expect(classroomRepo.findByCode).toHaveBeenCalledWith('DEMO1234');
  });
});

// ── Duplicate detection ─────────────────────────────────────────────────────

describe('POST /api/v1/auth/student/register — duplicate detection', () => {
  it('returns 409 "User already exists" when email is taken', async () => {
    studentRepo.existsByEmail.mockResolvedValue(true);

    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('User already exists.');
  });

  it('returns 409 "User already exists" when mobile is taken', async () => {
    studentRepo.existsByEmail.mockResolvedValue(false);
    studentRepo.existsByMobile.mockResolvedValue(true);

    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('User already exists.');
  });

  it('returns the same 409 message for email and mobile conflicts (no enumeration)', async () => {
    studentRepo.existsByEmail.mockResolvedValue(true);
    const resEmail = await request(app).post(REGISTER_URL).send(VALID_BODY);

    studentRepo.existsByEmail.mockResolvedValue(false);
    studentRepo.existsByMobile.mockResolvedValue(true);
    const resMobile = await request(app).post(REGISTER_URL).send(VALID_BODY);

    expect(resEmail.status).toBe(409);
    expect(resMobile.status).toBe(409);
    expect(resEmail.body.message).toBe(resMobile.body.message);
  });
});

// ── Validation errors ───────────────────────────────────────────────────────

describe('POST /api/v1/auth/student/register — validation', () => {
  it('returns 400 when email is missing', async () => {
    const { email: _omit, ...body } = VALID_BODY;
    const res = await request(app).post(REGISTER_URL).send(body);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Validation failed.');
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it('returns 400 when email format is invalid', async () => {
    const res = await request(app)
      .post(REGISTER_URL)
      .send({ ...VALID_BODY, email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed.');
  });

  it('returns 400 when mobile is missing', async () => {
    const { mobile: _omit, ...body } = VALID_BODY;
    const res = await request(app).post(REGISTER_URL).send(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed.');
  });

  it('returns 400 when mobile format is invalid', async () => {
    const res = await request(app)
      .post(REGISTER_URL)
      .send({ ...VALID_BODY, mobile: 'not-a-phone' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed.');
  });

  it('returns 400 when name is missing', async () => {
    const { name: _omit, ...body } = VALID_BODY;
    const res = await request(app).post(REGISTER_URL).send(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed.');
  });

  it('returns 400 when password is missing', async () => {
    const { password: _omit, ...body } = VALID_BODY;
    const res = await request(app).post(REGISTER_URL).send(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed.');
  });

  it('returns 400 when passwords do not match', async () => {
    const res = await request(app)
      .post(REGISTER_URL)
      .send({ ...VALID_BODY, confirmPassword: 'DifferentPassword@456' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed.');
    expect(res.body.errors.join(' ')).toMatch(/do not match/i);
  });

  it('returns 400 when password is too short (< 8 chars)', async () => {
    const res = await request(app)
      .post(REGISTER_URL)
      .send({ ...VALID_BODY, password: 'Ab1', confirmPassword: 'Ab1' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed.');
  });
});

// ── Response security ───────────────────────────────────────────────────────

describe('POST /api/v1/auth/student/register — response security', () => {
  it('does not include SQL errors, stack traces, or internal details in error responses', async () => {
    studentRepo.existsByEmail.mockRejectedValue(new Error('connection refused'));

    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);

    expect(res.status).toBe(500);
    expect(res.body.message).not.toMatch(/connection refused/i);
    expect(res.body.message).not.toMatch(/stack/i);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });
});
