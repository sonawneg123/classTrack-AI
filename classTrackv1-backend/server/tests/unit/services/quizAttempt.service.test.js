/**
 * server/tests/unit/services/quizAttempt.service.test.js
 *
 * Unit tests for the quiz attempt business logic in questionBank.service.js
 * (submitAttempt, listMyAttempts, getMyAttempt).
 *
 * All repositories and the DB pool are mocked — no database required.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────
jest.mock('../../../src/repositories/questionBank.repository', () => ({
  findByIdForTeacher:       jest.fn(),
  findPublishedById:        jest.fn(),
  listByTopic:              jest.fn(),
  listPendingApproval:      jest.fn(),
  listReviewQueue:          jest.fn(),
  listPublishedForTeacher:  jest.fn(),
  listPublishedForStudent:  jest.fn(),
  updateStatus:             jest.fn(),
  existsDuplicate:          jest.fn(),
  insert:                   jest.fn(),
  listByStudent:            jest.fn(),
}));

jest.mock('../../../src/repositories/quizAttempt.repository', () => ({
  upsert:                       jest.fn(),
  findByStudentAndQuestion:     jest.fn(),
  listByStudent:                jest.fn(),
  countByStudentAndTopic:       jest.fn(),
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
const { pool }      = require('../../../src/database/connection');

// ── Fixtures ──────────────────────────────────────────────────────────────────
const STUDENT_ID   = 10;
const TEACHER_ID   = 1;
const QUESTION_ID  = 42;

const MOCK_PUBLISHED_MCQ = {
  id:              QUESTION_ID,
  question_type:   'mcq',
  question_text:   'What is photosynthesis?',
  correct_answer:  'Glucose',
  explanation:     'Plants convert sunlight to glucose.',
  marks:           1.00,
  status:          'published',
  curriculum_id:   1,
};

const MOCK_PUBLISHED_DESCRIPTIVE = {
  ...MOCK_PUBLISHED_MCQ,
  question_type:  'descriptive',
  question_text:  'Describe photosynthesis in detail.',
  correct_answer: 'Photosynthesis is the process…',
};

const MOCK_ATTEMPT_ROW = {
  id:               99,
  student_id:       STUDENT_ID,
  question_id:      QUESTION_ID,
  student_answer:   'Glucose',
  is_correct:       true,
  score:            1.00,
  attempt_count:    1,
  first_attempted_at: new Date().toISOString(),
  last_attempted_at:  new Date().toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default pool mock: student is in teacher 1's classroom
  pool.query.mockResolvedValue([[{ teacher_id: TEACHER_ID }]]);
});

// ── submitAttempt — validation ────────────────────────────────────────────────
describe('questionBankService.submitAttempt — validation', () => {
  it('throws 400 when studentAnswer is empty string', async () => {
    await expect(
      questionBankService.submitAttempt(QUESTION_ID, STUDENT_ID, '')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when studentAnswer is whitespace only', async () => {
    await expect(
      questionBankService.submitAttempt(QUESTION_ID, STUDENT_ID, '   ')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 404 when question is not published / not accessible', async () => {
    questionRepo.findPublishedById.mockResolvedValue(null);
    await expect(
      questionBankService.submitAttempt(QUESTION_ID, STUDENT_ID, 'Glucose')
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 when student has no classroom', async () => {
    pool.query.mockResolvedValue([[]]); // no classroom
    await expect(
      questionBankService.submitAttempt(QUESTION_ID, STUDENT_ID, 'Glucose')
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── submitAttempt — MCQ auto-scoring ─────────────────────────────────────────
describe('questionBankService.submitAttempt — MCQ auto-scoring', () => {
  beforeEach(() => {
    questionRepo.findPublishedById.mockResolvedValue(MOCK_PUBLISHED_MCQ);
    attemptRepo.upsert.mockResolvedValue({ ...MOCK_ATTEMPT_ROW });
  });

  it('scores is_correct=true when answer matches exactly (case-insensitive)', async () => {
    const result = await questionBankService.submitAttempt(QUESTION_ID, STUDENT_ID, 'Glucose');
    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(1);
    expect(attemptRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ isCorrect: true, score: 1 })
    );
  });

  it('scores is_correct=true regardless of capitalisation', async () => {
    const result = await questionBankService.submitAttempt(QUESTION_ID, STUDENT_ID, 'glucose');
    expect(result.isCorrect).toBe(true);
  });

  it('scores is_correct=true regardless of surrounding whitespace', async () => {
    const result = await questionBankService.submitAttempt(QUESTION_ID, STUDENT_ID, '  Glucose  ');
    expect(result.isCorrect).toBe(true);
  });

  it('scores is_correct=false when answer does not match', async () => {
    attemptRepo.upsert.mockResolvedValue({ ...MOCK_ATTEMPT_ROW, is_correct: false, score: 0 });
    const result = await questionBankService.submitAttempt(QUESTION_ID, STUDENT_ID, 'Starch');
    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(0);
    expect(attemptRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ isCorrect: false, score: 0 })
    );
  });

  it('reveals correctAnswer and explanation in the response', async () => {
    const result = await questionBankService.submitAttempt(QUESTION_ID, STUDENT_ID, 'Glucose');
    expect(result.correctAnswer).toBe('Glucose');
    expect(result.explanation).toBe('Plants convert sunlight to glucose.');
  });
});

// ── submitAttempt — true_false auto-scoring ────────────────────────────────────
describe('questionBankService.submitAttempt — true_false', () => {
  const MOCK_TF = {
    ...MOCK_PUBLISHED_MCQ,
    question_type:  'true_false',
    correct_answer: 'true',
  };

  beforeEach(() => {
    questionRepo.findPublishedById.mockResolvedValue(MOCK_TF);
  });

  it('scores correctly for true_false', async () => {
    attemptRepo.upsert.mockResolvedValue({ ...MOCK_ATTEMPT_ROW, is_correct: true, score: 1 });
    const result = await questionBankService.submitAttempt(QUESTION_ID, STUDENT_ID, 'true');
    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(1);
  });

  it('scores false for wrong true_false answer', async () => {
    attemptRepo.upsert.mockResolvedValue({ ...MOCK_ATTEMPT_ROW, is_correct: false, score: 0 });
    const result = await questionBankService.submitAttempt(QUESTION_ID, STUDENT_ID, 'false');
    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(0);
  });
});

// ── submitAttempt — free-text (no auto-score) ─────────────────────────────────
describe('questionBankService.submitAttempt — free-text types', () => {
  it('returns isCorrect=null and score=null for descriptive questions', async () => {
    questionRepo.findPublishedById.mockResolvedValue(MOCK_PUBLISHED_DESCRIPTIVE);
    attemptRepo.upsert.mockResolvedValue({
      ...MOCK_ATTEMPT_ROW,
      is_correct: null,
      score: null,
    });

    const result = await questionBankService.submitAttempt(
      QUESTION_ID, STUDENT_ID, 'Plants use sunlight and CO2 to produce glucose.'
    );
    expect(result.isCorrect).toBeNull();
    expect(result.score).toBeNull();
    expect(attemptRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ isCorrect: null, score: null })
    );
  });

  it.each(['short_answer', 'scenario', 'matching'])(
    'returns null scores for %s question type',
    async (qType) => {
      questionRepo.findPublishedById.mockResolvedValue({
        ...MOCK_PUBLISHED_MCQ,
        question_type: qType,
      });
      attemptRepo.upsert.mockResolvedValue({ ...MOCK_ATTEMPT_ROW, is_correct: null, score: null });

      const result = await questionBankService.submitAttempt(
        QUESTION_ID, STUDENT_ID, 'Some free-text answer'
      );
      expect(result.isCorrect).toBeNull();
      expect(result.score).toBeNull();
    }
  );
});

// ── submitAttempt — upsert on re-attempt ─────────────────────────────────────
describe('questionBankService.submitAttempt — reattempt (upsert)', () => {
  it('increments attempt_count on re-attempt', async () => {
    questionRepo.findPublishedById.mockResolvedValue(MOCK_PUBLISHED_MCQ);
    attemptRepo.upsert.mockResolvedValue({ ...MOCK_ATTEMPT_ROW, attempt_count: 2 });

    const result = await questionBankService.submitAttempt(QUESTION_ID, STUDENT_ID, 'Glucose');
    expect(result.attemptCount).toBe(2);
  });
});

// ── submitAttempt — ownership / cross-classroom isolation ─────────────────────
describe('questionBankService.submitAttempt — ownership', () => {
  it('rejects attempt on question from a different teacher\'s curriculum', async () => {
    // pool.query returns teacher 2's classroom; findPublishedById checks teacher 2
    pool.query.mockResolvedValue([[{ teacher_id: 2 }]]);
    // But the question belongs to teacher 1 — findPublishedById returns null
    questionRepo.findPublishedById.mockResolvedValue(null);

    await expect(
      questionBankService.submitAttempt(QUESTION_ID, STUDENT_ID, 'Glucose')
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── listMyAttempts ─────────────────────────────────────────────────────────────
describe('questionBankService.listMyAttempts', () => {
  it('delegates to attemptRepo.listByStudent', async () => {
    const rows = [{ id: 1, question_id: QUESTION_ID, student_id: STUDENT_ID, is_correct: true }];
    attemptRepo.listByStudent.mockResolvedValue(rows);

    const result = await questionBankService.listMyAttempts(STUDENT_ID);
    expect(attemptRepo.listByStudent).toHaveBeenCalledWith(STUDENT_ID, null);
    expect(result).toHaveLength(1);
  });

  it('passes topicId filter when provided', async () => {
    attemptRepo.listByStudent.mockResolvedValue([]);
    await questionBankService.listMyAttempts(STUDENT_ID, { topicId: 5 });
    expect(attemptRepo.listByStudent).toHaveBeenCalledWith(STUDENT_ID, 5);
  });
});

// ── getMyAttempt ───────────────────────────────────────────────────────────────
describe('questionBankService.getMyAttempt', () => {
  it('returns the attempt when it exists', async () => {
    attemptRepo.findByStudentAndQuestion.mockResolvedValue(MOCK_ATTEMPT_ROW);
    const result = await questionBankService.getMyAttempt(QUESTION_ID, STUDENT_ID);
    expect(result).toEqual(MOCK_ATTEMPT_ROW);
    expect(attemptRepo.findByStudentAndQuestion).toHaveBeenCalledWith(STUDENT_ID, QUESTION_ID);
  });

  it('returns null when no attempt exists yet', async () => {
    attemptRepo.findByStudentAndQuestion.mockResolvedValue(null);
    const result = await questionBankService.getMyAttempt(QUESTION_ID, STUDENT_ID);
    expect(result).toBeNull();
  });
});
