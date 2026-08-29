/**
 * server/tests/unit/services/questionBank.service.test.js
 *
 * Tests for QuestionBankService business logic.
 * All repositories and pool mocked.
 */
jest.mock('../../../src/repositories/questionBank.repository', () => ({
  findByIdForTeacher:       jest.fn(),
  findPublishedById:        jest.fn(),
  listByTopic:              jest.fn(),
  listPendingApproval:      jest.fn(),
  listPublishedForStudent:  jest.fn(),
  updateStatus:             jest.fn(),
  existsDuplicate:          jest.fn(),
  insert:                   jest.fn(),
}));
jest.mock('../../../src/repositories/topic.repository', () => ({
  findOwnedById: jest.fn(),
}));
// Mock the DB pool used by _getStudentTeacherId
jest.mock('../../../src/database/connection', () => ({
  pool: { query: jest.fn() },
}));

const questionBankService = require('../../../src/services/questions/questionBank.service');
const questionRepo = require('../../../src/repositories/questionBank.repository');
const topicRepo    = require('../../../src/repositories/topic.repository');
const { pool }     = require('../../../src/database/connection');

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TEACHER_ID = 1;
const OTHER_TEACHER_ID = 2;
const STUDENT_ID = 10;
const QUESTION_ID = 42;

const MOCK_QUESTION_PENDING = {
  id: QUESTION_ID,
  status: 'pending_approval',
  question_text: 'What is photosynthesis?',
  curriculum_id: 1,
};

const MOCK_QUESTION_APPROVED = {
  id: QUESTION_ID,
  status: 'approved',
  question_text: 'What is photosynthesis?',
  curriculum_id: 1,
};

const MOCK_QUESTION_PUBLISHED = {
  id: QUESTION_ID,
  status: 'published',
  question_text: 'What is photosynthesis?',
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default pool mock for student teacher lookup
  pool.query.mockResolvedValue([[{ teacher_id: TEACHER_ID }]]);
});

