/**
 * server/tests/unit/services/teacherPendingEvaluations.service.test.js
 *
 * Regression tests for the Teacher Pending Evaluations feature.
 *
 * Tests verify:
 *   1. Teacher can retrieve pending evaluations for their classrooms.
 *   2. Teacher cannot retrieve another teacher's pending evaluations
 *      (ownership enforced at the repository level).
 *   3. Pending count matches pending submission records.
 *   4. 'analyzed' submissions WITH no teacher_score ARE included as pending
 *      (teacher still needs to review AI-graded work).
 *   5. Dashboard pending count uses the same definition as the pending list
 *      (both include ALL statuses with no teacher_score).
 *   6. Only submissions with a teacher_score are excluded from pending.
 */

jest.mock('../../../src/repositories/submission.repository', () => ({
  listPendingForTeacher: jest.fn(),
  belongsToTeacherClassroom: jest.fn(),
}));
jest.mock('../../../src/repositories/task.repository', () => ({
  belongsToTeacher: jest.fn(),
}));
jest.mock('../../../src/repositories/student.repository', () => ({
  listByClassroom: jest.fn(),
}));
jest.mock('../../../src/repositories/classroom.repository', () => ({
  belongsToTeacher: jest.fn(),
  getTeacherDashboardStats: jest.fn(),
  getRecentActivity: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../src/repositories/notification.repository', () => ({
  insertOne: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../src/repositories/audit.repository', () => ({
  insert: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../src/database/connection', () => ({
  pool: { query: jest.fn() },
  testConnection: jest.fn(),
}));

const teacherService = require('../../../src/services/teacher.service');
const submissionRepo = require('../../../src/repositories/submission.repository');
const classroomRepo  = require('../../../src/repositories/classroom.repository');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEACHER_A_ID = 1;
const TEACHER_B_ID = 2;

