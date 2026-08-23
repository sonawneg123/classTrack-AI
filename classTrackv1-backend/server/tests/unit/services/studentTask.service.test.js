/**
 * server/tests/unit/services/studentTask.service.test.js
 *
 * Unit tests for student.service.js (task submission, assignment status,
 * history authorization). Repositories and AI services are all mocked.
 */

jest.mock('../../../src/repositories/task.repository', () => ({
  listForStudent: jest.fn(),
}));
jest.mock('../../../src/repositories/submission.repository', () => ({
  findByTaskAndStudent: jest.fn(),
  create: jest.fn(),
  archiveVersion:    jest.fn(),
  resetForResubmit:  jest.fn(),
  markAnalyzing:     jest.fn(),
  markAnalyzed:      jest.fn(),
  markFailed:        jest.fn(),
  listByStudent:     jest.fn(),
  getVersionHistory: jest.fn(),
}));
jest.mock('../../../src/repositories/notification.repository', () => ({
  insertOne: jest.fn().mockResolvedValue(undefined),
}));

// Mock the AI queue so no real HTTP requests are made in unit tests
jest.mock('../../../src/services/ai/queue.service', () => ({
  enqueue: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../src/services/ai/groq.service', () => ({
  analyzeText:  jest.fn(),
  analyzeImage: jest.fn(),
}));
jest.mock('../../../src/services/ai/extractor.service', () => ({
  extractFromTxt:  jest.fn(),
  extractFromPdf:  jest.fn(),
  toBase64DataUrl: jest.fn(),
}));
jest.mock('../../../src/database/connection', () => ({
  pool: {
    query: jest.fn().mockResolvedValue([[{ id: 1 }]]),
  },
  testConnection: jest.fn(),
}));

const studentService = require('../../../src/services/student.service');
const taskRepo       = require('../../../src/repositories/task.repository');
const submissionRepo = require('../../../src/repositories/submission.repository');
const { enqueue }    = require('../../../src/services/ai/queue.service');

function futureDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}
function pastDate() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

