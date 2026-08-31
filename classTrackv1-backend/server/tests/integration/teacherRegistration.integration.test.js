/**
 * server/tests/integration/teacherRegistration.integration.test.js
 *
 * Comprehensive integration tests for:
 *   POST /api/v1/auth/teacher/register
 *   POST /api/v1/admin/teacher-registration-codes
 *   GET  /api/v1/admin/teacher-registration-codes
 *   POST /api/v1/admin/teacher-registration-codes/:id/revoke
 *   GET  /api/v1/admin/teachers
 *   GET  /api/v1/admin/teachers/:id
 *   PATCH /api/v1/admin/teachers/:id
 *   PATCH /api/v1/admin/teachers/:id/status
 *   PATCH /api/v1/admin/teachers/:id/classroom
 *
 * Database layer is mocked (same pattern as existing integration tests).
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

jest.mock('../../src/repositories/teacher.repository', () => ({
  findByEmail:             jest.fn(),
  findByMobile:            jest.fn(),
  existsByEmail:           jest.fn(),
  existsByMobile:          jest.fn(),
  findById:                jest.fn(),
  findWithClassrooms:      jest.fn(),
  create:                  jest.fn(),
  updateById:              jest.fn(),
  setActive:               jest.fn(),
  toggleActive:            jest.fn(),
  markEmailVerified:       jest.fn(),
  updatePassword:          jest.fn(),
  updateLastLogin:         jest.fn(),
  listWithClassroomCount:  jest.fn(),
  assignClassroom:         jest.fn(),
  removeFromClassroom:     jest.fn(),
  incrementFailedAttempts: jest.fn(),
  resetFailedAttempts:     jest.fn(),
  lockUntil:               jest.fn(),
  isCurrentlyLocked:       jest.fn().mockReturnValue(false),
  countBy:                 jest.fn(),
}));

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
  getPlatformStats:        jest.fn(),
}));

jest.mock('../../src/repositories/student.repository', () => ({
  findByEmail:             jest.fn(),
  findByMobile:            jest.fn(),
  findByUsername:          jest.fn(),
  findById:                jest.fn(),
  existsByEmail:           jest.fn(),
  existsByMobile:          jest.fn(),
  existsByUsername:        jest.fn(),
  create:                  jest.fn(),
  incrementFailedAttempts: jest.fn(),
  resetFailedAttempts:     jest.fn(),
  lockUntil:               jest.fn(),
  isCurrentlyLocked:       jest.fn().mockReturnValue(false),
  updateLastLogin:         jest.fn(),
}));

jest.mock('../../src/repositories/teacherRegistrationCode.repository', () => ({
  findValidByHash:   jest.fn(),
  markUsed:          jest.fn(),
  revoke:            jest.fn(),
  create:            jest.fn(),
  listAll:           jest.fn(),
  findByIdForAdmin:  jest.fn(),
}));

jest.mock('../../src/repositories/classroom.repository', () => ({
  findByCode:              jest.fn(),
  findById:                jest.fn(),
  existsByCode:            jest.fn().mockResolvedValue(false),
  listWithTeacher:         jest.fn(),
  belongsToTeacher:        jest.fn(),
  findOwnedById:           jest.fn(),
  existsDuplicate:         jest.fn(),
  listByTeacherManaged:    jest.fn(),
  create:                  jest.fn(),
  updateFields:            jest.fn(),
  archive:                 jest.fn(),
  restore:                 jest.fn(),
  softDelete:              jest.fn(),
  regenerateCode:          jest.fn(),
  getTeacherDashboardStats: jest.fn(),
  getRecentActivity:       jest.fn(),
}));

jest.mock('../../src/repositories/audit.repository', () => ({
  insert: jest.fn().mockResolvedValue(undefined),
  list:   jest.fn(),
  count:  jest.fn().mockResolvedValue(0),
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
  insert:               jest.fn().mockResolvedValue(1),
  findValidByHash:      jest.fn(),
  markUsed:             jest.fn(),
  invalidateAllForUser: jest.fn(),
}));

jest.mock('../../src/repositories/passwordResetToken.repository', () => ({
  insert:               jest.fn(),
  findValidByHash:      jest.fn(),
  markUsed:             jest.fn(),
  invalidateAllForUser: jest.fn(),
}));

jest.mock('../../src/services/email.service', () => ({
  sendVerificationEmail:  jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

// ── Test subject ──────────────────────────────────────────────────────────────
const request   = require('supertest');
const bcrypt    = require('bcryptjs');
const app       = require('../../app');
const teacherRepo          = require('../../src/repositories/teacher.repository');
const teacherRegCodeRepo   = require('../../src/repositories/teacherRegistrationCode.repository');
const adminRepo            = require('../../src/repositories/admin.repository');
const classroomRepo        = require('../../src/repositories/classroom.repository');
const { pool }             = require('../../src/database/connection');
const { issueAccessToken } = require('../../src/services/token.service');
const { hashToken }        = require('../../src/utils/token.util');

const REGISTER_URL = '/api/v1/auth/teacher/register';
const ADMIN_CODES_URL = '/api/v1/admin/teacher-registration-codes';
const ADMIN_TEACHERS_URL = '/api/v1/admin/teachers';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const ADMIN_ACCOUNT = {
  id: 1, name: 'Super Admin', email: 'admin@classtrack.ai', is_active: true,
  password_hash: 'irrelevant', failed_login_attempts: 0, locked_until: null,
  email_verified_at: new Date().toISOString(),
};

const TEACHER_ACCOUNT = {
  id: 10, name: 'Jane Smith', email: 'jane@teacher.com', is_active: true,
  mobile_number: '+919876543210',
  password_hash: 'irrelevant', failed_login_attempts: 0, locked_until: null,
  email_verified_at: null,
};

const RAW_CODE = 'ABCD1234'; // 8-char raw code (no dash)
const VALID_CODE_HASH = hashToken(RAW_CODE);

const ACTIVE_CODE_RECORD = {
  id: 5,
  code_hash:  VALID_CODE_HASH,
  created_by: 1,
  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  used_at:    null,
  used_by:    null,
  is_revoked: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const VALID_BODY = {
  name:            'Jane Smith',
  email:           'jane@teacher.com',
  mobile:          '+919876543210',
  teacherCode:     RAW_CODE,
  password:        'Secret@123',
  confirmPassword: 'Secret@123',
};

function adminToken() {
  return issueAccessToken({ id: ADMIN_ACCOUNT.id, role: 'admin', name: ADMIN_ACCOUNT.name });
}
function teacherToken() {
  return issueAccessToken({ id: TEACHER_ACCOUNT.id, role: 'teacher', name: TEACHER_ACCOUNT.name });
}

beforeEach(() => {
  jest.clearAllMocks();
  // Happy-path defaults
  teacherRepo.existsByEmail.mockResolvedValue(false);
  teacherRepo.existsByMobile.mockResolvedValue(false);
  teacherRepo.create.mockResolvedValue(10);
  teacherRegCodeRepo.findValidByHash.mockResolvedValue(ACTIVE_CODE_RECORD);
  teacherRegCodeRepo.markUsed.mockResolvedValue(undefined);
  pool.query.mockResolvedValue([[ADMIN_ACCOUNT]]);
});

// ============================================================================
// TEACHER REGISTRATION
// ============================================================================

describe('POST /api/v1/auth/teacher/register — valid code', () => {
  it('returns 201 with tokens and role=teacher on valid input', async () => {
    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.user.role).toBe('teacher');
    expect(res.body.data.user.email).toBe('jane@teacher.com');
  });

  it('creates the teacher with hashed password (raw password NOT stored)', async () => {
    await request(app).post(REGISTER_URL).send(VALID_BODY);
    const createCall = teacherRepo.create.mock.calls[0][0];
    expect(createCall.password_hash).toBeDefined();
    expect(createCall.password_hash).not.toBe(VALID_BODY.password);
    const match = await bcrypt.compare(VALID_BODY.password, createCall.password_hash);
    expect(match).toBe(true);
  });

  it('marks the registration code as used after successful registration', async () => {
    await request(app).post(REGISTER_URL).send(VALID_BODY);
    expect(teacherRegCodeRepo.markUsed).toHaveBeenCalledWith(ACTIVE_CODE_RECORD.id, 10);
  });

  it('returns teacher permissions (not student, not admin)', async () => {
    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);
    expect(res.body.data.permissions).toContain('classroom:manage_own');
    expect(res.body.data.permissions).not.toContain('platform:manage');
    expect(res.body.data.permissions).not.toContain('submission:submit');
  });

  it('does NOT include password_hash in the response', async () => {
    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash/);
    expect(res.body.data?.user?.password_hash).toBeUndefined();
  });

  it('always sets role=teacher regardless of client payload', async () => {
    // Attempt to inject a different role — backend must ignore it
    const res = await request(app).post(REGISTER_URL)
      .send({ ...VALID_BODY, role: 'admin' });
    // Still succeeds (Joi strips unknown keys with stripUnknown in validate.middleware)
    // or rejects with 400 — either way role must never become admin
    if (res.status === 201) {
      expect(res.body.data.user.role).toBe('teacher');
    } else {
      // 400 is also acceptable — unknown 'role' field may cause validation failure
      expect([400, 201]).toContain(res.status);
    }
  });
});

describe('POST /api/v1/auth/teacher/register — teacher code validation', () => {
  it('returns 400 when teacherCode is missing', async () => {
    const { teacherCode: _omit, ...body } = VALID_BODY;
    const res = await request(app).post(REGISTER_URL).send(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(teacherRepo.create).not.toHaveBeenCalled();
  });

  it('returns 400 when teacher code is invalid (not in DB)', async () => {
    teacherRegCodeRepo.findValidByHash.mockResolvedValue(null);
    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(teacherRepo.create).not.toHaveBeenCalled();
  });

  it('returns 400 when teacher code is revoked (findValidByHash returns null for revoked)', async () => {
    teacherRegCodeRepo.findValidByHash.mockResolvedValue(null);
    const res = await request(app).post(REGISTER_URL)
      .send({ ...VALID_BODY, teacherCode: 'REVOKED1' });
    expect(res.status).toBe(400);
    expect(teacherRepo.create).not.toHaveBeenCalled();
  });

  it('returns 400 when teacher code is expired (findValidByHash returns null for expired)', async () => {
    teacherRegCodeRepo.findValidByHash.mockResolvedValue(null);
    const res = await request(app).post(REGISTER_URL)
      .send({ ...VALID_BODY, teacherCode: 'EXPIRED1' });
    expect(res.status).toBe(400);
    expect(teacherRepo.create).not.toHaveBeenCalled();
  });

  it('returns 400 when teacher code was already used (findValidByHash returns null for used)', async () => {
    teacherRegCodeRepo.findValidByHash.mockResolvedValue(null);
    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);
    expect(res.status).toBe(400);
    expect(teacherRepo.create).not.toHaveBeenCalled();
  });

  it('does NOT reveal the raw teacher code in any error response', async () => {
    teacherRegCodeRepo.findValidByHash.mockResolvedValue(null);
    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);
    expect(JSON.stringify(res.body)).not.toMatch(/ABCD1234/);
  });
});

describe('POST /api/v1/auth/teacher/register — validation errors', () => {
  it('returns 400 when email is missing', async () => {
    const { email: _omit, ...body } = VALID_BODY;
    const res = await request(app).post(REGISTER_URL).send(body);
    expect(res.status).toBe(400);
    expect(teacherRepo.create).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app).post(REGISTER_URL)
      .send({ ...VALID_BODY, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is too short (< 8 chars)', async () => {
    const res = await request(app).post(REGISTER_URL)
      .send({ ...VALID_BODY, password: 'Ab1', confirmPassword: 'Ab1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when passwords do not match', async () => {
    const res = await request(app).post(REGISTER_URL)
      .send({ ...VALID_BODY, confirmPassword: 'DifferentPass@999' });
    expect(res.status).toBe(400);
    expect(res.body.errors.join(' ')).toMatch(/do not match/i);
  });

  it('returns 400 when name is missing', async () => {
    const { name: _omit, ...body } = VALID_BODY;
    const res = await request(app).post(REGISTER_URL).send(body);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/teacher/register — duplicate detection', () => {
  it('returns 409 "Unable to create" when email is already registered (non-enumerable message)', async () => {
    teacherRepo.existsByEmail.mockResolvedValue(true);
    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/unable to create/i);
  });

  it('returns 409 "Unable to create" when mobile is already registered (non-enumerable message)', async () => {
    teacherRepo.existsByMobile.mockResolvedValue(true);
    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/unable to create/i);
  });

  it('returns the same message for email and mobile conflicts (no enumeration)', async () => {
    teacherRepo.existsByEmail.mockResolvedValue(true);
    const emailRes = await request(app).post(REGISTER_URL).send(VALID_BODY);

    jest.clearAllMocks();
    teacherRegCodeRepo.findValidByHash.mockResolvedValue(ACTIVE_CODE_RECORD);
    teacherRepo.existsByEmail.mockResolvedValue(false);
    teacherRepo.existsByMobile.mockResolvedValue(true);
    const mobileRes = await request(app).post(REGISTER_URL).send(VALID_BODY);

    expect(emailRes.body.message).toBe(mobileRes.body.message);
  });
});

// ============================================================================
// ADMIN — TEACHER REGISTRATION CODES
// ============================================================================

describe('POST /api/v1/admin/teacher-registration-codes', () => {
  beforeEach(() => {
    pool.query.mockResolvedValue([[ADMIN_ACCOUNT]]);
    teacherRegCodeRepo.create.mockResolvedValue(5);
  });

  it('requires authentication', async () => {
    const res = await request(app).post(ADMIN_CODES_URL);
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin token (403)', async () => {
    pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
    const res = await request(app)
      .post(ADMIN_CODES_URL)
      .set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(403);
  });

  it('creates a code and returns it with display format XXXX-XXXX', async () => {
    const res = await request(app)
      .post(ADMIN_CODES_URL)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.expiresAt).toBeDefined();
  });

  it('does NOT return code_hash in the response', async () => {
    const res = await request(app)
      .post(ADMIN_CODES_URL)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});
    expect(JSON.stringify(res.body)).not.toMatch(/code_hash/);
    expect(JSON.stringify(res.body)).not.toMatch(/hash/);
  });

  it('stores only the hash in the DB (not the raw code)', async () => {
    const res = await request(app)
      .post(ADMIN_CODES_URL)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});

    expect(res.status).toBe(201);
    const createCall = teacherRegCodeRepo.create.mock.calls[0][0];
    expect(createCall.code_hash).toBeDefined();
    // The stored hash should be 64 hex chars (SHA-256)
    expect(createCall.code_hash).toMatch(/^[0-9a-f]{64}$/);
    // The display code (XXXX-XXXX) should NOT be the same value as the stored hash
    const displayCode = res.body.data.code;
    expect(createCall.code_hash).not.toBe(displayCode);
    expect(createCall.code_hash).not.toBe(displayCode.replace(/-/g, ''));
  });

  it('respects custom expiresInHours', async () => {
    const res = await request(app)
      .post(ADMIN_CODES_URL)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ expiresInHours: 48 });
    expect(res.status).toBe(201);
  });
});

describe('GET /api/v1/admin/teacher-registration-codes', () => {
  beforeEach(() => {
    pool.query.mockResolvedValue([[ADMIN_ACCOUNT]]);
  });

  it('requires authentication', async () => {
    const res = await request(app).get(ADMIN_CODES_URL);
    expect(res.status).toBe(401);
  });

  it('rejects non-admin (403)', async () => {
    pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
    const res = await request(app)
      .get(ADMIN_CODES_URL)
      .set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(403);
  });

  it('lists codes without exposing code_hash', async () => {
    teacherRegCodeRepo.listAll.mockResolvedValue({
      rows: [{
        id: 5, created_by: 1, created_by_name: 'Super Admin',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        used_at: null, used_by: null, is_revoked: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
      total: 1,
    });

    const res = await request(app)
      .get(ADMIN_CODES_URL)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.codes).toHaveLength(1);
    expect(res.body.data.codes[0].status).toBe('active');
    expect(JSON.stringify(res.body)).not.toMatch(/code_hash/);
  });
});

describe('POST /api/v1/admin/teacher-registration-codes/:id/revoke', () => {
  beforeEach(() => {
    pool.query.mockResolvedValue([[ADMIN_ACCOUNT]]);
    teacherRegCodeRepo.findByIdForAdmin.mockResolvedValue({
      id: 5, is_revoked: false, used_at: null,
    });
    teacherRegCodeRepo.revoke.mockResolvedValue(undefined);
  });

  it('requires admin auth', async () => {
    const res = await request(app).post(`${ADMIN_CODES_URL}/5/revoke`);
    expect(res.status).toBe(401);
  });

  it('rejects non-admin', async () => {
    pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
    const res = await request(app)
      .post(`${ADMIN_CODES_URL}/5/revoke`)
      .set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(403);
  });

  it('revokes an active code successfully', async () => {
    const res = await request(app)
      .post(`${ADMIN_CODES_URL}/5/revoke`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    // Route params are strings; the service passes them through as-is
    expect(teacherRegCodeRepo.revoke).toHaveBeenCalledWith('5');
  });

  it('returns 404 for non-existent code', async () => {
    teacherRegCodeRepo.findByIdForAdmin.mockResolvedValue(null);
    const res = await request(app)
      .post(`${ADMIN_CODES_URL}/999/revoke`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });

  it('returns 400 when trying to revoke an already-revoked code', async () => {
    teacherRegCodeRepo.findByIdForAdmin.mockResolvedValue({ id: 5, is_revoked: true, used_at: null });
    const res = await request(app)
      .post(`${ADMIN_CODES_URL}/5/revoke`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 when trying to revoke an already-used code', async () => {
    teacherRegCodeRepo.findByIdForAdmin.mockResolvedValue({
      id: 5, is_revoked: false, used_at: new Date().toISOString(),
    });
    const res = await request(app)
      .post(`${ADMIN_CODES_URL}/5/revoke`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// ADMIN — TEACHER MANAGEMENT
// ============================================================================

describe('GET /api/v1/admin/teachers', () => {
  it('requires admin auth', async () => {
    const res = await request(app).get(ADMIN_TEACHERS_URL);
    expect(res.status).toBe(401);
  });

  it('rejects non-admin', async () => {
    pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
    const res = await request(app)
      .get(ADMIN_TEACHERS_URL)
      .set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(403);
  });

  it('lists teachers without sensitive fields', async () => {
    pool.query.mockResolvedValue([[ADMIN_ACCOUNT]]);
    teacherRepo.listWithClassroomCount.mockResolvedValue({
      rows: [TEACHER_ACCOUNT],
      total: 1,
    });

    const res = await request(app)
      .get(ADMIN_TEACHERS_URL)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash/);
  });
});

describe('GET /api/v1/admin/teachers/:id', () => {
  it('requires admin auth', async () => {
    const res = await request(app).get(`${ADMIN_TEACHERS_URL}/10`);
    expect(res.status).toBe(401);
  });

  it('returns teacher detail without sensitive fields', async () => {
    pool.query.mockResolvedValue([[ADMIN_ACCOUNT]]);
    teacherRepo.findWithClassrooms.mockResolvedValue({
      ...TEACHER_ACCOUNT,
      classrooms: [{ id: 1, name: 'Grade 10A', classCode: 'ABCD1234' }],
      email_verified_at: null,
    });

    const res = await request(app)
      .get(`${ADMIN_TEACHERS_URL}/10`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash/);
    expect(JSON.stringify(res.body)).not.toMatch(/failed_login_attempts/);
    expect(JSON.stringify(res.body)).not.toMatch(/locked_until/);
  });

  it('returns 404 for non-existent teacher', async () => {
    pool.query.mockResolvedValue([[ADMIN_ACCOUNT]]);
    teacherRepo.findWithClassrooms.mockResolvedValue(null);
    const res = await request(app)
      .get(`${ADMIN_TEACHERS_URL}/999`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/admin/teachers/:id/status', () => {
  it('requires admin auth', async () => {
    const res = await request(app)
      .patch(`${ADMIN_TEACHERS_URL}/10/status`)
      .send({ isActive: false });
    expect(res.status).toBe(401);
  });

  it('can deactivate a teacher', async () => {
    pool.query.mockResolvedValue([[ADMIN_ACCOUNT]]);
    teacherRepo.findById.mockResolvedValue({ ...TEACHER_ACCOUNT, is_active: true });
    teacherRepo.setActive.mockResolvedValue(1);

    const res = await request(app)
      .patch(`${ADMIN_TEACHERS_URL}/10/status`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    // Joi coerces the route param string to number via Joi.number()
    expect(teacherRepo.setActive).toHaveBeenCalledWith(10, false);
  });

  it('can reactivate a teacher', async () => {
    pool.query.mockResolvedValue([[ADMIN_ACCOUNT]]);
    teacherRepo.findById.mockResolvedValue({ ...TEACHER_ACCOUNT, is_active: false });
    teacherRepo.setActive.mockResolvedValue(1);

    const res = await request(app)
      .patch(`${ADMIN_TEACHERS_URL}/10/status`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ isActive: true });

    expect(res.status).toBe(200);
    // Joi coerces the route param string to number via Joi.number()
    expect(teacherRepo.setActive).toHaveBeenCalledWith(10, true);
  });

  it('returns 400 when isActive is missing', async () => {
    pool.query.mockResolvedValue([[ADMIN_ACCOUNT]]);
    const res = await request(app)
      .patch(`${ADMIN_TEACHERS_URL}/10/status`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/v1/admin/teachers/:id/classroom', () => {
  it('requires admin auth', async () => {
    const res = await request(app)
      .patch(`${ADMIN_TEACHERS_URL}/10/classroom`)
      .send({ classroomId: 1 });
    expect(res.status).toBe(401);
  });

  it('assigns classroom to teacher', async () => {
    pool.query.mockResolvedValue([[ADMIN_ACCOUNT]]);
    teacherRepo.findById.mockResolvedValue(TEACHER_ACCOUNT);
    classroomRepo.findById.mockResolvedValue({ id: 1, name: 'Class A', deleted_at: null, teacher_id: 99 });
    teacherRepo.assignClassroom.mockResolvedValue(undefined);

    const res = await request(app)
      .patch(`${ADMIN_TEACHERS_URL}/10/classroom`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ classroomId: 1 });

    expect(res.status).toBe(200);
    // Joi coerces the route param to number; classroomId from body is already number
    expect(teacherRepo.assignClassroom).toHaveBeenCalledWith(10, 1);
  });

  it('returns 400 when classroomId is missing', async () => {
    pool.query.mockResolvedValue([[ADMIN_ACCOUNT]]);
    const res = await request(app)
      .patch(`${ADMIN_TEACHERS_URL}/10/classroom`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when teacher does not exist', async () => {
    pool.query.mockResolvedValue([[ADMIN_ACCOUNT]]);
    teacherRepo.findById.mockResolvedValue(null);
    const res = await request(app)
      .patch(`${ADMIN_TEACHERS_URL}/10/classroom`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ classroomId: 1 });
    expect(res.status).toBe(404);
  });
});

// ============================================================================
// SECURITY — role escalation & sensitive field exposure
// ============================================================================

describe('Security — teacher registration', () => {
  it('teacher registered via this endpoint has teacher permissions (not admin)', async () => {
    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);
    if (res.status === 201) {
      const permissions = res.body.data.permissions;
      expect(permissions).not.toContain('platform:manage');
      expect(permissions).not.toContain('teacher:create');
      expect(permissions).not.toContain('teacher:manage');
    }
  });

  it('raw teacher code is never returned in any response', async () => {
    teacherRegCodeRepo.findValidByHash.mockResolvedValue(null);
    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);
    // The raw code (ABCD1234) should never appear in any error response
    expect(JSON.stringify(res.body)).not.toMatch(/ABCD1234/);
  });

  it('non-admin cannot access teacher registration codes endpoint', async () => {
    pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
    const res = await request(app)
      .post(ADMIN_CODES_URL)
      .set('Authorization', `Bearer ${teacherToken()}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('response does not contain SQL errors or stack traces on DB failure', async () => {
    teacherRegCodeRepo.findValidByHash.mockRejectedValue(new Error('connection refused to db'));
    const res = await request(app).post(REGISTER_URL).send(VALID_BODY);
    expect(res.status).toBe(500);
    expect(res.body.message).not.toMatch(/connection refused/i);
    expect(res.body.message).not.toMatch(/stack/i);
  });
});
