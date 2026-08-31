/**
 * server/tests/unit/services/masteryUpdate.service.test.js
 *
 * Unit tests for masteryUpdate.service.js (Sprint 3 Phase 1).
 *
 * Tests:
 *   - updateMastery: delegates correctly to calculateMastery
 *   - updateMastery: atomic transaction + locking
 *   - updateMastery: enriches mastery with derived fields
 *   - getMastery: IDOR guard, returns null when no mastery
 *   - listMastery: IDOR guard, maps enrichMastery
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockClientQuery  = jest.fn();
const mockClientRelease = jest.fn();
const mockPoolQuery    = jest.fn();
const mockConnect      = jest.fn();

jest.mock('../../../src/database/connection', () => ({
  pool: {
    query:   mockPoolQuery,
    connect: mockConnect,
  },
}));

jest.mock('../../../src/repositories/practiceSession.repository', () => ({
  getSessionAttempts: jest.fn(),
}));

jest.mock('../../../src/repositories/studentTopicMastery.repository', () => ({
  lockForUpdate:          jest.fn(),
  findByStudentAndTopic:  jest.fn(),
  upsertMastery:          jest.fn(),
  listByStudent:          jest.fn(),
}));

const masteryService  = require('../../../src/services/questions/masteryUpdate.service');
const sessionRepo     = require('../../../src/repositories/practiceSession.repository');
const masteryRepo     = require('../../../src/repositories/studentTopicMastery.repository');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STUDENT_ID  = 5;
const TOPIC_ID    = 10;
const SESSION_ID  = 1;
const NOW         = new Date('2025-01-15T10:00:00.000Z');

const MOCK_MASTERY_ROW = {
  id:                   1,
  student_id:           STUDENT_ID,
  topic_id:             TOPIC_ID,
  mastery_score:        '0.8000',
  sessions_completed:   1,
  questions_attempted:  5,
  questions_correct:    4,
  consecutive_correct:  4,
  consecutive_incorrect: 0,
  last_session_at:      NOW.toISOString(),
  created_at:           NOW.toISOString(),
  updated_at:           NOW.toISOString(),
};

const MOCK_ATTEMPTS_ALL_CORRECT = [
  { is_correct: true,  question_id: 1 },
  { is_correct: true,  question_id: 2 },
  { is_correct: true,  question_id: 3 },
  { is_correct: true,  question_id: 4 },
  { is_correct: true,  question_id: 5 },
];

// Set up the client mock
function setupClientMock() {
  const client = {
    query:   mockClientQuery,
    release: mockClientRelease,
  };
  mockConnect.mockResolvedValue(client);
  // BEGIN and COMMIT succeed by default
  mockClientQuery.mockResolvedValue([[]]); // default for BEGIN/COMMIT
  return client;
}

beforeEach(() => {
  jest.clearAllMocks();
  setupClientMock();
});

// ── updateMastery ─────────────────────────────────────────────────────────────

describe('masteryUpdate.service.updateMastery', () => {
  it('fetches session attempts, calculates mastery, and upserts', async () => {
    sessionRepo.getSessionAttempts.mockResolvedValue(MOCK_ATTEMPTS_ALL_CORRECT);
    masteryRepo.lockForUpdate.mockResolvedValue(null); // no existing row
    masteryRepo.findByStudentAndTopic.mockResolvedValue(null); // cold start
    masteryRepo.upsertMastery.mockResolvedValue(MOCK_MASTERY_ROW);

    const result = await masteryService.updateMastery({
      sessionId:          SESSION_ID,
      studentId:          STUDENT_ID,
      topicId:            TOPIC_ID,
      sessionCompletedAt: NOW,
    });

    expect(sessionRepo.getSessionAttempts).toHaveBeenCalledWith(SESSION_ID, STUDENT_ID);
    expect(masteryRepo.upsertMastery).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: STUDENT_ID,
        topicId:   TOPIC_ID,
      }),
      expect.anything() // client
    );
    expect(result.mastery_score).toBe(0.8);
    expect(result.current_difficulty).toBeDefined();
    expect(result.mastery_level).toBeDefined();
  });

  it('uses transaction — calls BEGIN and COMMIT', async () => {
    sessionRepo.getSessionAttempts.mockResolvedValue([]);
    masteryRepo.lockForUpdate.mockResolvedValue(null);
    masteryRepo.findByStudentAndTopic.mockResolvedValue(null);
    masteryRepo.upsertMastery.mockResolvedValue(MOCK_MASTERY_ROW);

    await masteryService.updateMastery({
      sessionId: SESSION_ID, studentId: STUDENT_ID,
      topicId: TOPIC_ID, sessionCompletedAt: NOW,
    });

    const calls = mockClientQuery.mock.calls.map((c) => c[0]);
    expect(calls).toContain('BEGIN');
    expect(calls).toContain('COMMIT');
  });

  it('rolls back on error and rethrows', async () => {
    sessionRepo.getSessionAttempts.mockRejectedValue(new Error('DB error'));

    await expect(
      masteryService.updateMastery({
        sessionId: SESSION_ID, studentId: STUDENT_ID,
        topicId: TOPIC_ID, sessionCompletedAt: NOW,
      })
    ).rejects.toThrow('DB error');

    const calls = mockClientQuery.mock.calls.map((c) => c[0]);
    expect(calls).toContain('ROLLBACK');
  });

  it('always releases the client', async () => {
    sessionRepo.getSessionAttempts.mockRejectedValue(new Error('fail'));

    try {
      await masteryService.updateMastery({
        sessionId: SESSION_ID, studentId: STUDENT_ID,
        topicId: TOPIC_ID, sessionCompletedAt: NOW,
      });
    } catch (_) { /* expected */ }

    expect(mockClientRelease).toHaveBeenCalledTimes(1);
  });

  it('cold start: mastery_score = session accuracy', async () => {
    // 3 correct out of 5 = 0.6
    const attempts = [
      { is_correct: true },  { is_correct: true }, { is_correct: true },
      { is_correct: false }, { is_correct: false },
    ];
    sessionRepo.getSessionAttempts.mockResolvedValue(attempts);
    masteryRepo.lockForUpdate.mockResolvedValue(null);
    masteryRepo.findByStudentAndTopic.mockResolvedValue(null);
    masteryRepo.upsertMastery.mockImplementation(async (data) => ({
      ...MOCK_MASTERY_ROW,
      mastery_score: data.masteryScore,
    }));

    const result = await masteryService.updateMastery({
      sessionId: SESSION_ID, studentId: STUDENT_ID,
      topicId: TOPIC_ID, sessionCompletedAt: NOW,
    });

    expect(result.mastery_score).toBeCloseTo(0.6, 5);
  });
});

