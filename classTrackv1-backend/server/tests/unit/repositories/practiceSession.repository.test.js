/**
 * server/tests/unit/repositories/practiceSession.repository.test.js
 *
 * Unit tests for PracticeSessionRepository (Sprint 3 Phase 1).
 *
 * Tests:
 *   - create: inserts with correct params
 *   - findByIdForStudent: returns row / null (ownership scoped)
 *   - complete: updates status to completed (ownership + status scoped)
 *   - updateQuestionCount: updates question_count
 *   - getSessionAttempts: joins quiz_attempts + practice_sessions
 */

const mockQuery = jest.fn();

jest.mock('../../../src/database/connection', () => ({
  pool: { query: mockQuery },
  testConnection: jest.fn(),
}));

const repo = require('../../../src/repositories/practiceSession.repository');

const STUDENT_ID  = 5;
const TOPIC_ID    = 10;
const SESSION_ID  = 1;

const SESSION_ROW = {
  id:             SESSION_ID,
  student_id:     STUDENT_ID,
  topic_id:       TOPIC_ID,
  status:         'active',
  question_type:  'mcq',
  difficulty:     'medium',
  question_count: 5,
  started_at:     '2025-01-01T10:00:00.000Z',
  completed_at:   null,
  created_at:     '2025-01-01T10:00:00.000Z',
  updated_at:     '2025-01-01T10:00:00.000Z',
};

const COMPLETED_ROW = {
  ...SESSION_ROW,
  status:       'completed',
  completed_at: '2025-01-01T10:30:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('practiceSessionRepository.create', () => {
  it('inserts a new session and returns the row', async () => {
    mockQuery.mockResolvedValue([[SESSION_ROW]]);

    const result = await repo.create({
      studentId:     STUDENT_ID,
      topicId:       TOPIC_ID,
      questionType:  'mcq',
      difficulty:    'medium',
      questionCount: 5,
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO practice_sessions/i);
    expect(sql).toMatch(/RETURNING \*/i);
    expect(params[0]).toBe(STUDENT_ID);
    expect(params[1]).toBe(TOPIC_ID);
    expect(result).toEqual(SESSION_ROW);
  });

  it('passes null questionType and difficulty when not provided', async () => {
    mockQuery.mockResolvedValue([[SESSION_ROW]]);

    await repo.create({ studentId: STUDENT_ID, topicId: TOPIC_ID });

    const [, params] = mockQuery.mock.calls[0];
    expect(params[2]).toBeNull(); // questionType
    expect(params[3]).toBeNull(); // difficulty
  });
});

describe('practiceSessionRepository.findByIdForStudent', () => {
  it('returns the session when found and owned by student', async () => {
    mockQuery.mockResolvedValue([[SESSION_ROW]]);
    const result = await repo.findByIdForStudent(SESSION_ID, STUDENT_ID);
    expect(result).toEqual(SESSION_ROW);
    const [, params] = mockQuery.mock.calls[0];
    expect(params).toEqual([SESSION_ID, STUDENT_ID]);
  });

  it('returns null when session not found', async () => {
    mockQuery.mockResolvedValue([[]]);
    const result = await repo.findByIdForStudent(SESSION_ID, STUDENT_ID);
    expect(result).toBeNull();
  });

  it('returns null when session belongs to a different student', async () => {
    // The WHERE clause includes student_id = $2, so wrong student returns no rows
    mockQuery.mockResolvedValue([[]]); // empty from DB
    const result = await repo.findByIdForStudent(SESSION_ID, 999);
    expect(result).toBeNull();
  });
});

describe('practiceSessionRepository.complete', () => {
  it('updates status to completed and returns the row', async () => {
    mockQuery.mockResolvedValue([[COMPLETED_ROW]]);
    const result = await repo.complete(SESSION_ID, STUDENT_ID);
    expect(result).toEqual(COMPLETED_ROW);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/SET status = 'completed'/i);
    expect(sql).toMatch(/AND status = 'active'/i);
    expect(params).toEqual([SESSION_ID, STUDENT_ID]);
  });

  it('returns null when session is already completed (WHERE status = active fails)', async () => {
    mockQuery.mockResolvedValue([[]]); // no rows updated
    const result = await repo.complete(SESSION_ID, STUDENT_ID);
    expect(result).toBeNull();
  });

  it('returns null when session belongs to a different student', async () => {
    mockQuery.mockResolvedValue([[]]); // WHERE student_id = $2 fails
    const result = await repo.complete(SESSION_ID, 999);
    expect(result).toBeNull();
  });
});

describe('practiceSessionRepository.updateQuestionCount', () => {
  it('updates question_count and returns updated row', async () => {
    const updated = { ...SESSION_ROW, question_count: 10 };
    mockQuery.mockResolvedValue([[updated]]);

    const result = await repo.updateQuestionCount(SESSION_ID, STUDENT_ID, 10);

    expect(result).toEqual(updated);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/SET question_count = \$1/i);
    expect(params[0]).toBe(10);
    expect(params[1]).toBe(SESSION_ID);
    expect(params[2]).toBe(STUDENT_ID);
  });

  it('returns null when session is not active or not owned', async () => {
    mockQuery.mockResolvedValue([[]]); // no rows updated
    const result = await repo.updateQuestionCount(SESSION_ID, STUDENT_ID, 5);
    expect(result).toBeNull();
  });
});

describe('practiceSessionRepository.getSessionAttempts', () => {
  it('queries quiz_attempts joined to practice_sessions with ownership check', async () => {
    const attemptRow = {
      id: 1, student_id: STUDENT_ID, question_id: 42,
      is_correct: true, score: 1.0, practice_session_id: SESSION_ID,
    };
    mockQuery.mockResolvedValue([[attemptRow]]);

    const result = await repo.getSessionAttempts(SESSION_ID, STUDENT_ID);

    expect(result).toHaveLength(1);
    expect(result[0].is_correct).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/quiz_attempts/i);
    expect(sql).toMatch(/practice_sessions/i);
    expect(params).toEqual([SESSION_ID, STUDENT_ID]);
  });

  it('returns empty array when no attempts exist for the session', async () => {
    mockQuery.mockResolvedValue([[]]);
    const result = await repo.getSessionAttempts(SESSION_ID, STUDENT_ID);
    expect(result).toEqual([]);
  });
});
