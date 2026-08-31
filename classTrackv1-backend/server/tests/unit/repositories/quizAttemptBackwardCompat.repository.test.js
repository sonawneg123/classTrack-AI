/**
 * server/tests/unit/repositories/quizAttemptBackwardCompat.repository.test.js
 *
 * Tests that existing quiz_attempts behavior is preserved after
 * Sprint 3 Phase 1 changes (nullable practice_session_id).
 *
 * Requirement: existing attempts without practice_session_id must
 * continue working exactly as before.
 */

const mockQuery = jest.fn();

jest.mock('../../../src/database/connection', () => ({
  pool: { query: mockQuery },
  testConnection: jest.fn(),
}));

const repo = require('../../../src/repositories/quizAttempt.repository');

const STUDENT_ID  = 5;
const QUESTION_ID = 42;

const ATTEMPT_ROW = {
  id:                  1,
  student_id:          STUDENT_ID,
  question_id:         QUESTION_ID,
  student_answer:      'Glucose',
  is_correct:          true,
  score:               1.00,
  attempt_count:       1,
  practice_session_id: null,       // backward-compatible: null
  first_attempted_at:  '2025-01-01T10:00:00.000Z',
  last_attempted_at:   '2025-01-01T10:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Backward compatibility: existing calls without practiceSessionId ───────────

describe('quizAttemptRepository.upsert — backward compatibility', () => {
  it('works without practiceSessionId (defaults to null)', async () => {
    mockQuery.mockResolvedValue([[ATTEMPT_ROW]]);

    const result = await repo.upsert({
      studentId:     STUDENT_ID,
      questionId:    QUESTION_ID,
      studentAnswer: 'Glucose',
      isCorrect:     true,
      score:         1.00,
      // practiceSessionId intentionally omitted
    });

    expect(result).toEqual(ATTEMPT_ROW);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO quiz_attempts/i);
    // 6th param should be null (practiceSessionId)
    expect(params[5]).toBeNull();
    expect(result.practice_session_id).toBeNull();
  });

  it('passes null isCorrect and null score for free-text (unchanged behavior)', async () => {
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
    expect(params[5]).toBeNull(); // practiceSessionId (default)
  });

  it('returns the row with practice_session_id included in RETURNING', async () => {
    mockQuery.mockResolvedValue([[ATTEMPT_ROW]]);
    const result = await repo.upsert({
      studentId: STUDENT_ID, questionId: QUESTION_ID,
      studentAnswer: 'Glucose', isCorrect: true, score: 1.0,
    });
    // The RETURNING clause must include practice_session_id (may be on separate line)
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/practice_session_id/i);
    expect(result).toHaveProperty('practice_session_id');
  });
});

// ── New behavior: passing practiceSessionId ───────────────────────────────────

describe('quizAttemptRepository.upsert — with practiceSessionId', () => {
  it('passes practiceSessionId when provided', async () => {
    mockQuery.mockResolvedValue([[{ ...ATTEMPT_ROW, practice_session_id: 7 }]]);

    const result = await repo.upsert({
      studentId:          STUDENT_ID,
      questionId:         QUESTION_ID,
      studentAnswer:      'Glucose',
      isCorrect:          true,
      score:              1.00,
      practiceSessionId:  7,
    });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(params[5]).toBe(7); // practiceSessionId
    expect(result.practice_session_id).toBe(7);
  });

  it('includes practice_session_id in INSERT columns', async () => {
    mockQuery.mockResolvedValue([[ATTEMPT_ROW]]);
    await repo.upsert({
      studentId: STUDENT_ID, questionId: QUESTION_ID,
      studentAnswer: 'X', isCorrect: false, score: 0, practiceSessionId: 3,
    });
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/practice_session_id/i);
  });
});

// ── Existing methods are unaffected ──────────────────────────────────────────

describe('quizAttemptRepository — existing methods unchanged', () => {
  it('findByStudentAndQuestion still works', async () => {
    mockQuery.mockResolvedValue([[ATTEMPT_ROW]]);
    const result = await repo.findByStudentAndQuestion(STUDENT_ID, QUESTION_ID);
    expect(result).toEqual(ATTEMPT_ROW);
    const [, params] = mockQuery.mock.calls[0];
    expect(params).toEqual([STUDENT_ID, QUESTION_ID]);
  });

  it('listByStudent without topicId still works', async () => {
    mockQuery.mockResolvedValue([[ATTEMPT_ROW]]);
    const result = await repo.listByStudent(STUDENT_ID);
    expect(result).toHaveLength(1);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/WHERE a\.student_id = \$1/);
  });

  it('countByStudentAndTopic still works', async () => {
    mockQuery.mockResolvedValue([[{ total: '3', correct: '2', incorrect: '1', unscored: '0' }]]);
    const result = await repo.countByStudentAndTopic(STUDENT_ID, 10);
    expect(result.total).toBe('3');
  });
});
