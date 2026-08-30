/**
 * server/tests/unit/services/quizResultsTeacher.service.test.js
 *
 * Unit tests for the teacher result service functions (Sprint 5):
 *   listTopicResults — verify ownership check + delegation
 *   listQuestionResults — verify ownership check + delegation
 *
 * All repositories are mocked — no database required.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../src/repositories/questionBank.repository', () => ({
  findByIdForTeacher:      jest.fn(),
  findPublishedById:       jest.fn(),
  listByTopic:             jest.fn(),
  listPendingApproval:     jest.fn(),
  listReviewQueue:         jest.fn(),
  listPublishedForTeacher: jest.fn(),
  listPublishedForStudent: jest.fn(),
  updateStatus:            jest.fn(),
  existsDuplicate:         jest.fn(),
  insert:                  jest.fn(),
  listByStudent:           jest.fn(),
}));

jest.mock('../../../src/repositories/quizAttempt.repository', () => ({
  upsert:                       jest.fn(),
  findByStudentAndQuestion:     jest.fn(),
  listByStudent:                jest.fn(),
  countByStudentAndTopic:       jest.fn(),
  listByTopicForTeacher:        jest.fn(),
  listByQuestionForTeacher:     jest.fn(),
}));

jest.mock('../../../src/repositories/topic.repository', () => ({
  findOwnedById: jest.fn(),
}));

jest.mock('../../../src/database/connection', () => ({
  pool: { query: jest.fn() },
}));

const questionBankService = require('../../../src/services/questions/questionBank.service');
const questionRepo  = require('../../../src/repositories/questionBank.repository');
const attemptRepo   = require('../../../src/repositories/quizAttempt.repository');
const topicRepo     = require('../../../src/repositories/topic.repository');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TEACHER_ID  = 1;
const TOPIC_ID    = 5;
const QUESTION_ID = 42;

const MOCK_TOPIC = { id: TOPIC_ID, name: 'Photosynthesis', teacher_id: TEACHER_ID };

const MOCK_QUESTION = {
  id: QUESTION_ID,
  question_type: 'mcq',
  question_text: 'What is produced by photosynthesis?',
  correct_answer: 'Glucose',
  marks: 1.00,
  status: 'published',
  curriculum_id: 1,
};

const MOCK_ATTEMPT_TEACHER = {
  id:                1,
  student_id:        10,
  question_id:       QUESTION_ID,
  student_answer:    'Glucose',
  is_correct:        true,
  score:             '1.00',
  attempt_count:     1,
  first_attempted_at: '2025-01-01T10:00:00.000Z',
  last_attempted_at:  '2025-01-01T10:00:00.000Z',
  question_text:     'What is produced by photosynthesis?',
  question_type:     'mcq',
  difficulty:        'easy',
  marks:             '1.00',
  correct_answer:    'Glucose',
  topic_id:          TOPIC_ID,
  student_name:      'Alice Smith',
  student_username:  'alice_smith',
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ── listTopicResults ─────────────────────────────────────────────────────────

describe('questionBankService.listTopicResults', () => {
  it('returns attempts when teacher owns the topic', async () => {
    topicRepo.findOwnedById.mockResolvedValue(MOCK_TOPIC);
    attemptRepo.listByTopicForTeacher.mockResolvedValue([MOCK_ATTEMPT_TEACHER]);

    const result = await questionBankService.listTopicResults(TOPIC_ID, TEACHER_ID);

    expect(topicRepo.findOwnedById).toHaveBeenCalledWith(TOPIC_ID, TEACHER_ID);
    expect(attemptRepo.listByTopicForTeacher).toHaveBeenCalledWith(TOPIC_ID, TEACHER_ID);
    expect(result).toHaveLength(1);
    expect(result[0].student_name).toBe('Alice Smith');
  });

  it('throws 404 when topic is not owned by the teacher', async () => {
    topicRepo.findOwnedById.mockResolvedValue(null); // not owned

    await expect(
      questionBankService.listTopicResults(TOPIC_ID, TEACHER_ID)
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(attemptRepo.listByTopicForTeacher).not.toHaveBeenCalled();
  });

  it('returns empty array when no students have attempted yet', async () => {
    topicRepo.findOwnedById.mockResolvedValue(MOCK_TOPIC);
    attemptRepo.listByTopicForTeacher.mockResolvedValue([]);

    const result = await questionBankService.listTopicResults(TOPIC_ID, TEACHER_ID);
    expect(result).toEqual([]);
  });
});

// ── listQuestionResults ──────────────────────────────────────────────────────

describe('questionBankService.listQuestionResults', () => {
  it('returns attempts when teacher owns the question', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue(MOCK_QUESTION);
    attemptRepo.listByQuestionForTeacher.mockResolvedValue([MOCK_ATTEMPT_TEACHER]);

    const result = await questionBankService.listQuestionResults(QUESTION_ID, TEACHER_ID);

    expect(questionRepo.findByIdForTeacher).toHaveBeenCalledWith(QUESTION_ID, TEACHER_ID);
    expect(attemptRepo.listByQuestionForTeacher).toHaveBeenCalledWith(QUESTION_ID, TEACHER_ID);
    expect(result).toHaveLength(1);
  });

  it('throws 404 when question does not belong to the teacher', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue(null); // not owned

    await expect(
      questionBankService.listQuestionResults(QUESTION_ID, TEACHER_ID)
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(attemptRepo.listByQuestionForTeacher).not.toHaveBeenCalled();
  });

  it('returns empty array when no students have attempted yet', async () => {
    questionRepo.findByIdForTeacher.mockResolvedValue(MOCK_QUESTION);
    attemptRepo.listByQuestionForTeacher.mockResolvedValue([]);

    const result = await questionBankService.listQuestionResults(QUESTION_ID, TEACHER_ID);
    expect(result).toEqual([]);
  });
});
