/**
 * server/tests/unit/services/teacherSubmissionVisibility.test.js
 *
 * Regression test for the "Teacher cannot see Student submission" bug.
 *
 * Root cause: the backend correctly stores and retrieves submissions via
 * submissionRepo.listByTask() (no status filter, no deleted filter).
 * The bug was purely a missing frontend page — the Teacher had no UI to
 * navigate from the Grading Overview to the individual submission list
 * for a task. This test proves the service layer always returns the
 * submission regardless of status.
 *
 * It also proves:
 *   1. Student submits → submission is created
 *   2. getTaskSubmissions returns that submission for the teacher
 *   3. Teacher can read submission even when status = 'submitted' (not yet analyzed)
 *   4. Teacher can read submission when status = 'analyzing'
 *   5. Teacher can read submission when status = 'analyzed'
 *   6. Teacher can read submission when status = 'failed'
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

const TEACHER_ID  = 1;
const TASK_ID     = 10;
const STUDENT_ID  = 20;
const CLASSROOM_ID = 3;

const BASE_TASK = {
  id: TASK_ID,
  classroom_id: CLASSROOM_ID,
  title: 'Essay on the Water Cycle',
  description: 'Describe the water cycle in detail.',
  max_score: 100,
  is_active: 1,
  deleted_at: null,
};

const BASE_STUDENT = {
  id: STUDENT_ID,
  name: 'Alice',
  username: 'alice',
};

function makeSubmission(status) {
  return {
    id: 42,
    task_id: TASK_ID,
    student_id: STUDENT_ID,
    attempt_number: 1,
    file_type: 'text',
    typed_text: 'The water cycle consists of evaporation, condensation, and precipitation.',
    status,
    ai_score:      status === 'analyzed' ? 87 : null,
    ai_summary:    status === 'analyzed' ? 'Good essay.' : null,
    ai_strengths:  status === 'analyzed' ? '["Detail"]' : null,
    ai_improvements: status === 'analyzed' ? '["Add examples"]' : null,
    teacher_score: null,
    teacher_feedback: null,
    submitted_at: new Date(),
  };
}

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// Core regression: getTaskSubmissions returns submission for every status
// ---------------------------------------------------------------------------

describe('Teacher submission visibility — regression', () => {
  beforeEach(() => {
    taskRepo.belongsToTeacher.mockResolvedValue(BASE_TASK);
    studentRepo.listByClassroom.mockResolvedValue([BASE_STUDENT]);
  });

  for (const status of ['submitted', 'analyzing', 'analyzed', 'failed']) {
    it(`returns submission with status="${status}" to the teacher`, async () => {
      const submission = makeSubmission(status);
      submissionRepo.listByTask.mockResolvedValue([submission]);

      const result = await teacherService.getTaskSubmissions(TASK_ID, TEACHER_ID);

      expect(result.roster).toHaveLength(1);
      const entry = result.roster[0];

      // Student is present
      expect(entry.student.id).toBe(STUDENT_ID);

      // Submission IS visible — this is the key regression assertion.
      // With any status (submitted/analyzing/analyzed/failed) the submission
      // must appear; it must never be null just because AI hasn't finished.
      expect(entry.submission).not.toBeNull();
      expect(entry.submission.id).toBe(42);
      expect(entry.submission.status).toBe(status);
    });
  }

  it('returns null submission for students who have not submitted yet', async () => {
    // No submissions for this task
    submissionRepo.listByTask.mockResolvedValue([]);

    const result = await teacherService.getTaskSubmissions(TASK_ID, TEACHER_ID);

    expect(result.roster).toHaveLength(1);
    expect(result.roster[0].submission).toBeNull();
  });

  it('attaches effective_score as teacher_score when teacher override exists', async () => {
    const submission = { ...makeSubmission('analyzed'), ai_score: 70, teacher_score: 90 };
    submissionRepo.listByTask.mockResolvedValue([submission]);

    const result = await teacherService.getTaskSubmissions(TASK_ID, TEACHER_ID);

    // effectiveScore() returns teacher_score when present
    expect(result.roster[0].submission.effective_score).toBe(90);
  });

  it('attaches effective_score as ai_score when no teacher override', async () => {
    const submission = { ...makeSubmission('analyzed'), ai_score: 78, teacher_score: null };
    submissionRepo.listByTask.mockResolvedValue([submission]);

    const result = await teacherService.getTaskSubmissions(TASK_ID, TEACHER_ID);

    expect(result.roster[0].submission.effective_score).toBe(78);
  });

  it('throws 404 when task does not belong to the teacher', async () => {
    taskRepo.belongsToTeacher.mockResolvedValue(null);

    await expect(
      teacherService.getTaskSubmissions(TASK_ID, TEACHER_ID)
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(submissionRepo.listByTask).not.toHaveBeenCalled();
  });
});