// ── listByTopic ───────────────────────────────────────────────────────────────
describe('questionBankService.listByTopic', () => {
  it('throws 404 when topic is not owned by teacher', async () => {
    topicRepo.findOwnedById.mockResolvedValue(null);
    await expect(questionBankService.listByTopic(99, TEACHER_ID))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('delegates to repo when topic is owned', async () => {
    topicRepo.findOwnedById.mockResolvedValue({ id: 10 });
    questionRepo.listByTopic.mockResolvedValue([MOCK_QUESTION_PENDING]);
    const result = await questionBankService.listByTopic(10, TEACHER_ID);
    expect(result).toHaveLength(1);
    expect(questionRepo.listByTopic).toHaveBeenCalledWith(10, TEACHER_ID, {});
  });
});

// ── listPendingApproval ────────────────────────────────────────────────────────
describe('questionBankService.listPendingApproval', () => {
  it('returns pending questions for the teacher', async () => {
    questionRepo.listPendingApproval.mockResolvedValue([MOCK_QUESTION_PENDING]);
    const result = await questionBankService.listPendingApproval(TEACHER_ID);
    expect(result).toHaveLength(1);
    expect(questionRepo.listPendingApproval).toHaveBeenCalledWith(TEACHER_ID);
  });
});

// ── approveQuestion ────────────────────────────────────────────────────────────
describe('questionBankService.approveQuestion', () => {
  it('throws 404 when question not found', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue(null);
    await expect(questionBankService.approveQuestion(QUESTION_ID, TEACHER_ID))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 400 when question is not in pending_approval status', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue(MOCK_QUESTION_APPROVED);
    await expect(questionBankService.approveQuestion(QUESTION_ID, TEACHER_ID))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('approves a pending question', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue(MOCK_QUESTION_PENDING);
    questionRepo.updateStatus.mockResolvedValue({ id: QUESTION_ID, status: 'approved' });
    const result = await questionBankService.approveQuestion(QUESTION_ID, TEACHER_ID);
    expect(result.status).toBe('approved');
    expect(questionRepo.updateStatus).toHaveBeenCalledWith(
      QUESTION_ID, TEACHER_ID, 'approved',
      expect.objectContaining({ approvedBy: TEACHER_ID })
    );
  });
});

// ── rejectQuestion ─────────────────────────────────────────────────────────────
describe('questionBankService.rejectQuestion', () => {
  it('throws 404 when question not found', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue(null);
    await expect(questionBankService.rejectQuestion(QUESTION_ID, TEACHER_ID, 'Bad question'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 400 when question is in published status', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue(MOCK_QUESTION_PUBLISHED);
    await expect(questionBankService.rejectQuestion(QUESTION_ID, TEACHER_ID))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a pending question with reason', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue(MOCK_QUESTION_PENDING);
    questionRepo.updateStatus.mockResolvedValue({ id: QUESTION_ID, status: 'rejected' });
    const result = await questionBankService.rejectQuestion(QUESTION_ID, TEACHER_ID, 'Inaccurate');
    expect(result.status).toBe('rejected');
    expect(questionRepo.updateStatus).toHaveBeenCalledWith(
      QUESTION_ID, TEACHER_ID, 'rejected',
      expect.objectContaining({ rejectedReason: 'Inaccurate' })
    );
  });
});

// ── publishQuestion ────────────────────────────────────────────────────────────
describe('questionBankService.publishQuestion', () => {
  it('throws 400 when question is not approved', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue(MOCK_QUESTION_PENDING);
    await expect(questionBankService.publishQuestion(QUESTION_ID, TEACHER_ID))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('publishes an approved question', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue(MOCK_QUESTION_APPROVED);
    questionRepo.updateStatus.mockResolvedValue({ id: QUESTION_ID, status: 'published' });
    const result = await questionBankService.publishQuestion(QUESTION_ID, TEACHER_ID);
    expect(result.status).toBe('published');
  });

  it('does not allow a student to approve', async () => {
    // Students call a different service path — they don't have the QUESTION_APPROVE
    // permission so the route guard blocks them at the HTTP layer. At the service
    // layer we verify that listPublishedForStudent is the only student path, not approve.
    // The approveQuestion method requires a teacherId and does findByIdForTeacher.
    questionRepo.findByIdForTeacher.mockResolvedValue(null); // student ID != teacher
    await expect(questionBankService.approveQuestion(QUESTION_ID, STUDENT_ID))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── archiveQuestion ────────────────────────────────────────────────────────────
describe('questionBankService.archiveQuestion', () => {
  it('archives a question', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue(MOCK_QUESTION_PUBLISHED);
    questionRepo.updateStatus.mockResolvedValue({ id: QUESTION_ID, status: 'archived' });
    const result = await questionBankService.archiveQuestion(QUESTION_ID, TEACHER_ID);
    expect(result.status).toBe('archived');
  });

  it('throws 400 when question is already archived', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue({ ...MOCK_QUESTION_PUBLISHED, status: 'archived' });
    await expect(questionBankService.archiveQuestion(QUESTION_ID, TEACHER_ID))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── Cross-teacher access ───────────────────────────────────────────────────────
describe('cross-teacher access denial', () => {
  it('teacher 2 cannot approve teacher 1\'s question', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue(null); // not owned by teacher 2
    await expect(questionBankService.approveQuestion(QUESTION_ID, OTHER_TEACHER_ID))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(questionRepo.findByIdForTeacher).toHaveBeenCalledWith(QUESTION_ID, OTHER_TEACHER_ID);
  });

  it('teacher 2 cannot reject teacher 1\'s question', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue(null);
    await expect(questionBankService.rejectQuestion(QUESTION_ID, OTHER_TEACHER_ID))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('teacher 2 cannot publish teacher 1\'s question', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue(null);
    await expect(questionBankService.publishQuestion(QUESTION_ID, OTHER_TEACHER_ID))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── Student views ─────────────────────────────────────────────────────────────
describe('questionBankService — student access', () => {
  it('student can list published questions for a topic', async () => {
    pool.query.mockResolvedValue([[{ teacher_id: TEACHER_ID }]]);
    questionRepo.listPublishedForStudent.mockResolvedValue([MOCK_QUESTION_PUBLISHED]);
    const result = await questionBankService.listPublishedForStudent(10, STUDENT_ID);
    expect(result).toHaveLength(1);
    expect(questionRepo.listPublishedForStudent).toHaveBeenCalledWith(10, TEACHER_ID);
  });

  it('student cannot view questions from another classroom\'s teacher', async () => {
    pool.query.mockResolvedValue([[{ teacher_id: TEACHER_ID }]]);
    questionRepo.findPublishedById.mockResolvedValue(null); // not accessible
    await expect(questionBankService.getPublishedQuestion(QUESTION_ID, STUDENT_ID))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 when student classroom cannot be resolved', async () => {
    pool.query.mockResolvedValue([[]]); // no classroom found
    await expect(questionBankService.listPublishedForStudent(10, 999))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── Status lifecycle: pending → approved → published ──────────────────────────
describe('question status lifecycle', () => {
  it('can only publish approved questions', async () => {
    // pending_approval → cannot publish
    questionRepo.findByIdForTeacher.mockResolvedValue(MOCK_QUESTION_PENDING);
    await expect(questionBankService.publishQuestion(QUESTION_ID, TEACHER_ID))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('approved question can be published', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue(MOCK_QUESTION_APPROVED);
    questionRepo.updateStatus.mockResolvedValue({ id: QUESTION_ID, status: 'published' });
    const result = await questionBankService.publishQuestion(QUESTION_ID, TEACHER_ID);
    expect(result.status).toBe('published');
  });

  it('pending questions cannot be published directly', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue({ ...MOCK_QUESTION_PENDING, status: 'pending_approval' });
    await expect(questionBankService.publishQuestion(QUESTION_ID, TEACHER_ID))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});
