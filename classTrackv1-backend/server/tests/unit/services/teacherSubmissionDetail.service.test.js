/**
 * server/tests/unit/services/teacherSubmissionDetail.service.test.js
 *
 * Regression test for the "Teacher opens student submission" feature.
 *
 * Verifies the complete path:
 *   1. Student submission exists in the repository (mocked)
 *   2. GET /teacher/submissions/:submissionId → teacherService.getSubmission()
 *   3. getSubmission() returns the full submission with student name,
 *      task title, AI data, and effective_score
 *   4. Teacher is denied access to a submission that does not belong
 *      to their classroom (ownership guard)
 *
 * Also verifies the supporting getTaskSubmissions roster still works
 * (non-null typed_text is visible to the teacher alongside student info).
 */

jest.mock('../../../src/repositories/task.repository', () => ({
  belongsToTeacher: jest.fn(),
}));
jest.mock('../../../src/repositories/student.repository', () => ({
  listByClassroom: jest.fn(),
}));
jest.mock('../../../src/repositories/submission.repository', () => ({
  listByTask: jest.fn(),
  belongsToTeacherClassroom: jest.fn(),
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

const teacherService  = require('../../../src/services/teacher.service');
const taskRepo        = require('../../../src/repositories/task.repository');
const studentRepo     = require('../../../src/repositories/student.repository');
const submissionRepo  = require('../../../src/repositories/submission.repository');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEACHER_ID   = 1;
const TASK_ID      = 10;
const STUDENT_ID   = 20;
const CLASSROOM_ID = 3;
const SUBMISSION_ID = 42;

const BASE_TASK = {
  id: TASK_ID,
  classroom_id: CLASSROOM_ID,
  title: 'Linear Equations',
  description: 'Solve for x.',
  max_score: 100,
  is_active: 1,
  deleted_at: null,
};

const BASE_STUDENT = {
  id: STUDENT_ID,
  name: 'Rahul Sharma',
  username: 'rahuls',
};

/** Full submission row as returned by belongsToTeacherClassroom (with joined columns) */
function makeFullSubmission(overrides = {}) {
  return {
    id: SUBMISSION_ID,
    task_id: TASK_ID,
    student_id: STUDENT_ID,
    attempt_number: 1,
    file_type: 'text',
    file_path: null,
    original_filename: null,
    typed_text: '2x + 4 = 10, therefore x = 3.',
    extracted_text: null,
    status: 'analyzed',
    ai_score: 85,
    ai_summary: 'Good answer with correct steps.',
    ai_strengths: '["Correct final answer","Clear working"]',
    ai_improvements: '["Add more explanation"]',
    teacher_score: null,
    teacher_feedback: null,
    score_overridden_by: null,
    submitted_at: new Date().toISOString(),
    analyzed_at: new Date().toISOString(),
    // Joined columns (added by the updated belongsToTeacherClassroom query)
    task_title: 'Linear Equations',
    task_description: 'Solve for x.',
    max_score: 100,
    classroom_id: CLASSROOM_ID,
    student_name: 'Rahul Sharma',
    student_username: 'rahuls',
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// getSubmission — the new teacher single-submission endpoint
// ---------------------------------------------------------------------------

describe('teacherService.getSubmission — Teacher opens student submission', () => {
  it('returns full submission content including typed_text', async () => {
    const sub = makeFullSubmission();
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(sub);

    const result = await teacherService.getSubmission(SUBMISSION_ID, TEACHER_ID);

    // Core assertion: teacher can see the actual student answer
    expect(result.typed_text).toBe('2x + 4 = 10, therefore x = 3.');
    expect(result.id).toBe(SUBMISSION_ID);
  });

  it('returns student name and username from joined columns', async () => {
    const sub = makeFullSubmission();
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(sub);

    const result = await teacherService.getSubmission(SUBMISSION_ID, TEACHER_ID);

    expect(result.student_name).toBe('Rahul Sharma');
    expect(result.student_username).toBe('rahuls');
  });

  it('returns task title and description from joined columns', async () => {
    const sub = makeFullSubmission();
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(sub);

    const result = await teacherService.getSubmission(SUBMISSION_ID, TEACHER_ID);

    expect(result.task_title).toBe('Linear Equations');
    expect(result.task_description).toBe('Solve for x.');
    expect(result.max_score).toBe(100);
  });

  it('attaches effective_score from ai_score when no teacher override', async () => {
    const sub = makeFullSubmission({ ai_score: 85, teacher_score: null });
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(sub);

    const result = await teacherService.getSubmission(SUBMISSION_ID, TEACHER_ID);

    expect(result.effective_score).toBe(85);
  });

  it('attaches effective_score from teacher_score when override is present', async () => {
    const sub = makeFullSubmission({ ai_score: 85, teacher_score: 92 });
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(sub);

    const result = await teacherService.getSubmission(SUBMISSION_ID, TEACHER_ID);

    expect(result.effective_score).toBe(92);
  });

  it('returns AI analysis fields (summary, strengths, improvements)', async () => {
    const sub = makeFullSubmission();
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(sub);

    const result = await teacherService.getSubmission(SUBMISSION_ID, TEACHER_ID);

    expect(result.ai_summary).toBe('Good answer with correct steps.');
    expect(result.ai_strengths).toBe('["Correct final answer","Clear working"]');
    expect(result.ai_improvements).toBe('["Add more explanation"]');
  });

  it('returns submission with status "submitted" (not yet analyzed)', async () => {
    const sub = makeFullSubmission({
      status: 'submitted',
      ai_score: null,
      ai_summary: null,
      ai_strengths: null,
      ai_improvements: null,
      analyzed_at: null,
    });
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(sub);

    const result = await teacherService.getSubmission(SUBMISSION_ID, TEACHER_ID);

    // Submission is still visible even though AI hasn't graded it yet
    expect(result.status).toBe('submitted');
    expect(result.typed_text).toBe('2x + 4 = 10, therefore x = 3.');
    expect(result.effective_score).toBeNull();
  });

  it('throws 404 when submission does not belong to any of the teacher\'s classrooms', async () => {
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(null);

    await expect(
      teacherService.getSubmission(SUBMISSION_ID, TEACHER_ID)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('calls submissionRepo.belongsToTeacherClassroom with the correct IDs', async () => {
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(makeFullSubmission());

    await teacherService.getSubmission(SUBMISSION_ID, TEACHER_ID);

    expect(submissionRepo.belongsToTeacherClassroom).toHaveBeenCalledWith(
      SUBMISSION_ID,
      TEACHER_ID
    );
  });
});

// ---------------------------------------------------------------------------
// getTaskSubmissions roster still works (non-regression)
// ---------------------------------------------------------------------------

describe('teacherService.getTaskSubmissions — roster includes submission content', () => {
  beforeEach(() => {
    taskRepo.belongsToTeacher.mockResolvedValue(BASE_TASK);
    studentRepo.listByClassroom.mockResolvedValue([BASE_STUDENT]);
  });

  it('returns typed_text in the roster submission entry', async () => {
    const sub = {
      id: SUBMISSION_ID,
      task_id: TASK_ID,
      student_id: STUDENT_ID,
      attempt_number: 1,
      file_type: 'text',
      typed_text: '2x + 4 = 10, therefore x = 3.',
      status: 'analyzed',
      ai_score: 85,
      teacher_score: null,
      submitted_at: new Date().toISOString(),
    };
    submissionRepo.listByTask.mockResolvedValue([sub]);

    const result = await teacherService.getTaskSubmissions(TASK_ID, TEACHER_ID);

    const entry = result.roster[0];
    expect(entry.submission).not.toBeNull();

    // Teacher can see the actual student answer via the roster
    expect(entry.submission.typed_text).toBe('2x + 4 = 10, therefore x = 3.');
  });

  it('includes submission id in each roster entry (required for detail page navigation)', async () => {
    const sub = {
      id: SUBMISSION_ID,
      task_id: TASK_ID,
      student_id: STUDENT_ID,
      attempt_number: 1,
      file_type: 'text',
      typed_text: 'My answer',
      status: 'submitted',
      ai_score: null,
      teacher_score: null,
      submitted_at: new Date().toISOString(),
    };
    submissionRepo.listByTask.mockResolvedValue([sub]);

    const result = await teacherService.getTaskSubmissions(TASK_ID, TEACHER_ID);

    // The submission.id is what the frontend uses to navigate to the detail page
    expect(result.roster[0].submission.id).toBe(SUBMISSION_ID);
  });
});
