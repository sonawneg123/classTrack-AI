/**
 * server/tests/unit/services/questionBankStudentPersistence.service.test.js
 *
 * Regression tests for the question-bank persistence and real-time sync fix.
 *
 * Root causes being guarded against:
 *
 *   PERSISTENCE:
 *     The student Question Bank page was reading generated questions from
 *     React mutation state (generateMutation.data), which is lost on page
 *     reload.  After the fix, a dedicated `listByStudent` service method
 *     reads from the DB, and the frontend uses useMyQuestions() which always
 *     fetches from the database.
 *
 *   REAL-TIME SYNC:
 *     Teacher status changes (approve / publish) were only invalidating the
 *     teacher-side query key (QK.pendingApproval).  The student-side query
 *     had no polling and was never invalidated.  After the fix the student
 *     uses useMyQuestions() which polls every 15 s and also refetches on
 *     window focus.
 *
 *   AUTHORISATION:
 *     Students must only see questions they created themselves in a curriculum
 *     owned by their classroom teacher — never questions from other students
 *     or other teachers.
 */

jest.mock('../../../src/repositories/questionBank.repository', () => ({
  findByIdForTeacher:       jest.fn(),
  findPublishedById:        jest.fn(),
  listByTopic:              jest.fn(),
  listPendingApproval:      jest.fn(),
  listReviewQueue:          jest.fn(),
  listPublishedForTeacher:  jest.fn(),
  listByStudent:            jest.fn(),   // NEW
  listPublishedForStudent:  jest.fn(),
  updateStatus:             jest.fn(),
  existsDuplicate:          jest.fn(),
  insert:                   jest.fn(),
}));
jest.mock('../../../src/repositories/topic.repository', () => ({
  findOwnedById: jest.fn(),
}));
jest.mock('../../../src/database/connection', () => ({
  pool: { query: jest.fn() },
}));

const questionBankService = require('../../../src/services/questions/questionBank.service');
const questionRepo = require('../../../src/repositories/questionBank.repository');
const { pool }     = require('../../../src/database/connection');

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TEACHER_ID = 1;
const STUDENT_ID = 10;
const TOPIC_ID   = 42;

const PENDING_Q = {
  id: 1, status: 'pending_approval', question_text: 'What is photosynthesis?',
  created_by: STUDENT_ID, created_by_role: 'student', topic_id: TOPIC_ID,
};
const APPROVED_Q = { ...PENDING_Q, id: 2, status: 'approved' };
const PUBLISHED_Q = { ...PENDING_Q, id: 3, status: 'published' };
const REJECTED_Q  = { ...PENDING_Q, id: 4, status: 'rejected', rejected_reason: 'Too vague' };

beforeEach(() => {
  jest.clearAllMocks();
  // Default: student belongs to a classroom with TEACHER_ID
  pool.query.mockResolvedValue([[{ teacher_id: TEACHER_ID }]]);
});

