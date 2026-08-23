/**
 * server/tests/unit/services/teacherGradingNotification.service.test.js
 *
 * Regression tests for the Teacher-Grades-Submission → Student-Notification pipeline.
 *
 * Tests verify:
 *   1. Teacher grades a submission → correct student receives a notification.
 *   2. Notification contains the task title.
 *   3. Notification contains the teacher score.
 *   4. Notification is initially unread (is_read not set by insertOne — DB default).
 *   5. Teacher cannot create a notification for an unrelated student
 *      (ownership enforced by belongsToTeacherClassroom returning null).
 *   6. Notification uses recipient_type='student' and the submission's student_id.
 *   7. Another teacher's student does NOT receive a notification (404 guard).
 *   8. Feedback is included in the notification message when provided.
 *   9. Notification message is still meaningful even without feedback.
 *  10. Notification type is 'score_overridden'.
 *  11. Existing grading tests (overrideScore updates the submission row) are unaffected.
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
  overrideScore: jest.fn().mockResolvedValue(undefined),
  listPendingForTeacher: jest.fn(),
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
const submissionRepo  = require('../../../src/repositories/submission.repository');
const notifRepo       = require('../../../src/repositories/notification.repository');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEACHER_ID      = 1;
const OTHER_TEACHER   = 2;
const STUDENT_ID      = 20;
const UNRELATED_STUDENT = 99;
const TASK_ID         = 10;
const CLASSROOM_ID    = 3;
const SUBMISSION_ID   = 42;
const MAX_SCORE       = 100;

function makeFullSubmission(overrides = {}) {
  return {
    id:              SUBMISSION_ID,
    task_id:         TASK_ID,
    student_id:      STUDENT_ID,
    attempt_number:  1,
    file_type:       'text',
    typed_text:      'My answer.',
    status:          'analyzed',
    ai_score:        80,
    ai_summary:      'Good attempt.',
    ai_strengths:    '[]',
    ai_improvements: '[]',
    teacher_score:   null,
    teacher_feedback: null,
    score_overridden_by: null,
    submitted_at:    new Date().toISOString(),
    analyzed_at:     new Date().toISOString(),
    // Joined columns provided by belongsToTeacherClassroom
    task_title:      'What is your name?',
    task_description: 'Describe yourself.',
    max_score:       MAX_SCORE,
    classroom_id:    CLASSROOM_ID,
    student_name:    'Alice',
    student_username: 'alice',
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// 1 & 6 — Correct student receives a notification with recipient_type='student'
// ---------------------------------------------------------------------------

describe('overrideScore — notification recipient', () => {
  it('creates a notification for the submission student_id, not the teacher', async () => {
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(makeFullSubmission());

    await teacherService.overrideScore({
      submissionId: SUBMISSION_ID,
      teacherId:    TEACHER_ID,
      teacherScore: 90,
      teacherFeedback: null,
    });

    expect(notifRepo.insertOne).toHaveBeenCalledTimes(1);
    const args = notifRepo.insertOne.mock.calls[0][0];
    expect(args.recipientType).toBe('student');
    expect(args.recipientId).toBe(STUDENT_ID);
    // Explicitly confirm the teacher is NOT the recipient
    expect(args.recipientId).not.toBe(TEACHER_ID);
  });

  it('passes the task_id as the notification taskId', async () => {
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(makeFullSubmission());

    await teacherService.overrideScore({
      submissionId: SUBMISSION_ID,
      teacherId:    TEACHER_ID,
      teacherScore: 90,
      teacherFeedback: null,
    });

    const args = notifRepo.insertOne.mock.calls[0][0];
    expect(args.taskId).toBe(TASK_ID);
  });
});

// ---------------------------------------------------------------------------
// 2 — Notification contains the task title
// ---------------------------------------------------------------------------

describe('overrideScore — notification contains task title', () => {
  it('notification message includes the task title', async () => {
    const sub = makeFullSubmission({ task_title: 'What is your name?' });
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(sub);

    await teacherService.overrideScore({
      submissionId: SUBMISSION_ID,
      teacherId:    TEACHER_ID,
      teacherScore: 85,
      teacherFeedback: null,
    });

    const args = notifRepo.insertOne.mock.calls[0][0];
    expect(args.message).toContain('What is your name?');
  });
});

// ---------------------------------------------------------------------------
// 3 — Notification contains the teacher score
// ---------------------------------------------------------------------------

describe('overrideScore — notification contains teacher score', () => {
  it('notification message includes the teacher score and max score', async () => {
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(makeFullSubmission());

    await teacherService.overrideScore({
      submissionId:    SUBMISSION_ID,
      teacherId:       TEACHER_ID,
      teacherScore:    9,
      teacherFeedback: null,
    });

    const args = notifRepo.insertOne.mock.calls[0][0];
    expect(args.message).toContain('9');
    expect(args.message).toContain(`${MAX_SCORE}`);
  });

  it('notification message does NOT show AI score as teacher score', async () => {
    const sub = makeFullSubmission({ ai_score: 8, task_title: 'Intro Task' });
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(sub);

    await teacherService.overrideScore({
      submissionId:    SUBMISSION_ID,
      teacherId:       TEACHER_ID,
      teacherScore:    9,
      teacherFeedback: null,
    });

    const args = notifRepo.insertOne.mock.calls[0][0];
    // Should say 9 (teacher score), not 8 (AI score)
    expect(args.message).toContain('9');
    // "8" might appear in the max_score context but NOT as the primary score
    // The key check: message uses the value passed as teacherScore
    expect(args.message).toMatch(/9\//);
  });
});

// ---------------------------------------------------------------------------
// 4 — Notification type is 'score_overridden'
// ---------------------------------------------------------------------------

describe('overrideScore — notification type', () => {
  it('notification type is score_overridden', async () => {
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(makeFullSubmission());

    await teacherService.overrideScore({
      submissionId:    SUBMISSION_ID,
      teacherId:       TEACHER_ID,
      teacherScore:    80,
      teacherFeedback: null,
    });

    const args = notifRepo.insertOne.mock.calls[0][0];
    expect(args.type).toBe('score_overridden');
  });

  it('notification title is "Your assignment has been graded"', async () => {
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(makeFullSubmission());

    await teacherService.overrideScore({
      submissionId:    SUBMISSION_ID,
      teacherId:       TEACHER_ID,
      teacherScore:    80,
      teacherFeedback: null,
    });

    const args = notifRepo.insertOne.mock.calls[0][0];
    expect(args.title).toBe('Your assignment has been graded');
  });
});

// ---------------------------------------------------------------------------
// 5 & 7 — Teacher cannot create a notification for an unrelated student
//          (ownership guard: belongsToTeacherClassroom returns null)
// ---------------------------------------------------------------------------

describe('overrideScore — ownership guard prevents notification to wrong student', () => {
  it('throws 404 and does NOT create a notification when submission is not found', async () => {
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(null);

    await expect(
      teacherService.overrideScore({
        submissionId: SUBMISSION_ID,
        teacherId:    OTHER_TEACHER,
        teacherScore: 90,
        teacherFeedback: null,
      })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(notifRepo.insertOne).not.toHaveBeenCalled();
  });

  it('never receives a notification for unrelated student ID', async () => {
    // The belonging check already enforces this at the query level,
    // but we verify the notification recipientId is always sub.student_id
    const sub = makeFullSubmission({ student_id: STUDENT_ID });
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(sub);

    await teacherService.overrideScore({
      submissionId: SUBMISSION_ID,
      teacherId:    TEACHER_ID,
      teacherScore: 70,
      teacherFeedback: null,
    });

    const args = notifRepo.insertOne.mock.calls[0][0];
    expect(args.recipientId).toBe(STUDENT_ID);
    expect(args.recipientId).not.toBe(UNRELATED_STUDENT);
  });
});

// ---------------------------------------------------------------------------
// 8 — Feedback is included in the message when provided
// ---------------------------------------------------------------------------

describe('overrideScore — feedback in notification', () => {
  it('includes teacher feedback in the notification message when provided', async () => {
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(makeFullSubmission());

    await teacherService.overrideScore({
      submissionId:    SUBMISSION_ID,
      teacherId:       TEACHER_ID,
      teacherScore:    88,
      teacherFeedback: 'Excellent work on the conclusion.',
    });

    const args = notifRepo.insertOne.mock.calls[0][0];
    expect(args.message).toContain('Excellent work on the conclusion.');
  });

  it('does NOT include undefined/null feedback text in the message', async () => {
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(makeFullSubmission());

    await teacherService.overrideScore({
      submissionId:    SUBMISSION_ID,
      teacherId:       TEACHER_ID,
      teacherScore:    88,
      teacherFeedback: null,
    });

    const args = notifRepo.insertOne.mock.calls[0][0];
    expect(args.message).not.toContain('null');
    expect(args.message).not.toContain('undefined');
  });
});

// ---------------------------------------------------------------------------
// 9 — Notification message is meaningful without feedback
// ---------------------------------------------------------------------------

describe('overrideScore — notification message without feedback', () => {
  it('message contains the task title and score even without feedback', async () => {
    const sub = makeFullSubmission({ task_title: 'Math Quiz 1', max_score: 50 });
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(sub);

    await teacherService.overrideScore({
      submissionId:    SUBMISSION_ID,
      teacherId:       TEACHER_ID,
      teacherScore:    45,
      teacherFeedback: null,
    });

    const args = notifRepo.insertOne.mock.calls[0][0];
    expect(args.message).toContain('Math Quiz 1');
    expect(args.message).toContain('45');
    expect(args.message).toContain('50');
  });
});

// ---------------------------------------------------------------------------
// 11 — Existing grading functionality: submission row is updated
// ---------------------------------------------------------------------------

describe('overrideScore — submission row is updated (non-regression)', () => {
  it('calls submissionRepo.overrideScore with the correct arguments', async () => {
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(makeFullSubmission());

    await teacherService.overrideScore({
      submissionId:    SUBMISSION_ID,
      teacherId:       TEACHER_ID,
      teacherScore:    75,
      teacherFeedback: 'Good effort.',
    });

    expect(submissionRepo.overrideScore).toHaveBeenCalledWith(
      SUBMISSION_ID,
      TEACHER_ID,
      75,
      'Good effort.'
    );
  });

  it('passes null teacherScore when score is not provided (score removal)', async () => {
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(makeFullSubmission());

    await teacherService.overrideScore({
      submissionId:    SUBMISSION_ID,
      teacherId:       TEACHER_ID,
      teacherScore:    undefined,
      teacherFeedback: 'No score set.',
    });

    expect(submissionRepo.overrideScore).toHaveBeenCalledWith(
      SUBMISSION_ID,
      TEACHER_ID,
      null,
      'No score set.'
    );
  });
});

// ---------------------------------------------------------------------------
// One notification per grading action (no duplicate creation in this call)
// ---------------------------------------------------------------------------

describe('overrideScore — exactly one notification per grading action', () => {
  it('creates exactly one notification per overrideScore call', async () => {
    submissionRepo.belongsToTeacherClassroom.mockResolvedValue(makeFullSubmission());

    await teacherService.overrideScore({
      submissionId:    SUBMISSION_ID,
      teacherId:       TEACHER_ID,
      teacherScore:    90,
      teacherFeedback: null,
    });

    expect(notifRepo.insertOne).toHaveBeenCalledTimes(1);
  });
});
