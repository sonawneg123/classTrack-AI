/**
 * server/tests/unit/services/resetStudentPassword.service.pg-placeholders.test.js
 *
 * Regression tests for the PostgreSQL placeholder fix in
 * teacher.service.js → resetStudentPassword().
 *
 * Previously the authorization query used MySQL-style `?` placeholders:
 *   WHERE s.id = ? AND c.teacher_id = ?
 * Fixed to PostgreSQL-style `$1`/`$2`:
 *   WHERE s.id = $1 AND c.teacher_id = $2
 *
 * Verifies:
 *   1. The SQL uses $1 and $2 (not ?).
 *   2. studentId is passed as parameter 1 ($1).
 *   3. teacherId  is passed as parameter 2 ($2).
 *   4. Existing authorization behavior: throws notFound when query returns no rows.
 *   5. Existing password hashing/update behavior: bcrypt hashes and repo.updatePassword called.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/database/connection', () => ({
  pool: { query: jest.fn() },
  testConnection: jest.fn(),
}));

jest.mock('../../../src/repositories/classroom.repository', () => ({
  belongsToTeacher: jest.fn(),
  findOwnedById:    jest.fn(),
}));

jest.mock('../../../src/repositories/task.repository', () => ({
  belongsToTeacher: jest.fn(),
}));

jest.mock('../../../src/repositories/student.repository', () => ({
  listByClassroom: jest.fn(),
  updatePassword:  jest.fn(),
}));

jest.mock('../../../src/repositories/submission.repository', () => ({
  listForClassroom: jest.fn(),
}));

jest.mock('../../../src/repositories/notification.repository', () => ({
  insertOne:              jest.fn(),
  getActiveStudentIds:    jest.fn(),
  bulkInsertForClassroom: jest.fn(),
}));

jest.mock('../../../src/repositories/audit.repository', () => ({
  insert: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
}));

jest.mock('../../../src/utils/password.util', () => ({
  generateTempPassword: jest.fn().mockReturnValue('TempPass123!'),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const { pool }      = require('../../../src/database/connection');
const studentRepo   = require('../../../src/repositories/student.repository');
const auditRepo     = require('../../../src/repositories/audit.repository');
const bcrypt        = require('bcryptjs');
const teacherService = require('../../../src/services/teacher.service');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STUDENT_ID = 42;
const TEACHER_ID = 7;
const STUDENT_ROW = { id: STUDENT_ID, name: 'Jane Doe' };

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // Default: student found (authorization passes)
  pool.query.mockResolvedValue([[STUDENT_ROW]]);
  studentRepo.updatePassword.mockResolvedValue();
  auditRepo.insert.mockResolvedValue();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resetStudentPassword — PostgreSQL placeholder regression', () => {
  it('1. authorization query uses $1 and $2 (not ?)', async () => {
    await teacherService.resetStudentPassword(STUDENT_ID, TEACHER_ID);

    const [sql] = pool.query.mock.calls[0];
    expect(sql).toContain('$1');
    expect(sql).toContain('$2');
    expect(sql).not.toContain('?');
  });

  it('2. studentId is passed as the first parameter ($1)', async () => {
    await teacherService.resetStudentPassword(STUDENT_ID, TEACHER_ID);

    const [, params] = pool.query.mock.calls[0];
    expect(params[0]).toBe(STUDENT_ID);
  });

  it('3. teacherId is passed as the second parameter ($2)', async () => {
    await teacherService.resetStudentPassword(STUDENT_ID, TEACHER_ID);

    const [, params] = pool.query.mock.calls[0];
    expect(params[1]).toBe(TEACHER_ID);
  });

  it('4a. throws notFound when authorization query returns no rows', async () => {
    pool.query.mockResolvedValue([[]]); // empty result = student not owned by teacher

    await expect(
      teacherService.resetStudentPassword(STUDENT_ID, TEACHER_ID)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('4b. does NOT throw when the student belongs to the teacher', async () => {
    await expect(
      teacherService.resetStudentPassword(STUDENT_ID, TEACHER_ID)
    ).resolves.not.toThrow();
  });

  it('5a. bcrypt.hash is called with the generated temp password', async () => {
    await teacherService.resetStudentPassword(STUDENT_ID, TEACHER_ID);
    expect(bcrypt.hash).toHaveBeenCalledWith('TempPass123!', 10);
  });

  it('5b. studentRepo.updatePassword is called with studentId and the hashed password', async () => {
    await teacherService.resetStudentPassword(STUDENT_ID, TEACHER_ID);
    expect(studentRepo.updatePassword).toHaveBeenCalledWith(STUDENT_ID, 'hashed_password');
  });

  it('5c. returns the student name and temp password on success', async () => {
    const result = await teacherService.resetStudentPassword(STUDENT_ID, TEACHER_ID);
    expect(result).toMatchObject({
      message:     `Password reset for ${STUDENT_ROW.name}.`,
      tempPassword: 'TempPass123!',
    });
  });
});
