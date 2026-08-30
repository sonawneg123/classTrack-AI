/**
 * server/tests/unit/repositories/quizAttempt.repository.test.js
 *
 * Unit tests for QuizAttemptRepository — the pool is mocked.
 */

const mockQuery = jest.fn();

jest.mock('../../../src/database/connection', () => ({
  pool: { query: mockQuery },
  testConnection: jest.fn(),
}));

// Require the repository AFTER the mock is in place
const repo = require('../../../src/repositories/quizAttempt.repository');

const STUDENT_ID  = 5;
const QUESTION_ID = 42;

const ATTEMPT_ROW = {
  id:                1,
  student_id:        STUDENT_ID,
  question_id:       QUESTION_ID,
  student_answer:    'Glucose',
  is_correct:        true,
  score:             1.00,
  attempt_count:     1,
  first_attempted_at: '2025-01-01T10:00:00.000Z',
  last_attempted_at:  '2025-01-01T10:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('quizAttemptRepository.upsert', () => {
  it('calls pool.query with correct params and returns the row', async () => {
    mockQuery.mockResolvedValue([[ATTEMPT_ROW]]);

    const result = await repo.upsert({
      studentId:     STUDENT_ID,
      questionId:    QUESTION_ID,
      studentAnswer: 'Glucose',
      isCorrect:     true,
      score:         1.00,
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO quiz_attempts/i);
    expect(sql).toMatch(/ON CONFLICT.*DO UPDATE/i);
    expect(params).toEqual([STUDENT_ID, QUESTION_ID, 'Glucose', true, 1.00]);
    expect(result).toEqual(ATTEMPT_ROW);
  });

  it('passes isCorrect=null and score=null for free-text questions', async () => {
    mockQuery.mockResolvedValue([[{ ...ATTEMPT_ROW, is_correct: null, score: null }]]);

    await repo.upsert({
      studentId:     STUDENT_ID,
      questionId:    QUESTION_ID,
      studentAnswer: 'Some descriptive answer',
      isCorrect:     null,
      score:         null,
    });

    const [, params] = mockQuery.mock.calls[0];
    expect(params[3]).toBeNull(); // isCorrect
    expect(params[4]).toBeNull(); // score
  });
});

describe('quizAttemptRepository.findByStudentAndQuestion', () => {
  it('returns the row when a prior attempt exists', async () => {
    mockQuery.mockResolvedValue([[ATTEMPT_ROW]]);

    const result = await repo.findByStudentAndQuestion(STUDENT_ID, QUESTION_ID);
    expect(result).toEqual(ATTEMPT_ROW);
    const [, params] = mockQuery.mock.calls[0];
    expect(params).toEqual([STUDENT_ID, QUESTION_ID]);
  });

  it('returns null when no prior attempt exists', async () => {
    mockQuery.mockResolvedValue([[]]); // empty result set

    const result = await repo.findByStudentAndQuestion(STUDENT_ID, QUESTION_ID);
    expect(result).toBeNull();
  });
});

describe('quizAttemptRepository.listByStudent', () => {
  it('returns all attempts for a student without topic filter', async () => {
    mockQuery.mockResolvedValue([[ATTEMPT_ROW]]);

    const result = await repo.listByStudent(STUDENT_ID);

    expect(result).toHaveLength(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/WHERE a\.student_id = \$1/);
    expect(params).toEqual([STUDENT_ID]);
  });

  it('adds topic filter when topicId is provided', async () => {
    mockQuery.mockResolvedValue([[]]);

    await repo.listByStudent(STUDENT_ID, 10);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/q\.topic_id = \$2/);
    expect(params).toEqual([STUDENT_ID, 10]);
  });
});
