/**
 * server/tests/unit/controllers/teacher.controller.pg-placeholders.test.js
 *
 * Regression tests for the PostgreSQL placeholder bug fix.
 *
 * Two controller functions previously used MySQL-style `?` placeholders
 * instead of PostgreSQL-style `$1` placeholders:
 *
 *   - reanalyzeSubmission  (line 126): SELECT * FROM tasks WHERE id = $1
 *   - downloadClassroomReport (line 146): SELECT name FROM teachers WHERE id = $1
 *
 * And the service function called by downloadClassroomReport:
 *   - buildClassroomReportData (lines 249-250) also had two `?` placeholders.
 *
 * These tests verify:
 *   A. downloadClassroomReport uses PostgreSQL $1 parameter syntax.
 *   B. reanalyzeSubmission uses PostgreSQL $1 parameter syntax.
 *   C. Correct parameter values are passed.
 *   D. Existing successful behavior remains unchanged.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before any require() of the modules under test
// ---------------------------------------------------------------------------

jest.mock('../../../src/database/connection', () => ({
  pool: { query: jest.fn() },
  testConnection: jest.fn(),
}));

jest.mock('../../../src/repositories/submission.repository', () => ({
  belongsToTeacherClassroom: jest.fn(),
  markAnalyzing: jest.fn(),
  markAnalyzed: jest.fn(),
  markFailed: jest.fn(),
  listForClassroom: jest.fn(),
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

jest.mock('../../../src/repositories/notification.repository', () => ({
  insertOne: jest.fn(),
  getActiveStudentIds: jest.fn(),
  bulkInsertForClassroom: jest.fn(),
}));

jest.mock('../../../src/repositories/audit.repository', () => ({
  insert: jest.fn(),
}));

jest.mock('../../../src/services/teacher.service', () => ({
  buildClassroomReportData: jest.fn(),
}));

jest.mock('../../../src/services/report/pdf.service', () => ({
  buildClassroomReport: jest.fn(),
}));

jest.mock('../../../src/services/report/csv.service', () => ({
  buildClassroomGradesCsv: jest.fn(),
}));

jest.mock('../../../src/services/ai/queue.service', () => ({
  enqueue: jest.fn(),
}));

jest.mock('../../../src/services/ai/groq.service', () => ({
  analyzeText:  jest.fn(),
  analyzeImage: jest.fn(),
}));

jest.mock('../../../src/services/ai/extractor.service', () => ({
  toBase64DataUrl: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const { pool }          = require('../../../src/database/connection');
const submissionRepo    = require('../../../src/repositories/submission.repository');
const aiQueueService    = require('../../../src/services/ai/queue.service');
const teacherService    = require('../../../src/services/teacher.service');
const pdfService        = require('../../../src/services/report/pdf.service');
const teacherController = require('../../../src/controllers/teacher.controller');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json:   jest.fn().mockReturnThis(),
    send:   jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    pipe:   jest.fn(),
  };
}

function mockReq(overrides = {}) {
  return {
    user:   { id: 42 },
    params: {},
    body:   {},
    query:  {},
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// downloadClassroomReport — PostgreSQL $1 placeholder
// ---------------------------------------------------------------------------

describe('downloadClassroomReport — PostgreSQL placeholder', () => {
  const TEACHER_ROW  = { id: 42, name: 'Ms Garcia' };
  const REPORT_DATA  = {
    classroom:   { id: 10, name: 'Math 101' },
    tasks:       [],
    studentRows: [],
  };
  const FAKE_STREAM  = { pipe: jest.fn() };

  beforeEach(() => {
    pool.query.mockResolvedValue([[TEACHER_ROW]]);
    teacherService.buildClassroomReportData.mockResolvedValue(REPORT_DATA);
    pdfService.buildClassroomReport.mockReturnValue(FAKE_STREAM);
  });

  it('A. uses PostgreSQL $1 syntax (not MySQL ?)', async () => {
    const req = mockReq({ params: { classroomId: '10' } });
    const res = mockRes();

    await teacherController.downloadClassroomReport(req, res);

    const [sql, params] = pool.query.mock.calls[0];
    // Must use $1, not ?
    expect(sql).toContain('$1');
    expect(sql).not.toContain('?');
  });

  it('C. passes req.user.id as the $1 parameter value', async () => {
    const req = mockReq({ user: { id: 99 }, params: { classroomId: '10' } });
    const res = mockRes();

    await teacherController.downloadClassroomReport(req, res);

    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual([99]);
  });

  it('D. pipes the PDF stream to the response on success', async () => {
    const req = mockReq({ params: { classroomId: '10' } });
    const res = mockRes();

    await teacherController.downloadClassroomReport(req, res);

    expect(FAKE_STREAM.pipe).toHaveBeenCalledWith(res);
  });
});

// ---------------------------------------------------------------------------
// reanalyzeSubmission — PostgreSQL $1 placeholder (inside aiQueueService.enqueue)
// ---------------------------------------------------------------------------

describe('reanalyzeSubmission — PostgreSQL placeholder', () => {
  const SUB = { id: 7, task_id: 3, file_type: 'text', typed_text: 'Hello' };

  beforeEach(() => {
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(SUB);
    submissionRepo.markAnalyzing.mockResolvedValue(undefined);
    // Capture and immediately invoke the enqueued callback so we can inspect
    // pool.query calls made inside it
    aiQueueService.enqueue.mockImplementation(async (fn) => fn());
    pool.query.mockResolvedValue([[{ id: 3, title: 'Essay', description: 'Write', max_score: 10 }]]);
    require('../../../src/services/ai/groq.service').analyzeText.mockResolvedValue({ score: 8 });
  });

  it('B. uses PostgreSQL $1 syntax inside the enqueued callback', async () => {
    const req = mockReq({ params: { submissionId: '7' } });
    const res = mockRes();

    await teacherController.reanalyzeSubmission(req, res);

    const [sql] = pool.query.mock.calls[0];
    expect(sql).toContain('$1');
    expect(sql).not.toContain('?');
  });

  it('C. passes sub.task_id as the $1 parameter value', async () => {
    const req = mockReq({ params: { submissionId: '7' } });
    const res = mockRes();

    await teacherController.reanalyzeSubmission(req, res);

    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual([SUB.task_id]);
  });

  it('D. returns 404 when submission does not belong to teacher', async () => {
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(null);
    const req = mockReq({ params: { submissionId: '7' } });
    const res = mockRes();

    await teacherController.reanalyzeSubmission(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Submission not found.' })
    );
    expect(pool.query).not.toHaveBeenCalled();
  });
});