const BASE_TASK = {
  id: 10,
  classroom_id: 3,
  title: 'Essay: The Water Cycle',
  description: 'Describe the water cycle',
  max_score: 100,
  due_date: null,
  late_submission_allowed: 0,
  ai_evaluation_enabled: 1,    // default: AI enabled — existing tests rely on enqueue being called
  submission_id: null,
  submission_status: null,
  ai_score: null,
  teacher_score: null,
  attempt_number: null,
};

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// _assignmentStatus
// ---------------------------------------------------------------------------
describe('getMyTasks — assignment_status computation', () => {
  it('is "submitted" when submission_id is set, regardless of due date', async () => {
    taskRepo.listForStudent.mockResolvedValue([
      { ...BASE_TASK, submission_id: 99, due_date: pastDate() },
    ]);
    const tasks = await studentService.getMyTasks(20, 3);
    expect(tasks[0].assignment_status).toBe('submitted');
  });

  it('is "overdue" when no submission and due date is in the past', async () => {
    taskRepo.listForStudent.mockResolvedValue([
      { ...BASE_TASK, due_date: pastDate() },
    ]);
    const tasks = await studentService.getMyTasks(20, 3);
    expect(tasks[0].assignment_status).toBe('overdue');
  });

  it('is "upcoming" when no submission and due date is in the future', async () => {
    taskRepo.listForStudent.mockResolvedValue([
      { ...BASE_TASK, due_date: futureDate() },
    ]);
    const tasks = await studentService.getMyTasks(20, 3);
    expect(tasks[0].assignment_status).toBe('upcoming');
  });

  it('is "pending" when no submission and no due date', async () => {
    taskRepo.listForStudent.mockResolvedValue([{ ...BASE_TASK }]);
    const tasks = await studentService.getMyTasks(20, 3);
    expect(tasks[0].assignment_status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// effective_score
// ---------------------------------------------------------------------------
describe('getMyTasks — effective_score', () => {
  it('returns teacher_score when set (teacher wins over AI)', async () => {
    taskRepo.listForStudent.mockResolvedValue([
      { ...BASE_TASK, submission_id: 1, ai_score: 70, teacher_score: 85 },
    ]);
    const tasks = await studentService.getMyTasks(20, 3);
    expect(tasks[0].effective_score).toBe(85);
  });

  it('returns ai_score when no teacher override', async () => {
    taskRepo.listForStudent.mockResolvedValue([
      { ...BASE_TASK, submission_id: 1, ai_score: 70, teacher_score: null },
    ]);
    const tasks = await studentService.getMyTasks(20, 3);
    expect(tasks[0].effective_score).toBe(70);
  });

  it('returns null when no scores available', async () => {
    taskRepo.listForStudent.mockResolvedValue([{ ...BASE_TASK }]);
    const tasks = await studentService.getMyTasks(20, 3);
    expect(tasks[0].effective_score).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// submitTask — business rules
// ---------------------------------------------------------------------------
describe('submitTask — input validation', () => {
  beforeEach(() => {
    taskRepo.listForStudent.mockResolvedValue([{ ...BASE_TASK }]);
    submissionRepo.findByTaskAndStudent.mockResolvedValue(null);
    submissionRepo.create.mockResolvedValue(42);
    submissionRepo.markAnalyzing.mockResolvedValue(undefined);
  });

  it('throws 400 when neither file nor typedText is provided', async () => {
    await expect(
      studentService.submitTask({ taskId: 10, studentId: 20, classroomId: 3 })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(submissionRepo.create).not.toHaveBeenCalled();
  });

  it('throws 404 when task not found in student classroom', async () => {
    taskRepo.listForStudent.mockResolvedValue([]);
    await expect(
      studentService.submitTask({ taskId: 99, studentId: 20, classroomId: 3, typedText: 'Hello' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('creates a new submission for a fresh submit and enqueues AI', async () => {
    const result = await studentService.submitTask({
      taskId: 10, studentId: 20, classroomId: 3, typedText: 'My answer',
    });
    expect(submissionRepo.create).toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalled();
    expect(result.submissionId).toBe(42);
    expect(result.attemptNumber).toBe(1);
  });
});

describe('submitTask — late submission enforcement', () => {
  it('throws 400 when past due and late not allowed', async () => {
    taskRepo.listForStudent.mockResolvedValue([{
      ...BASE_TASK,
      due_date: pastDate(),
      late_submission_allowed: 0,
    }]);
    submissionRepo.findByTaskAndStudent.mockResolvedValue(null);

    await expect(
      studentService.submitTask({ taskId: 10, studentId: 20, classroomId: 3, typedText: 'Late' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(submissionRepo.create).not.toHaveBeenCalled();
  });

  it('allows submit when past due but late_submission_allowed=1', async () => {
    taskRepo.listForStudent.mockResolvedValue([{
      ...BASE_TASK,
      due_date: pastDate(),
      late_submission_allowed: 1,
    }]);
    submissionRepo.findByTaskAndStudent.mockResolvedValue(null);
    submissionRepo.create.mockResolvedValue(55);
    submissionRepo.markAnalyzing.mockResolvedValue(undefined);

    const result = await studentService.submitTask({
      taskId: 10, studentId: 20, classroomId: 3, typedText: 'Late but allowed',
    });
    expect(result.submissionId).toBe(55);
    expect(submissionRepo.create).toHaveBeenCalled();
  });
});

describe('submitTask — resubmission', () => {
  it('archives the existing submission and increments attempt number', async () => {
    taskRepo.listForStudent.mockResolvedValue([{ ...BASE_TASK }]);
    const existing = {
      id: 42, attempt_number: 1, file_path: null, original_filename: null,
      file_type: 'text', typed_text: 'Old answer', extracted_text: null,
      ai_score: 70, ai_summary: 'ok', ai_strengths: '[]', ai_improvements: '[]',
      teacher_score: null, teacher_feedback: null,
    };
    submissionRepo.findByTaskAndStudent.mockResolvedValue(existing);
    submissionRepo.archiveVersion.mockResolvedValue(undefined);
    submissionRepo.resetForResubmit.mockResolvedValue(undefined);
    submissionRepo.markAnalyzing.mockResolvedValue(undefined);

    const result = await studentService.submitTask({
      taskId: 10, studentId: 20, classroomId: 3, typedText: 'New answer',
    });
    expect(submissionRepo.archiveVersion).toHaveBeenCalledWith(existing);
    expect(submissionRepo.resetForResubmit).toHaveBeenCalledWith(
      42, expect.objectContaining({ attemptNumber: 2 })
    );
    expect(result.attemptNumber).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getMySubmissionHistory — authorization
// ---------------------------------------------------------------------------
describe('getMySubmissionHistory — authorization', () => {
  const { pool } = require('../../../src/database/connection');

  it('throws 404 when submission does not belong to the student', async () => {
    // findByTaskAndStudent is called first (passes taskId=null) — its return
    // value is assigned to `check` but never used; then pool.query runs the
    // real ownership check. Mock the ownership check to return no rows.
    submissionRepo.findByTaskAndStudent.mockResolvedValue(null);
    pool.query.mockResolvedValue([[]]); // no row → not found
    await expect(
      studentService.getMySubmissionHistory(999, 20)
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(submissionRepo.getVersionHistory).not.toHaveBeenCalled();
  });

  it('returns version history when submission belongs to the student', async () => {
    // findByTaskAndStudent (taskId=null) — return value unused by service
    submissionRepo.findByTaskAndStudent.mockResolvedValue(null);
    // Direct pool.query ownership check → row found
    pool.query.mockResolvedValue([[{ id: 42 }]]);
    submissionRepo.getVersionHistory.mockResolvedValue([{ id: 1, attempt_number: 1 }]);

    const result = await studentService.getMySubmissionHistory(42, 20);
    expect(submissionRepo.getVersionHistory).toHaveBeenCalledWith(42);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// AI evaluation toggle regression tests
// ---------------------------------------------------------------------------
describe('submitTask — AI evaluation toggle', () => {
  it('enqueues AI when ai_evaluation_enabled = 1', async () => {
    taskRepo.listForStudent.mockResolvedValue([{
      ...BASE_TASK, ai_evaluation_enabled: 1,
    }]);
    submissionRepo.findByTaskAndStudent.mockResolvedValue(null);
    submissionRepo.create.mockResolvedValue(50);
    submissionRepo.markAnalyzing.mockResolvedValue(undefined);

    const result = await studentService.submitTask({
      taskId: 10, studentId: 20, classroomId: 3, typedText: 'My answer',
    });

    expect(enqueue).toHaveBeenCalled();
    expect(result.aiQueued).toBe(true);
  });

  it('does NOT enqueue AI when ai_evaluation_enabled = 0', async () => {
    taskRepo.listForStudent.mockResolvedValue([{
      ...BASE_TASK, ai_evaluation_enabled: 0,
    }]);
    submissionRepo.findByTaskAndStudent.mockResolvedValue(null);
    submissionRepo.create.mockResolvedValue(51);

    const result = await studentService.submitTask({
      taskId: 10, studentId: 20, classroomId: 3, typedText: 'My answer',
    });

    expect(enqueue).not.toHaveBeenCalled();
    // markAnalyzing should NOT be called — submission stays in 'submitted' status
    expect(submissionRepo.markAnalyzing).not.toHaveBeenCalled();
    expect(result.aiQueued).toBe(false);
  });

  it('does NOT call Groq when ai_evaluation_enabled = 0', async () => {
    const { analyzeText } = require('../../../src/services/ai/groq.service');
    taskRepo.listForStudent.mockResolvedValue([{
      ...BASE_TASK, ai_evaluation_enabled: 0,
    }]);
    submissionRepo.findByTaskAndStudent.mockResolvedValue(null);
    submissionRepo.create.mockResolvedValue(52);

    await studentService.submitTask({
      taskId: 10, studentId: 20, classroomId: 3, typedText: 'Answer',
    });

    expect(analyzeText).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('submission stays in submitted status (not analyzing) when AI disabled', async () => {
    taskRepo.listForStudent.mockResolvedValue([{
      ...BASE_TASK, ai_evaluation_enabled: 0,
    }]);
    submissionRepo.findByTaskAndStudent.mockResolvedValue(null);
    submissionRepo.create.mockResolvedValue(53);

    await studentService.submitTask({
      taskId: 10, studentId: 20, classroomId: 3, typedText: 'Answer',
    });

    // markAnalyzing changes status to 'analyzing' — must NOT be called for disabled tasks
    expect(submissionRepo.markAnalyzing).not.toHaveBeenCalled();
  });
});
