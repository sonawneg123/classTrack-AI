/**
 * server/tests/unit/services/studentRegister.service.test.js
 *
 * Unit tests for studentRegister() in auth.service.js — P1 student
 * registration (email + mobile + name + classroom code + password).
 *
 * The database layer is fully mocked; tests exercise service-layer logic
 * only (classroom validation, duplicate detection, hashing, token issuance,
 * audit, classroom linking).
 */

// ── Mocks (must be declared before any require) ──────────────────────────────

jest.mock('../../../src/database/connection', () => ({
  pool: { query: jest.fn() },
  testConnection: jest.fn(),
}));

jest.mock('../../../src/repositories/student.repository', () => ({
  existsByEmail:    jest.fn(),
  existsByMobile:   jest.fn(),
  existsByUsername: jest.fn(),
  create:           jest.fn(),
  findById:         jest.fn(),
  findByEmail:      jest.fn(),
  findByMobile:     jest.fn(),
}));

jest.mock('../../../src/repositories/admin.repository', () => ({
  findByEmail: jest.fn(), findById: jest.fn(), updateById: jest.fn(),
  updateLastLogin: jest.fn(), markEmailVerified: jest.fn(),
  incrementFailedAttempts: jest.fn(), resetFailedAttempts: jest.fn(), lockUntil: jest.fn(),
  isCurrentlyLocked: jest.fn().mockReturnValue(false),
}));

jest.mock('../../../src/repositories/teacher.repository', () => ({
  findByEmail: jest.fn(), findById: jest.fn(), updateById: jest.fn(),
  updateLastLogin: jest.fn(), markEmailVerified: jest.fn(), updatePassword: jest.fn(),
  incrementFailedAttempts: jest.fn(), resetFailedAttempts: jest.fn(), lockUntil: jest.fn(),
  isCurrentlyLocked: jest.fn().mockReturnValue(false),
}));

jest.mock('../../../src/repositories/classroom.repository', () => ({
  findByCode: jest.fn(),
}));

jest.mock('../../../src/repositories/audit.repository', () => ({
  insert: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/repositories/loginHistory.repository', () => ({
  record: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/repositories/refreshToken.repository', () => ({
  insert:           jest.fn().mockResolvedValue(1),
  findByHash:       jest.fn(),
  findValidByHash:  jest.fn(),
  rotate:           jest.fn(),
  revokeById:       jest.fn(),
  revokeAllForUser: jest.fn(),
}));

jest.mock('../../../src/repositories/emailVerificationToken.repository', () => ({
  insert: jest.fn(), findValidByHash: jest.fn(),
  markUsed: jest.fn(), invalidateAllForUser: jest.fn(),
}));

jest.mock('../../../src/repositories/passwordResetToken.repository', () => ({
  insert: jest.fn(), findValidByHash: jest.fn(),
  markUsed: jest.fn(), invalidateAllForUser: jest.fn(),
}));

jest.mock('../../../src/services/email.service', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

// ── Test subject ──────────────────────────────────────────────────────────────

const authService    = require('../../../src/services/auth.service');
const studentRepo    = require('../../../src/repositories/student.repository');
const classroomRepo  = require('../../../src/repositories/classroom.repository');
const auditRepo      = require('../../../src/repositories/audit.repository');
const bcrypt         = require('bcryptjs');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ACTIVE_CLASSROOM = {
  id: 7, name: 'Grade 10A', is_active: true, deleted_at: null,
  class_code: 'DEMO1234', teacher_id: 1,
};

const VALID_PAYLOAD = {
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

describe('authService.studentRegister — valid registration', () => {
  it('creates a student and returns tokens + safe user object', async () => {
    const result = await authService.studentRegister(VALID_PAYLOAD);

    expect(studentRepo.create).toHaveBeenCalledTimes(1);
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.token).toBe(result.accessToken); // legacy alias
    expect(result.permissions).toEqual(expect.any(Array));
    expect(result.user).toMatchObject({
      id:    42,
      email: 'riya.patel@student.com',
      name:  'Riya Patel',
      role:  'student',
    });
  });

  it('links the student to the classroom_id resolved from the code', async () => {
    await authService.studentRegister(VALID_PAYLOAD);

    const createCall = studentRepo.create.mock.calls[0][0];
    expect(createCall.classroom_id).toBe(ACTIVE_CLASSROOM.id);
  });

  it('hashes the password before storing — never stores plaintext', async () => {
    await authService.studentRegister(VALID_PAYLOAD);

    const createCall = studentRepo.create.mock.calls[0][0];
    expect(createCall.password_hash).toBeDefined();
    expect(createCall.password_hash).not.toBe(VALID_PAYLOAD.password);
    const isValid = await bcrypt.compare(VALID_PAYLOAD.password, createCall.password_hash);
    expect(isValid).toBe(true);
  });

  it('stores the normalized mobile in E.164 format', async () => {
    await authService.studentRegister({ ...VALID_PAYLOAD, mobile: '09876543210' });

    const createCall = studentRepo.create.mock.calls[0][0];
    expect(createCall.mobile_number).toBe('+919876543210');
  });

  it('stores mobile from +91 format unchanged', async () => {
    await authService.studentRegister({ ...VALID_PAYLOAD, mobile: '+91 9876 543210' });

    const createCall = studentRepo.create.mock.calls[0][0];
    expect(createCall.mobile_number).toBe('+919876543210');
  });

  it('normalizes email to lowercase before storage', async () => {
    await authService.studentRegister({ ...VALID_PAYLOAD, email: 'RIYA.PATEL@STUDENT.COM' });

    const createCall = studentRepo.create.mock.calls[0][0];
    expect(createCall.email).toBe('riya.patel@student.com');
  });

  it('does NOT return password_hash or any sensitive field', async () => {
    const result = await authService.studentRegister(VALID_PAYLOAD);

    expect(result.user.password_hash).toBeUndefined();
    expect(result.user.mobile_number).toBeUndefined();
    expect(result.user.username).toBeUndefined();
  });

  it('records an audit entry on successful registration', async () => {
    await authService.studentRegister(VALID_PAYLOAD);

    expect(auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'student_registered',
        actorType: 'student',
        actorId: 42,
        details: expect.objectContaining({ classroomId: ACTIVE_CLASSROOM.id }),
      })
    );
  });

  it('issues tokens with the student role', async () => {
    const result = await authService.studentRegister(VALID_PAYLOAD);

    expect(result.user.role).toBe('student');
    expect(result.permissions).toEqual(expect.any(Array));
  });
});