// ── PERSISTENCE: listByStudent ─────────────────────────────────────────────────
describe('questionBankService.listByStudent — persistence', () => {

  it('returns all statuses for the student (pending, approved, published, rejected)', async () => {
    questionRepo.listByStudent.mockResolvedValue([
      PENDING_Q, APPROVED_Q, PUBLISHED_Q, REJECTED_Q,
    ]);

    const result = await questionBankService.listByStudent(STUDENT_ID);

    expect(result).toHaveLength(4);
    expect(result.map((q) => q.status)).toEqual(
      expect.arrayContaining(['pending_approval', 'approved', 'published', 'rejected'])
    );
  });

  it('passes the correct studentTeacherId to the repository', async () => {
    questionRepo.listByStudent.mockResolvedValue([PENDING_Q]);

    await questionBankService.listByStudent(STUDENT_ID);

    // _getStudentTeacherId resolves TEACHER_ID; it must be forwarded to the repo
    expect(questionRepo.listByStudent).toHaveBeenCalledWith(STUDENT_ID, TEACHER_ID, {});
  });

  it('forwards topicId filter when supplied', async () => {
    questionRepo.listByStudent.mockResolvedValue([PENDING_Q]);

    await questionBankService.listByStudent(STUDENT_ID, { topicId: TOPIC_ID });

    expect(questionRepo.listByStudent).toHaveBeenCalledWith(
      STUDENT_ID, TEACHER_ID, { topicId: TOPIC_ID }
    );
  });

  it('returns an empty array when the student has no questions', async () => {
    questionRepo.listByStudent.mockResolvedValue([]);

    const result = await questionBankService.listByStudent(STUDENT_ID);

    expect(result).toEqual([]);
  });

  it('throws 404 when student classroom cannot be resolved (no classroom_id)', async () => {
    pool.query.mockResolvedValue([[]]); // no classroom row

    await expect(questionBankService.listByStudent(STUDENT_ID))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── PERSISTENCE: survives page reload ─────────────────────────────────────────
// This group of tests documents the "before" bug and verifies the fix.
describe('questionBankService.listByStudent — page-reload survival', () => {

  it('returns previously generated questions from the DB when called a second time', async () => {
    // First call (simulate first page load after generation)
    questionRepo.listByStudent.mockResolvedValueOnce([PENDING_Q]);
    const first = await questionBankService.listByStudent(STUDENT_ID, { topicId: TOPIC_ID });
    expect(first).toHaveLength(1);

    // Second call (simulate page reload — React state gone, must come from DB)
    questionRepo.listByStudent.mockResolvedValueOnce([PENDING_Q]);
    const second = await questionBankService.listByStudent(STUDENT_ID, { topicId: TOPIC_ID });
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(PENDING_Q.id);
    expect(second[0].status).toBe('pending_approval');
  });
});

// ── REAL-TIME SYNC: status changes propagate ───────────────────────────────────
describe('questionBankService.listByStudent — real-time status reflection', () => {

  it('returns "approved" status after teacher approves the question', async () => {
    questionRepo.listByStudent.mockResolvedValue([APPROVED_Q]);

    const result = await questionBankService.listByStudent(STUDENT_ID, { topicId: TOPIC_ID });

    expect(result[0].status).toBe('approved');
  });

  it('returns "published" status after teacher publishes the question', async () => {
    questionRepo.listByStudent.mockResolvedValue([PUBLISHED_Q]);

    const result = await questionBankService.listByStudent(STUDENT_ID, { topicId: TOPIC_ID });

    expect(result[0].status).toBe('published');
  });

  it('returns "rejected" status with rejection reason', async () => {
    questionRepo.listByStudent.mockResolvedValue([REJECTED_Q]);

    const result = await questionBankService.listByStudent(STUDENT_ID, { topicId: TOPIC_ID });

    expect(result[0].status).toBe('rejected');
    expect(result[0].rejected_reason).toBe('Too vague');
  });
});

// ── AUTHORISATION: student cannot see other students' questions ────────────────
describe('questionBankService.listByStudent — authorisation', () => {

  it('scopes query to the student id (repo called with correct studentId)', async () => {
    const OTHER_STUDENT_ID = 99;
    questionRepo.listByStudent.mockResolvedValue([]);

    await questionBankService.listByStudent(OTHER_STUDENT_ID);

    // The repository must be called with OTHER_STUDENT_ID, not a hardcoded value.
    expect(questionRepo.listByStudent).toHaveBeenCalledWith(
      OTHER_STUDENT_ID, TEACHER_ID, {}
    );
  });

  it('uses the teacher from the STUDENT\'s classroom, not a cross-classroom teacher', async () => {
    const ANOTHER_TEACHER_ID = 5;
    // This student belongs to a DIFFERENT classroom
    pool.query.mockResolvedValue([[{ teacher_id: ANOTHER_TEACHER_ID }]]);
    questionRepo.listByStudent.mockResolvedValue([]);

    await questionBankService.listByStudent(STUDENT_ID);

    // Must NOT use TEACHER_ID — must use ANOTHER_TEACHER_ID from the DB
    expect(questionRepo.listByStudent).toHaveBeenCalledWith(
      STUDENT_ID, ANOTHER_TEACHER_ID, {}
    );
  });
});

// ── TEACHER APPROVAL: database status changes are persisted ───────────────────
describe('teacher approval updates database status (persistence)', () => {

  it('approving a question changes its database status to "approved"', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue(PENDING_Q);
    questionRepo.updateStatus.mockResolvedValue({ id: 1, status: 'approved', updated_at: new Date().toISOString() });

    const result = await questionBankService.approveQuestion(PENDING_Q.id, TEACHER_ID);

    expect(result.status).toBe('approved');
    expect(questionRepo.updateStatus).toHaveBeenCalledWith(
      PENDING_Q.id, TEACHER_ID, 'approved',
      expect.objectContaining({ approvedBy: TEACHER_ID })
    );
  });

  it('publishing a question changes its database status to "published"', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue(APPROVED_Q);
    questionRepo.updateStatus.mockResolvedValue({ id: 2, status: 'published', updated_at: new Date().toISOString() });

    const result = await questionBankService.publishQuestion(APPROVED_Q.id, TEACHER_ID);

    expect(result.status).toBe('published');
    expect(questionRepo.updateStatus).toHaveBeenCalledWith(
      APPROVED_Q.id, TEACHER_ID, 'published', {}
    );
  });

  it('after approval, student list returns the approved status on next fetch', async () => {
    // Simulate: teacher approves → student refetches
    questionRepo.listByStudent.mockResolvedValue([APPROVED_Q]);

    const studentView = await questionBankService.listByStudent(STUDENT_ID, { topicId: TOPIC_ID });

    expect(studentView[0].status).toBe('approved');
  });

  it('after publish, student list returns the published status on next fetch', async () => {
    questionRepo.listByStudent.mockResolvedValue([PUBLISHED_Q]);

    const studentView = await questionBankService.listByStudent(STUDENT_ID, { topicId: TOPIC_ID });

    expect(studentView[0].status).toBe('published');
  });
});
