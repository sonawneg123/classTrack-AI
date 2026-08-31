/**
 * server/tests/unit/services/practiceSession.service.test.js
 *
 * Unit tests for practiceSession.service.js (Sprint 3 Phase 1).
 *
 * Tests:
 *   - createSession: valid, topic access denied, creates session
 *   - getSession: found, not found (404)
 *   - completeSession: success, not found, already completed, race condition
 *   - completeSession: mastery update failure does not fail session completion
 *   - updateSessionQuestionCount: delegates to repo
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../../src/repositories/practiceSession.repository', () => ({
  create:                      jest.fn(),
  findByIdForStudent:          jest.fn(),
  complete:                    jest.fn(),
  listCompletedByStudentAndTopic: jest.fn(),
  getSessionAttempts:          jest.fn(),
  updateQuestionCount:         jest.fn(),
}));

jest.mock('../../../src/services/questions/masteryUpdate.service', () => ({
  updateMastery: jest.fn(),
  getMastery:    jest.fn(),
  listMastery:   jest.fn(),
}));

jest.mock('../../../src/database/connection', () => ({
  pool: { query: jest.fn() },
}));

const sessionService = require('../../../src/services/questions/practiceSession.service');
const sessionRepo    = require('../../../src/repositories/practiceSession.repository');
const masteryService = require('../../../src/services/questions/masteryUpdate.service');
const { pool }       = require('../../../src/database/connection');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STUDENT_ID  = 5;
const TOPIC_ID    = 10;
const SESSION_ID  = 1;

const MOCK_SESSION = {
  id:             SESSION_ID,
  student_id:     STUDENT_ID,
  topic_id:       TOPIC_ID,
  status:         'active',
  question_type:  'mcq',
  difficulty:     'medium',
  question_count: 5,
  started_at:     new Date().toISOString(),
  completed_at:   null,
  created_at:     new Date().toISOString(),
  updated_at:     new Date().toISOString(),
};

const MOCK_COMPLETED_SESSION = {
  ...MOCK_SESSION,
  status:       'completed',
  completed_at: new Date().toISOString(),
};

const MOCK_MASTERY = {
  id:                   1,
  student_id:           STUDENT_ID,
  topic_id:             TOPIC_ID,
  mastery_score:        0.8,
  sessions_completed:   1,
  questions_attempted:  5,
  questions_correct:    4,
  consecutive_correct:  4,
  consecutive_incorrect: 0,
  last_session_at:      new Date().toISOString(),
  current_difficulty:   'hard',
  mastery_level:        'mastered',
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default: student has topic access (classroom query returns a row)
  pool.query.mockResolvedValue([[{ id: TOPIC_ID }]]);
});

// ── createSession ─────────────────────────────────────────────────────────────

describe('practiceSession.service.createSession', () => {
  it('creates a session when topic is accessible', async () => {
    sessionRepo.create.mockResolvedValue(MOCK_SESSION);

    const result = await sessionService.createSession({
      studentId:     STUDENT_ID,
      topicId:       TOPIC_ID,
      questionType:  'mcq',
      difficulty:    'medium',
      questionCount: 5,
    });

    expect(pool.query).toHaveBeenCalledTimes(1); // topic access check
    expect(sessionRepo.create).toHaveBeenCalledWith({
      studentId:     STUDENT_ID,
      topicId:       TOPIC_ID,
      questionType:  'mcq',
      difficulty:    'medium',
      questionCount: 5,
    });
    expect(result).toEqual(MOCK_SESSION);
  });

  it('throws 403 when student does not have topic access', async () => {
    pool.query.mockResolvedValue([[]]); // no rows — topic not accessible

    await expect(
      sessionService.createSession({ studentId: STUDENT_ID, topicId: 999 })
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(sessionRepo.create).not.toHaveBeenCalled();
  });

  it('creates session with null questionType and difficulty when not provided', async () => {
    sessionRepo.create.mockResolvedValue({ ...MOCK_SESSION, question_type: null, difficulty: null });

    await sessionService.createSession({ studentId: STUDENT_ID, topicId: TOPIC_ID });

    expect(sessionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ questionType: null, difficulty: null, questionCount: 0 })
    );
  });
});

// ── getSession ────────────────────────────────────────────────────────────────

describe('practiceSession.service.getSession', () => {
  it('returns the session when found and owned by student', async () => {
    sessionRepo.findByIdForStudent.mockResolvedValue(MOCK_SESSION);
    const result = await sessionService.getSession(SESSION_ID, STUDENT_ID);
    expect(result).toEqual(MOCK_SESSION);
    expect(sessionRepo.findByIdForStudent).toHaveBeenCalledWith(SESSION_ID, STUDENT_ID);
  });

  it('throws 404 when session not found', async () => {
    sessionRepo.findByIdForStudent.mockResolvedValue(null);
    await expect(
      sessionService.getSession(SESSION_ID, STUDENT_ID)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 when session belongs to a different student', async () => {
    sessionRepo.findByIdForStudent.mockResolvedValue(null); // repo already scoped by studentId
    await expect(
      sessionService.getSession(SESSION_ID, 999) // wrong student
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── completeSession ───────────────────────────────────────────────────────────

describe('practiceSession.service.completeSession', () => {
  it('completes session and returns session + mastery on success', async () => {
    sessionRepo.findByIdForStudent.mockResolvedValue(MOCK_SESSION);
    sessionRepo.complete.mockResolvedValue(MOCK_COMPLETED_SESSION);
    masteryService.updateMastery.mockResolvedValue(MOCK_MASTERY);

    const result = await sessionService.completeSession(SESSION_ID, STUDENT_ID);

    expect(result.session).toEqual(MOCK_COMPLETED_SESSION);
    expect(result.mastery).toEqual(MOCK_MASTERY);
    expect(masteryService.updateMastery).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID, studentId: STUDENT_ID, topicId: TOPIC_ID })
    );
  });

  it('throws 404 when session not found', async () => {
    sessionRepo.findByIdForStudent.mockResolvedValue(null);
    await expect(
      sessionService.completeSession(SESSION_ID, STUDENT_ID)
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(sessionRepo.complete).not.toHaveBeenCalled();
  });

  it('throws 409 when session is already completed', async () => {
    sessionRepo.findByIdForStudent.mockResolvedValue(MOCK_COMPLETED_SESSION);
    await expect(
      sessionService.completeSession(SESSION_ID, STUDENT_ID)
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(sessionRepo.complete).not.toHaveBeenCalled();
  });

  it('throws 409 on race condition (complete returns null)', async () => {
    sessionRepo.findByIdForStudent.mockResolvedValue(MOCK_SESSION);
    sessionRepo.complete.mockResolvedValue(null); // race: already completed by another request
    await expect(
      sessionService.completeSession(SESSION_ID, STUDENT_ID)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('returns mastery=null when mastery update fails (non-fatal)', async () => {
    sessionRepo.findByIdForStudent.mockResolvedValue(MOCK_SESSION);
    sessionRepo.complete.mockResolvedValue(MOCK_COMPLETED_SESSION);
    masteryService.updateMastery.mockRejectedValue(new Error('DB error'));

    const result = await sessionService.completeSession(SESSION_ID, STUDENT_ID);

    expect(result.session).toEqual(MOCK_COMPLETED_SESSION);
    expect(result.mastery).toBeNull();
  });

  it('does not call mastery for different student (IDOR guard in repo)', async () => {
    // findByIdForStudent returns null for wrong student (ownership check in repo)
    sessionRepo.findByIdForStudent.mockResolvedValue(null);

    await expect(
      sessionService.completeSession(SESSION_ID, 999) // wrong student
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(masteryService.updateMastery).not.toHaveBeenCalled();
  });
});

// ── updateSessionQuestionCount ────────────────────────────────────────────────

describe('practiceSession.service.updateSessionQuestionCount', () => {
  it('delegates to repo.updateQuestionCount', async () => {
    const updated = { ...MOCK_SESSION, question_count: 10 };
    sessionRepo.updateQuestionCount.mockResolvedValue(updated);

    const result = await sessionService.updateSessionQuestionCount(SESSION_ID, STUDENT_ID, 10);

    expect(sessionRepo.updateQuestionCount).toHaveBeenCalledWith(SESSION_ID, STUDENT_ID, 10);
    expect(result).toEqual(updated);
  });
});
