/**
 * server/tests/unit/services/teacherReport.service.pg-placeholders.test.js
 *
 * Regression tests for the PostgreSQL placeholder fix in
 * teacher.service.js → buildClassroomReportData().
 *
 * Previously lines 249-250 used MySQL-style `?` placeholders.
 * Fixed to use PostgreSQL-style `$1` placeholders.
 *
 * Verifies:
 *   A. Both pool.query calls inside buildClassroomReportData use $1 (not ?).
 *   B. The classroomId value is passed as the $1 parameter in both queries.
 *   D. The function still assembles studentRows correctly on success.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../src/database/connection', () => ({
  pool: { query: jest.fn() },
  testConnection: jest.fn(),
}));

jest.mock('../../../src/repositories/classroom.repository', () => ({
  belongsToTeacher:  jest.fn(),
  findOwnedById:     jest.fn(),
}));

jest.mock('../../../src/repositories/task.repository', () => ({
  belongsToTeacher: jest.fn(),
}));

jest.mock('../../../src/repositories/student.repository', () => ({
  listByClassroom: jest.fn(),
}));

jest.mock('../../../src/repositories/submission.repository', () => ({
  listForClassroom: jest.fn(),
}));

jest.mock('../../../src/repositories/notification.repository', () => ({
  insertOne: jest.fn(),
  getActiveStudentIds: jest.fn(),
  bulkInsertForClassroom: jest.fn(),
}));

jest.mock('../../../src/repositories/audit.repository', () => ({
  insert: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const { pool }        = require('../../../src/database/connection');
const classroomRepo   = require('../../../src/repositories/classroom.repository');
const submissionRepo  = require('../../../src/repositories/submission.repository');
const teacherService  = require('../../../src/services/teacher.service');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CLASSROOM   = { id: 10, teacher_id: 5, name: 'Science 9', is_active: 1 };
const TASK_ROW    = { id: 1, classroom_id: 10, title: 'Lab Report' };
const STUDENT_ROW = { id: 20, classroom_id: 10, name: 'Ana' };
const SUB_ROW     = { id: 30, student_id: 20, task_id: 1 };

beforeEach(() => {
  jest.clearAllMocks();
  classroomRepo.belongsToTeacher.mockResolvedValue(CLASSROOM);
  classroomRepo.findOwnedById.mockResolvedValue(CLASSROOM);
  // First pool.query → tasks, second → students
  pool.query
    .mockResolvedValueOnce([[TASK_ROW]])
    .mockResolvedValueOnce([[STUDENT_ROW]]);
  submissionRepo.listForClassroom.mockResolvedValue([SUB_ROW]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildClassroomReportData — PostgreSQL placeholder', () => {
  it('A. tasks query uses $1 (not ?)', async () => {
    await teacherService.buildClassroomReportData(10, 5);
    const [tasksSQL] = pool.query.mock.calls[0];
    expect(tasksSQL).toContain('$1');
    expect(tasksSQL).not.toContain('?');
  });

  it('A. students query uses $1 (not ?)', async () => {
    await teacherService.buildClassroomReportData(10, 5);
    const [studentsSQL] = pool.query.mock.calls[1];
    expect(studentsSQL).toContain('$1');
    expect(studentsSQL).not.toContain('?');
  });

  it('B. classroomId is passed as $1 value in both queries', async () => {
    await teacherService.buildClassroomReportData(10, 5);
    const [, tasksParams]    = pool.query.mock.calls[0];
    const [, studentsParams] = pool.query.mock.calls[1];
    expect(tasksParams).toEqual([10]);
    expect(studentsParams).toEqual([10]);
  });

  it('D. returns structured classroom report data on success', async () => {
    const result = await teacherService.buildClassroomReportData(10, 5);
    expect(result).toMatchObject({
      classroom:   CLASSROOM,
      tasks:       [TASK_ROW],
      studentRows: [
        { student: STUDENT_ROW, submissions: { [SUB_ROW.task_id]: SUB_ROW } },
      ],
    });
  });
});
