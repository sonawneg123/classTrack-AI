/**
 * server/tests/unit/services/studentPractice.service.test.js
 *
 * Unit tests for studentPractice.service.js (Sprint 6).
 *
 * Tests:
 *   - listPracticeQuestions: delegates to repo, passes topicId filter
 *   - getPracticeQuestion: 404 on missing/unowned question
 *   - submitPracticeAttempt: 400 on empty answer, 404 on wrong ownership,
 *     MCQ auto-scoring, free-text null scoring, reattempt upsert
 *   - getPracticeAttempt: 404 on wrong ownership, returns attempt or null
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../../src/repositories/questionBank.repository', () => ({
  findByIdForTeacher:          jest.fn(),
  findPublishedById:           jest.fn(),
  listByTopic:                 jest.fn(),
  listPendingApproval:         jest.fn(),
  listReviewQueue:             jest.fn(),
  listPublishedForTeacher:     jest.fn(),
  listPublishedForStudent:     jest.fn(),
  updateStatus:                jest.fn(),
  existsDuplicate:             jest.fn(),
  insert:                      jest.fn(),
  listByStudent:               jest.fn(),
  // Sprint 6 practice methods
  listPracticeByStudent:       jest.fn(),
  findPracticeByIdForStudent:  jest.fn(),
}));

jest.mock('../../../src/repositories/quizAttempt.repository', () => ({
  upsert:                   jest.fn(),
  findByStudentAndQuestion: jest.fn(),
  listByStudent:            jest.fn(),
  countByStudentAndTopic:   jest.fn(),
}));

jest.mock('../../../src/repositories/topic.repository', () => ({
  findOwnedById: jest.fn(),
}));

// Mock the generation service so we don't need full RAG mocks in unit tests
jest.mock('../../../src/services/questions/questionGeneration.service', () => ({
  generateQuestions: jest.fn(),
}));

jest.mock('../../../src/database/connection', () => ({
  pool: { query: jest.fn() },
}));

const practiceService = require('../../../src/services/questions/studentPractice.service');
const questionRepo    = require('../../../src/repositories/questionBank.repository');
const attemptRepo     = require('../../../src/repositories/quizAttempt.repository');
const { generateQuestions: _gen } = require('../../../src/services/questions/questionGeneration.service');
const { pool }        = require('../../../src/database/connection');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STUDENT_ID  = 5;
const TEACHER_ID  = 1;
const QUESTION_ID = 77;

const MOCK_PRACTICE_MCQ = {
  id:              QUESTION_ID,
  question_type:   'mcq',
  question_text:   'What is photosynthesis?',
  correct_answer:  'A process',
  explanation:     'It converts sunlight.',
  marks:           1.00,
  status:          'practice',
  difficulty:      'easy',
  created_by:      STUDENT_ID,
  created_by_role: 'student',
  topic_id:        10,
};

const MOCK_PRACTICE_DESCRIPTIVE = {
  ...MOCK_PRACTICE_MCQ,
  id:            88,
  question_type: 'descriptive',
  correct_answer: 'Photosynthesis is the process...',
};

const MOCK_ATTEMPT_ROW = {
  id:               1,
  student_id:       STUDENT_ID,
  question_id:      QUESTION_ID,
  student_answer:   'A process',
  is_correct:       true,
  score:            1.00,
  attempt_count:    1,
  first_attempted_at: new Date().toISOString(),
  last_attempted_at:  new Date().toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default: student is in teacher 1's classroom
  pool.query.mockResolvedValue([[{ teacher_id: TEACHER_ID }]]);
});

// ── listPracticeQuestions ─────────────────────────────────────────────────────

describe('practiceService.listPracticeQuestions', () => {
  it('delegates to questionRepo.listPracticeByStudent', async () => {
    questionRepo.listPracticeByStudent.mockResolvedValue([MOCK_PRACTICE_MCQ]);
    const result = await practiceService.listPracticeQuestions(STUDENT_ID);
    expect(questionRepo.listPracticeByStudent).toHaveBeenCalledWith(STUDENT_ID, {});
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('practice');
  });

  it('passes topicId filter when provided', async () => {
    questionRepo.listPracticeByStudent.mockResolvedValue([]);
    await practiceService.listPracticeQuestions(STUDENT_ID, { topicId: 10 });
    expect(questionRepo.listPracticeByStudent).toHaveBeenCalledWith(STUDENT_ID, { topicId: 10 });
  });

  it('returns empty array when no practice questions exist', async () => {
    questionRepo.listPracticeByStudent.mockResolvedValue([]);
    const result = await practiceService.listPracticeQuestions(STUDENT_ID);
    expect(result).toEqual([]);
  });
});

// ── getPracticeQuestion ───────────────────────────────────────────────────────

describe('practiceService.getPracticeQuestion', () => {
  it('returns the question when owned by this student', async () => {
    questionRepo.findPracticeByIdForStudent.mockResolvedValue(MOCK_PRACTICE_MCQ);
    const result = await practiceService.getPracticeQuestion(QUESTION_ID, STUDENT_ID);
    expect(result).toEqual(MOCK_PRACTICE_MCQ);
    expect(questionRepo.findPracticeByIdForStudent).toHaveBeenCalledWith(QUESTION_ID, STUDENT_ID);
  });

  it('throws 404 when question not found or not owned', async () => {
    questionRepo.findPracticeByIdForStudent.mockResolvedValue(null);
    await expect(
      practiceService.getPracticeQuestion(QUESTION_ID, STUDENT_ID)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── submitPracticeAttempt — validation ────────────────────────────────────────

describe('practiceService.submitPracticeAttempt — validation', () => {
  it('throws 400 when studentAnswer is empty', async () => {
    await expect(
      practiceService.submitPracticeAttempt(QUESTION_ID, STUDENT_ID, '')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when studentAnswer is whitespace only', async () => {
    await expect(
      practiceService.submitPracticeAttempt(QUESTION_ID, STUDENT_ID, '   ')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 404 when practice question not found / not owned', async () => {
    questionRepo.findPracticeByIdForStudent.mockResolvedValue(null);
    await expect(
      practiceService.submitPracticeAttempt(QUESTION_ID, STUDENT_ID, 'A process')
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── submitPracticeAttempt — MCQ auto-scoring ──────────────────────────────────

describe('practiceService.submitPracticeAttempt — MCQ auto-scoring', () => {
  beforeEach(() => {
    questionRepo.findPracticeByIdForStudent.mockResolvedValue(MOCK_PRACTICE_MCQ);
    attemptRepo.upsert.mockResolvedValue({ ...MOCK_ATTEMPT_ROW });
  });

  it('scores is_correct=true for a correct answer (case-insensitive)', async () => {
    const result = await practiceService.submitPracticeAttempt(QUESTION_ID, STUDENT_ID, 'A process');
    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(1);
    expect(attemptRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ isCorrect: true, score: 1 })
    );
  });

  it('scores is_correct=false for a wrong answer', async () => {
    attemptRepo.upsert.mockResolvedValue({ ...MOCK_ATTEMPT_ROW, is_correct: false, score: 0 });
    const result = await practiceService.submitPracticeAttempt(QUESTION_ID, STUDENT_ID, 'A cycle');
    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(0);
  });

  it('reveals correctAnswer and explanation after submission', async () => {
    const result = await practiceService.submitPracticeAttempt(QUESTION_ID, STUDENT_ID, 'A process');
    expect(result.correctAnswer).toBe('A process');
    expect(result.explanation).toBe('It converts sunlight.');
  });
});

// ── submitPracticeAttempt — free-text (no auto-score) ────────────────────────

describe('practiceService.submitPracticeAttempt — free-text types', () => {
  it('returns isCorrect=null and score=null for descriptive questions', async () => {
    questionRepo.findPracticeByIdForStudent.mockResolvedValue(MOCK_PRACTICE_DESCRIPTIVE);
    attemptRepo.upsert.mockResolvedValue({
      ...MOCK_ATTEMPT_ROW,
      question_id: 88,
      is_correct: null,
      score: null,
    });

    const result = await practiceService.submitPracticeAttempt(88, STUDENT_ID, 'Some detailed answer.');
    expect(result.isCorrect).toBeNull();
    expect(result.score).toBeNull();
    expect(attemptRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ isCorrect: null, score: null })
    );
  });

  it.each(['short_answer', 'scenario'])(
    'returns null scores for %s question type',
    async (qType) => {
      questionRepo.findPracticeByIdForStudent.mockResolvedValue({
        ...MOCK_PRACTICE_MCQ,
        question_type: qType,
      });
      attemptRepo.upsert.mockResolvedValue({ ...MOCK_ATTEMPT_ROW, is_correct: null, score: null });
      const result = await practiceService.submitPracticeAttempt(QUESTION_ID, STUDENT_ID, 'Some answer');
      expect(result.isCorrect).toBeNull();
      expect(result.score).toBeNull();
    }
  );
});

// ── submitPracticeAttempt — reattempt ────────────────────────────────────────

describe('practiceService.submitPracticeAttempt — reattempt', () => {
  it('increments attempt_count on re-attempt', async () => {
    questionRepo.findPracticeByIdForStudent.mockResolvedValue(MOCK_PRACTICE_MCQ);
    attemptRepo.upsert.mockResolvedValue({ ...MOCK_ATTEMPT_ROW, attempt_count: 2 });

    const result = await practiceService.submitPracticeAttempt(QUESTION_ID, STUDENT_ID, 'A process');
    expect(result.attemptCount).toBe(2);
  });
});

// ── getPracticeAttempt ────────────────────────────────────────────────────────

describe('practiceService.getPracticeAttempt', () => {
  it('throws 404 when the practice question is not owned by the student', async () => {
    questionRepo.findPracticeByIdForStudent.mockResolvedValue(null);
    await expect(
      practiceService.getPracticeAttempt(QUESTION_ID, STUDENT_ID)
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(attemptRepo.findByStudentAndQuestion).not.toHaveBeenCalled();
  });

  it('returns the attempt when question is owned and attempt exists', async () => {
    questionRepo.findPracticeByIdForStudent.mockResolvedValue(MOCK_PRACTICE_MCQ);
    attemptRepo.findByStudentAndQuestion.mockResolvedValue(MOCK_ATTEMPT_ROW);

    const result = await practiceService.getPracticeAttempt(QUESTION_ID, STUDENT_ID);
    expect(result).toEqual(MOCK_ATTEMPT_ROW);
    expect(attemptRepo.findByStudentAndQuestion).toHaveBeenCalledWith(STUDENT_ID, QUESTION_ID);
  });

  it('returns null when no attempt exists yet', async () => {
    questionRepo.findPracticeByIdForStudent.mockResolvedValue(MOCK_PRACTICE_MCQ);
    attemptRepo.findByStudentAndQuestion.mockResolvedValue(null);

    const result = await practiceService.getPracticeAttempt(QUESTION_ID, STUDENT_ID);
    expect(result).toBeNull();
  });
});
