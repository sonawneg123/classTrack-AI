/**
 * server/tests/unit/repositories/studentTopicMastery.repository.test.js
 *
 * Unit tests for StudentTopicMasteryRepository (Sprint 3 Phase 1).
 *
 * Tests:
 *   - findByStudentAndTopic: returns row / null
 *   - upsertMastery: INSERT ... ON CONFLICT logic
 *   - lockForUpdate: uses FOR UPDATE clause
 *   - listByStudent: joins topics, orders by mastery_score
 */

const mockQuery = jest.fn();

jest.mock('../../../src/database/connection', () => ({
  pool: { query: mockQuery },
  testConnection: jest.fn(),
}));

const repo = require('../../../src/repositories/studentTopicMastery.repository');

const STUDENT_ID = 5;
const TOPIC_ID   = 10;

const MASTERY_ROW = {
  id:                   1,
  student_id:           STUDENT_ID,
  topic_id:             TOPIC_ID,
  mastery_score:        '0.8000',
  sessions_completed:   2,
  questions_attempted:  10,
  questions_correct:    8,
  consecutive_correct:  4,
  consecutive_incorrect: 0,
  last_session_at:      '2025-01-15T10:00:00.000Z',
  created_at:           '2025-01-01T10:00:00.000Z',
  updated_at:           '2025-01-15T10:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('studentTopicMasteryRepository.findByStudentAndTopic', () => {
  it('returns the mastery row when found', async () => {
    mockQuery.mockResolvedValue([[MASTERY_ROW]]);
    const result = await repo.findByStudentAndTopic(STUDENT_ID, TOPIC_ID);
    expect(result).toEqual(MASTERY_ROW);
    const [, params] = mockQuery.mock.calls[0];
    expect(params).toEqual([STUDENT_ID, TOPIC_ID]);
  });

  it('returns null when no mastery exists', async () => {
    mockQuery.mockResolvedValue([[]]);
    const result = await repo.findByStudentAndTopic(STUDENT_ID, TOPIC_ID);
    expect(result).toBeNull();
  });
});

describe('studentTopicMasteryRepository.upsertMastery', () => {
  it('inserts a new mastery row and returns it', async () => {
    mockQuery.mockResolvedValue([[MASTERY_ROW]]);

    const result = await repo.upsertMastery({
      studentId:           STUDENT_ID,
      topicId:             TOPIC_ID,
      masteryScore:        0.8,
      sessionsCompleted:   2,
      questionsAttempted:  10,
      questionsCorrect:    8,
      consecutiveCorrect:  4,
      consecutiveIncorrect: 0,
      lastSessionAt:       new Date(),
    });

    expect(result).toEqual(MASTERY_ROW);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO student_topic_mastery/i);
    expect(sql).toMatch(/ON CONFLICT.*DO UPDATE/i);
    expect(params[0]).toBe(STUDENT_ID);
    expect(params[1]).toBe(TOPIC_ID);
    expect(params[2]).toBe(0.8); // masteryScore
  });

  it('enforces ON CONFLICT (student_id, topic_id) — upsert pattern', async () => {
    mockQuery.mockResolvedValue([[MASTERY_ROW]]);
    await repo.upsertMastery({
      studentId: STUDENT_ID, topicId: TOPIC_ID,
      masteryScore: 0.9, sessionsCompleted: 3,
      questionsAttempted: 15, questionsCorrect: 13,
      consecutiveCorrect: 5, consecutiveIncorrect: 0,
      lastSessionAt: new Date(),
    });
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/ON CONFLICT \(student_id, topic_id\) DO UPDATE/i);
  });
});

describe('studentTopicMasteryRepository.lockForUpdate', () => {
  it('uses FOR UPDATE clause', async () => {
    const mockClient = { query: mockQuery };
    mockQuery.mockResolvedValue([[]]);

    await repo.lockForUpdate(STUDENT_ID, TOPIC_ID, mockClient);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/FOR UPDATE/i);
    expect(params).toEqual([STUDENT_ID, TOPIC_ID]);
  });

  it('returns null when no mastery row exists yet (cold start)', async () => {
    const mockClient = { query: mockQuery };
    mockQuery.mockResolvedValue([[]]);

    const result = await repo.lockForUpdate(STUDENT_ID, TOPIC_ID, mockClient);
    expect(result).toBeNull();
  });
});

describe('studentTopicMasteryRepository.listByStudent', () => {
  it('orders results by mastery_score DESC', async () => {
    const rows = [
      { ...MASTERY_ROW, mastery_score: '0.9000', topic_name: 'Topic A' },
      { ...MASTERY_ROW, id: 2, topic_id: 11, mastery_score: '0.5000', topic_name: 'Topic B' },
    ];
    mockQuery.mockResolvedValue([rows]);

    const result = await repo.listByStudent(STUDENT_ID);

    expect(result).toHaveLength(2);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/ORDER BY.*mastery_score DESC/i);
    expect(params).toEqual([STUDENT_ID]);
  });

  it('returns empty array when no mastery records exist', async () => {
    mockQuery.mockResolvedValue([[]]);
    const result = await repo.listByStudent(STUDENT_ID);
    expect(result).toEqual([]);
  });
});