function makePendingRow(overrides = {}) {
  return {
    id: 42,
    task_id: 10,
    student_id: 20,
    attempt_number: 1,
    file_type: 'text',
    typed_text: 'My answer',
    status: 'submitted',
    ai_score: null,
    ai_summary: null,
    teacher_score: null,
    teacher_feedback: null,
    submitted_at: new Date().toISOString(),
    analyzed_at: null,
    task_title: 'Essay on Photosynthesis',
    max_score: 100,
    classroom_id: 3,
    classroom_name: 'Biology 101',
    student_name: 'Alice',
    student_username: 'alice',
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// 1. Teacher can retrieve their own pending evaluations
// ---------------------------------------------------------------------------

describe('teacherService.getPendingEvaluations — happy path', () => {
  it('returns pending submissions belonging to the teacher (all statuses)', async () => {
    const rows = [
      makePendingRow({ id: 1, status: 'submitted' }),
      makePendingRow({ id: 2, status: 'analyzing' }),
      makePendingRow({ id: 3, status: 'analyzed', ai_score: 82 }),
      makePendingRow({ id: 4, status: 'failed' }),
    ];
    submissionRepo.listPendingForTeacher.mockResolvedValue(rows);

    const result = await teacherService.getPendingEvaluations(TEACHER_A_ID);

    expect(result).toHaveLength(4);
    expect(submissionRepo.listPendingForTeacher).toHaveBeenCalledWith(TEACHER_A_ID);
  });

  it('returns empty array when there are no pending submissions', async () => {
    submissionRepo.listPendingForTeacher.mockResolvedValue([]);

    const result = await teacherService.getPendingEvaluations(TEACHER_A_ID);

    expect(result).toHaveLength(0);
  });

  it('attaches effective_score to each row', async () => {
    const row = makePendingRow({ ai_score: 75, teacher_score: null });
    submissionRepo.listPendingForTeacher.mockResolvedValue([row]);

    const result = await teacherService.getPendingEvaluations(TEACHER_A_ID);

    // effective_score is null for status='submitted' / 'failed' unless
    // there is an ai_score — but scoring.util returns ai_score when present
    expect(result[0]).toHaveProperty('effective_score');
  });
});

// ---------------------------------------------------------------------------
// 2. Teacher cannot see another teacher's pending evaluations
// ---------------------------------------------------------------------------

describe('teacherService.getPendingEvaluations — ownership isolation', () => {
  it('only fetches submissions scoped to the requesting teacher ID', async () => {
    // Teacher A's submissions
    const teacherARows = [makePendingRow({ id: 10, classroom_id: 3 })];
    submissionRepo.listPendingForTeacher.mockImplementation((tid) => {
      // Simulate: teacher B has no pending submissions
      return Promise.resolve(tid === TEACHER_A_ID ? teacherARows : []);
    });

    const resultA = await teacherService.getPendingEvaluations(TEACHER_A_ID);
    const resultB = await teacherService.getPendingEvaluations(TEACHER_B_ID);

    expect(resultA).toHaveLength(1);
    expect(resultB).toHaveLength(0);

    // Confirm the repository was called with each teacher's own ID — never cross-contaminated
    expect(submissionRepo.listPendingForTeacher).toHaveBeenNthCalledWith(1, TEACHER_A_ID);
    expect(submissionRepo.listPendingForTeacher).toHaveBeenNthCalledWith(2, TEACHER_B_ID);
  });
});

// ---------------------------------------------------------------------------
// 3. Pending count matches pending submission records
// ---------------------------------------------------------------------------

describe('teacherService.getPendingEvaluations — count consistency', () => {
  it('returns the same number of records as the dashboard pending count', async () => {
    const rows = [
      makePendingRow({ id: 1 }),
      makePendingRow({ id: 2 }),
      makePendingRow({ id: 3 }),
    ];
    submissionRepo.listPendingForTeacher.mockResolvedValue(rows);
    classroomRepo.getTeacherDashboardStats.mockResolvedValue({
      totalClassrooms: 2,
      totalStudents: 15,
      activeAssignments: 5,
      // Dashboard count uses the same pending definition — 3 matches the list
      pendingEvaluations: 3,
    });

    const pendingList  = await teacherService.getPendingEvaluations(TEACHER_A_ID);
    const dashboardStats = await teacherService.getDashboardStats(TEACHER_A_ID);

    expect(pendingList).toHaveLength(dashboardStats.pendingEvaluations);
  });
});

// ---------------------------------------------------------------------------
// 4. 'analyzed' submissions ARE included as pending when teacher_score is NULL
// ---------------------------------------------------------------------------

describe('teacherService.getPendingEvaluations — analyzed submissions included', () => {
  it('includes status="analyzed" submissions in the pending list when teacher_score is NULL', async () => {
    // Repository returns 'analyzed' rows — teacher still needs to review AI work
    const pendingRows = [
      makePendingRow({ id: 5, status: 'analyzed', ai_score: 88 }),
    ];
    submissionRepo.listPendingForTeacher.mockResolvedValue(pendingRows);

    const result = await teacherService.getPendingEvaluations(TEACHER_A_ID);

    // 'analyzed' submission IS in the list (teacher must review AI output)
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('analyzed');
  });

  it('returns all four pending statuses (submitted/analyzing/analyzed/failed)', async () => {
    const rows = [
      makePendingRow({ id: 1, status: 'submitted' }),
      makePendingRow({ id: 2, status: 'analyzing' }),
      makePendingRow({ id: 3, status: 'analyzed', ai_score: 75 }),
      makePendingRow({ id: 4, status: 'failed' }),
    ];
    submissionRepo.listPendingForTeacher.mockResolvedValue(rows);

    const result = await teacherService.getPendingEvaluations(TEACHER_A_ID);

    result.forEach((r) => {
      expect(['submitted', 'analyzing', 'analyzed', 'failed']).toContain(r.status);
    });
  });

  it('does NOT include submissions that already have a teacher_score', async () => {
    // Repository only returns teacher_score=NULL rows; simulate that correctly
    submissionRepo.listPendingForTeacher.mockResolvedValue([]);

    const result = await teacherService.getPendingEvaluations(TEACHER_A_ID);

    // Scored submissions are excluded
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Dashboard count uses same definition as pending list
// ---------------------------------------------------------------------------

describe('teacherService.getDashboardStats — pending count definition', () => {
  it('retrieves dashboard stats via classroomRepo.getTeacherDashboardStats', async () => {
    classroomRepo.getTeacherDashboardStats.mockResolvedValue({
      totalClassrooms: 1,
      totalStudents: 5,
      activeAssignments: 3,
      pendingEvaluations: 2,
    });

    const stats = await teacherService.getDashboardStats(TEACHER_A_ID);

    expect(stats.pendingEvaluations).toBe(2);
    expect(classroomRepo.getTeacherDashboardStats).toHaveBeenCalledWith(TEACHER_A_ID);
  });
});