// ── getMastery ────────────────────────────────────────────────────────────────

describe('masteryUpdate.service.getMastery', () => {
  it('returns mastery with derived fields', async () => {
    masteryRepo.findByStudentAndTopic.mockResolvedValue(MOCK_MASTERY_ROW);
    const result = await masteryService.getMastery(STUDENT_ID, TOPIC_ID, STUDENT_ID);
    expect(result.mastery_score).toBe(0.8);
    expect(result.current_difficulty).toBe('hard');
    expect(result.mastery_level).toBe('mastered');
  });

  it('returns null when no mastery exists', async () => {
    masteryRepo.findByStudentAndTopic.mockResolvedValue(null);
    const result = await masteryService.getMastery(STUDENT_ID, TOPIC_ID, STUDENT_ID);
    expect(result).toBeNull();
  });

  it('throws 403 when requesting another student\'s mastery (IDOR guard)', async () => {
    await expect(
      masteryService.getMastery(STUDENT_ID, TOPIC_ID, 999) // different requestingStudentId
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(masteryRepo.findByStudentAndTopic).not.toHaveBeenCalled();
  });
});

// ── listMastery ───────────────────────────────────────────────────────────────

describe('masteryUpdate.service.listMastery', () => {
  it('returns enriched mastery records for the student', async () => {
    masteryRepo.listByStudent.mockResolvedValue([MOCK_MASTERY_ROW]);
    const result = await masteryService.listMastery(STUDENT_ID, STUDENT_ID);
    expect(result).toHaveLength(1);
    expect(result[0].current_difficulty).toBeDefined();
    expect(result[0].mastery_level).toBeDefined();
  });

  it('throws 403 when requesting another student\'s list (IDOR guard)', async () => {
    await expect(
      masteryService.listMastery(STUDENT_ID, 999)
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(masteryRepo.listByStudent).not.toHaveBeenCalled();
  });

  it('returns empty array when student has no mastery records', async () => {
    masteryRepo.listByStudent.mockResolvedValue([]);
    const result = await masteryService.listMastery(STUDENT_ID, STUDENT_ID);
    expect(result).toEqual([]);
  });
});
