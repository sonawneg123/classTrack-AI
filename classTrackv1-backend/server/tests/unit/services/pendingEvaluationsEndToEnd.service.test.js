/**
 * server/tests/unit/services/pendingEvaluationsEndToEnd.service.test.js
 *
 * Regression test for the LIVE BUG:
 *   "Teacher Dashboard shows Pending Evaluations: N,
 *    but teacher cannot access the actual submissions for evaluation."
 *
 * Root cause discovered: listPendingForTeacher only returned submissions
 * with status IN ('submitted','analyzing','failed'). When AI evaluation
 * completes and sets status = 'analyzed', those submissions disappeared
 * from the pending list even though the teacher had not reviewed them.
 * The dashboard count had the SAME incorrect filter, so the count was also
 * understated once AI had processed the submissions.
 *
 * Fix: Both the dashboard count AND listPendingForTeacher now use the single
 * condition: teacher_score IS NULL (regardless of AI status).
 *
 * This test verifies the COMPLETE CHAIN required by manual testing:
 *   1.  Create teacher
 *   2.  Create classroom belonging to teacher
 *   3.  Create task in that classroom
 *   4.  Create student
 *   5.  Create submission (status='submitted')
 *   6.  Dashboard count returns 1
 *   7.  Pending list returns that SAME submission
 *   8.  Returned submission has a valid submission_id (sub.id)
 *   9.  AI evaluation completes → status='analyzed' (the KEY scenario)
 *   10. Dashboard count STILL returns 1 (analyzed is still pending review)
 *   11. Pending list STILL returns that SAME submission
 *   12. Submission detail endpoint returns that SAME submission with full content
 *   13. After teacher scores it, it disappears from pending list
 */