// ── Classroom code validation ─────────────────────────────────────────────────

describe('authService.studentRegister — classroom code validation', () => {
  it('throws 400 when classCode is missing', async () => {
    await expect(
      authService.studentRegister({ ...VALID_PAYLOAD, classCode: '' })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(classroomRepo.findByCode).not.toHaveBeenCalled();
    expect(studentRepo.create).not.toHaveBeenCalled();
  });

  it('throws 404 when classroom code does not exist', async () => {
    classroomRepo.findByCode.mockResolvedValue(null);

    await expect(
      authService.studentRegister(VALID_PAYLOAD)
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(studentRepo.create).not.toHaveBeenCalled();
  });

  it('throws 400 when classroom is inactive', async () => {
    classroomRepo.findByCode.mockResolvedValue({ ...ACTIVE_CLASSROOM, is_active: false });

    await expect(
      authService.studentRegister(VALID_PAYLOAD)
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(studentRepo.create).not.toHaveBeenCalled();
  });

  it('throws 400 when classroom is soft-deleted', async () => {
    classroomRepo.findByCode.mockResolvedValue({
      ...ACTIVE_CLASSROOM,
      deleted_at: new Date().toISOString(),
    });

    await expect(
      authService.studentRegister(VALID_PAYLOAD)
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(studentRepo.create).not.toHaveBeenCalled();
  });

  it('normalizes classCode to UPPERCASE before lookup', async () => {
    await authService.studentRegister({ ...VALID_PAYLOAD, classCode: 'demo1234' });

    expect(classroomRepo.findByCode).toHaveBeenCalledWith('DEMO1234');
  });
});

// ── Duplicate detection ───────────────────────────────────────────────────────

describe('authService.studentRegister — duplicate detection', () => {
  it('throws 409 "User already exists" when email is already registered', async () => {
    studentRepo.existsByEmail.mockResolvedValue(true);

    await expect(authService.studentRegister(VALID_PAYLOAD)).rejects.toMatchObject({
      statusCode: 409,
      message: 'User already exists.',
    });

    expect(studentRepo.create).not.toHaveBeenCalled();
  });

  it('throws 409 "User already exists" when mobile is already registered', async () => {
    studentRepo.existsByEmail.mockResolvedValue(false);
    studentRepo.existsByMobile.mockResolvedValue(true);

    await expect(authService.studentRegister(VALID_PAYLOAD)).rejects.toMatchObject({
      statusCode: 409,
      message: 'User already exists.',
    });

    expect(studentRepo.create).not.toHaveBeenCalled();
  });

  it('does not expose WHICH field caused the conflict (email vs mobile)', async () => {
    studentRepo.existsByEmail.mockResolvedValue(true);
    const errEmail = await authService.studentRegister(VALID_PAYLOAD).catch((e) => e);

    studentRepo.existsByEmail.mockResolvedValue(false);
    studentRepo.existsByMobile.mockResolvedValue(true);
    const errMobile = await authService.studentRegister(VALID_PAYLOAD).catch((e) => e);

    expect(errEmail.message).toBe(errMobile.message);
    expect(errEmail.statusCode).toBe(errMobile.statusCode);
  });
});

// ── Password policy ───────────────────────────────────────────────────────────

describe('authService.studentRegister — password policy', () => {
  it('rejects a password shorter than 8 characters', async () => {
    await expect(
      authService.studentRegister({ ...VALID_PAYLOAD, password: 'Ab1', confirmPassword: 'Ab1' })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(studentRepo.create).not.toHaveBeenCalled();
  });
});