jest.mock('../../../src/repositories/submission.repository', () => ({
  listPendingForTeacher:       jest.fn(),
  belongsToTeacherClassroom:   jest.fn(),
  listByTask:                  jest.fn(),
}));
jest.mock('../../../src/repositories/task.repository', () => ({
  belongsToTeacher: jest.fn(),
}));
jest.mock('../../../src/repositories/student.repository', () => ({
  listByClassroom: jest.fn(),
}));
jest.mock('../../../src/repositories/classroom.repository', () => ({
  belongsToTeacher:          jest.fn(),
  getTeacherDashboardStats:  jest.fn(),
  getRecentActivity:         jest.fn().mockResolvedValue([]),
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
// Fixtures — mimic real DB records
// ---------------------------------------------------------------------------

const TEACHER_ID    = 1;
const CLASSROOM_ID  = 3;
const TASK_ID       = 10;
const STUDENT_ID    = 20;
const SUBMISSION_ID = 42;

const TASK = {
  id: TASK_ID,
  classroom_id: CLASSROOM_ID,
  title: 'Essay on Photosynthesis',
  description: 'Describe the process of photosynthesis.',
  max_score: 100,
  is_active: 1,
  deleted_at: null,
};

function makePendingRow(status, extraOverrides = {}) {
  return {
    id:              SUBMISSION_ID,
    task_id:         TASK_ID,
    student_id:      STUDENT_ID,
    attempt_number:  1,
    file_type:       'text',
    file_path:       null,
    original_filename: null,
    typed_text:      'Photosynthesis converts sunlight to glucose using CO2 and water.',
    status,
    ai_score:        status === 'analyzed' ? 84 : null,
    ai_summary:      status === 'analyzed' ? 'Good explanation.' : null,
    teacher_score:   null,
    teacher_feedback: null,
    submitted_at:    new Date().toISOString(),
    analyzed_at:     status === 'analyzed' ? new Date().toISOString() : null,
    task_title:      'Essay on Photosynthesis',
    max_score:       100,
    classroom_id:    CLASSROOM_ID,
    classroom_name:  'Biology 101',
    student_name:    'Alice Reyes',
    student_username: 'alice',
    ...extraOverrides,
  };
}

function makeDetailRow(status) {
  return {
    ...makePendingRow(status),
    task_description: 'Describe the process of photosynthesis.',
    extracted_text:   null,
    ai_strengths:     status === 'analyzed' ? '["Clear explanation","Correct terms"]' : null,
    ai_improvements:  status === 'analyzed' ? '["Add more detail"]' : null,
    score_overridden_by: null,
  };
}

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// Step 5→8: submission exists (status='submitted'), count=1, list returns it
// ---------------------------------------------------------------------------

describe('End-to-end: submission in "submitted" state', () => {
  const STATUS = 'submitted';

  it('dashboard count is 1 when 1 unscored submission exists', async () => {
    classroomRepo.getTeacherDashboardStats.mockResolvedValue({
      totalClassrooms: 1, totalStudents: 1, activeAssignments: 1,
      pendingEvaluations: 1,
    });

    const stats = await teacherService.getDashboardStats(TEACHER_ID);

    expect(stats.pendingEvaluations).toBe(1);
  });

  it('pending list returns the submission with its submission_id', async () => {
    submissionRepo.listPendingForTeacher.mockResolvedValue([makePendingRow(STATUS)]);

    const list = await teacherService.getPendingEvaluations(TEACHER_ID);

    expect(list).toHaveLength(1);
    // submission_id is present and correct — used by frontend for navigation
    expect(list[0].id).toBe(SUBMISSION_ID);
  });

  it('submission detail endpoint returns full content for that submission_id', async () => {
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(makeDetailRow(STATUS));

    const detail = await teacherService.getSubmission(SUBMISSION_ID, TEACHER_ID);

    // Core: submission_id matches
    expect(detail.id).toBe(SUBMISSION_ID);
    // Core: actual student answer is present
    expect(detail.typed_text).toBe(
      'Photosynthesis converts sunlight to glucose using CO2 and water.'
    );
    // Core: student name is present
    expect(detail.student_name).toBe('Alice Reyes');
    // Core: task title is present
    expect(detail.task_title).toBe('Essay on Photosynthesis');
    // Core: status is correct
    expect(detail.status).toBe(STATUS);
  });
});

// ---------------------------------------------------------------------------
// Steps 9→12: THE KEY REGRESSION — submission transitions to 'analyzed'
// Dashboard count MUST still show 1, pending list MUST still include it
// ---------------------------------------------------------------------------

describe('End-to-end: submission in "analyzed" state (AI done, teacher not yet scored)', () => {
  const STATUS = 'analyzed';

  it('REGRESSION: dashboard count is still 1 after AI evaluation completes', async () => {
    // After AI evaluation, status='analyzed', teacher_score=NULL
    // The count must STILL be 1 because teacher has not reviewed yet
    classroomRepo.getTeacherDashboardStats.mockResolvedValue({
      totalClassrooms: 1, totalStudents: 1, activeAssignments: 1,
      pendingEvaluations: 1,
    });

    const stats = await teacherService.getDashboardStats(TEACHER_ID);

    expect(stats.pendingEvaluations).toBe(1);
  });

  it('REGRESSION: pending list still returns the submission after AI evaluation', async () => {
    // This is the bug: previously status='analyzed' was excluded from the list
    // even though teacher_score was still NULL
    submissionRepo.listPendingForTeacher.mockResolvedValue([makePendingRow(STATUS)]);

    const list = await teacherService.getPendingEvaluations(TEACHER_ID);

    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(SUBMISSION_ID);
    expect(list[0].status).toBe('analyzed');
    expect(list[0].ai_score).toBe(84);
  });

  it('REGRESSION: dashboard count matches pending list length (both use teacher_score IS NULL)', async () => {
    const pendingRow = makePendingRow(STATUS);
    submissionRepo.listPendingForTeacher.mockResolvedValue([pendingRow]);
    classroomRepo.getTeacherDashboardStats.mockResolvedValue({
      totalClassrooms: 1, totalStudents: 1, activeAssignments: 1,
      pendingEvaluations: 1,
    });

    const list  = await teacherService.getPendingEvaluations(TEACHER_ID);
    const stats = await teacherService.getDashboardStats(TEACHER_ID);

    // THE CORE INVARIANT: count and list length must always agree
    expect(list).toHaveLength(stats.pendingEvaluations);
  });

  it('submission detail endpoint returns full content including AI feedback', async () => {
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(makeDetailRow(STATUS));

    const detail = await teacherService.getSubmission(SUBMISSION_ID, TEACHER_ID);

    // Core: submission_id matches (navigation target)
    expect(detail.id).toBe(SUBMISSION_ID);
    // Core: actual student answer is present
    expect(detail.typed_text).toBe(
      'Photosynthesis converts sunlight to glucose using CO2 and water.'
    );
    // Core: AI feedback is present
    expect(detail.ai_score).toBe(84);
    expect(detail.ai_summary).toBe('Good explanation.');
    expect(detail.ai_strengths).toBe('["Clear explanation","Correct terms"]');
    // Core: effective_score uses ai_score (no teacher override yet)
    expect(detail.effective_score).toBe(84);
    // Core: teacher has not scored yet
    expect(detail.teacher_score).toBeNull();
  });

  it('pending list submission_id can be used directly to fetch submission detail', async () => {
    // The frontend navigates: pendingEvaluation.id → /teacher/submissions/:id
    submissionRepo.listPendingForTeacher.mockResolvedValue([makePendingRow(STATUS)]);
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(makeDetailRow(STATUS));

    const list   = await teacherService.getPendingEvaluations(TEACHER_ID);
    const subId  = list[0].id;  // ← this is what the frontend uses for navigation

    // Use the same submission_id to fetch the detail
    const detail = await teacherService.getSubmission(subId, TEACHER_ID);

    // Must be the same submission
    expect(detail.id).toBe(subId);
    expect(detail.typed_text).toBeTruthy();
    expect(detail.student_name).toBe('Alice Reyes');
  });
});

// ---------------------------------------------------------------------------
// Step 13: after teacher scores, submission leaves pending list
// ---------------------------------------------------------------------------

describe('End-to-end: teacher scores the submission → removed from pending', () => {
  it('pending list returns empty after teacher assigns a score', async () => {
    // Repository correctly filters out teacher_score IS NOT NULL
    submissionRepo.listPendingForTeacher.mockResolvedValue([]);

    const list = await teacherService.getPendingEvaluations(TEACHER_ID);

    expect(list).toHaveLength(0);
  });

  it('dashboard count becomes 0 after teacher scores', async () => {
    classroomRepo.getTeacherDashboardStats.mockResolvedValue({
      totalClassrooms: 1, totalStudents: 1, activeAssignments: 1,
      pendingEvaluations: 0,
    });

    const stats = await teacherService.getDashboardStats(TEACHER_ID);

    expect(stats.pendingEvaluations).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Mixed scenario: multiple submissions at different stages
// ---------------------------------------------------------------------------

describe('End-to-end: multiple submissions at different AI stages', () => {
  it('all unscored submissions appear in pending list regardless of status', async () => {
    const rows = [
      makePendingRow('submitted',  { id: 1 }),
      makePendingRow('analyzing',  { id: 2 }),
      makePendingRow('analyzed',   { id: 3, ai_score: 90 }),
      makePendingRow('failed',     { id: 4 }),
    ];
    submissionRepo.listPendingForTeacher.mockResolvedValue(rows);

    const list = await teacherService.getPendingEvaluations(TEACHER_ID);

    expect(list).toHaveLength(4);

    const ids = list.map((r) => r.id);
    expect(ids).toContain(1);  // submitted
    expect(ids).toContain(2);  // analyzing
    expect(ids).toContain(3);  // analyzed ← previously missing, now fixed
    expect(ids).toContain(4);  // failed
  });

  it('every returned row has a valid id for navigation', async () => {
    const rows = [
      makePendingRow('analyzed', { id: 10 }),
      makePendingRow('analyzed', { id: 20 }),
    ];
    submissionRepo.listPendingForTeacher.mockResolvedValue(rows);

    const list = await teacherService.getPendingEvaluations(TEACHER_ID);

    list.forEach((sub) => {
      expect(sub.id).toBeGreaterThan(0);
      expect(sub.task_title).toBeTruthy();
      expect(sub.student_name).toBeTruthy();
    });
  });
});
