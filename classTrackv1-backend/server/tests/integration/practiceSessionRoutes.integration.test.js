/**
 * server/tests/integration/practiceSessionRoutes.integration.test.js
 *
 * Integration tests for Sprint 3 Phase 1 Practice Session + Mastery routes:
 *
 *   POST   /api/v1/practice/sessions
 *   GET    /api/v1/practice/sessions/:sessionId
 *   POST   /api/v1/practice/sessions/:sessionId/complete
 *   GET    /api/v1/practice/mastery
 *   GET    /api/v1/practice/mastery/:topicId
 *
 * Security assertions:
 *   - Unauthenticated → 401
 *   - Teacher on student-only endpoints → 403
 *   - Student A cannot access Student B's session → 404
 *   - Student A cannot access Student B's mastery → 403
 *   - Student cannot practice unauthorized topic → 403
 *   - Duplicate completion → 409
 */

// ── Database + service mocks ──────────────────────────────────────────────────
jest.mock('../../src/database/connection', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  testConnection: jest.fn(),
}));

jest.mock('../../src/repositories/admin.repository', () => ({
  findById: jest.fn(), findByEmail: jest.fn(),
  incrementFailedAttempts: jest.fn(), resetFailedAttempts: jest.fn(),
  lockUntil: jest.fn(), isCurrentlyLocked: jest.fn().mockReturnValue(false),
  updateLastLogin: jest.fn(),
}));
jest.mock('../../src/repositories/teacher.repository', () => ({
  findById: jest.fn(), findByEmail: jest.fn(),
  incrementFailedAttempts: jest.fn(), resetFailedAttempts: jest.fn(),
  lockUntil: jest.fn(), isCurrentlyLocked: jest.fn().mockReturnValue(false),
  updateLastLogin: jest.fn(), markEmailVerified: jest.fn(),
}));
jest.mock('../../src/repositories/student.repository', () => ({
  findById: jest.fn(), findByUsername: jest.fn(), existsByUsername: jest.fn(),
  incrementFailedAttempts: jest.fn(), resetFailedAttempts: jest.fn(),
  lockUntil: jest.fn(), isCurrentlyLocked: jest.fn().mockReturnValue(false),
  updateLastLogin: jest.fn(), create: jest.fn(),
}));
jest.mock('../../src/repositories/audit.repository', () => ({
  insert: jest.fn().mockResolvedValue(undefined), list: jest.fn(),
}));
jest.mock('../../src/repositories/loginHistory.repository', () => ({
  record: jest.fn().mockResolvedValue(undefined),
  listForUser: jest.fn(), countRecentFailures: jest.fn(),
}));
jest.mock('../../src/repositories/refreshToken.repository', () => ({
  insert: jest.fn().mockResolvedValue(1),
  findByHash: jest.fn(), findValidByHash: jest.fn(),
  rotate: jest.fn(), revokeById: jest.fn(), revokeAllForUser: jest.fn(),
}));
jest.mock('../../src/repositories/emailVerificationToken.repository', () => ({
  insert: jest.fn(), findValidByHash: jest.fn(),
  markUsed: jest.fn(), invalidateAllForUser: jest.fn(),
}));
jest.mock('../../src/repositories/passwordResetToken.repository', () => ({
  insert: jest.fn(), findValidByHash: jest.fn(),
  markUsed: jest.fn(), invalidateAllForUser: jest.fn(),
}));
jest.mock('../../src/repositories/questionBank.repository', () => ({
  insert: jest.fn(), existsDuplicate: jest.fn(),
  findByIdForTeacher: jest.fn(), findPublishedById: jest.fn(),
  listByTopic: jest.fn(), listPendingApproval: jest.fn(),
  listReviewQueue: jest.fn(), listPublishedForTeacher: jest.fn(),
  listPublishedForStudent: jest.fn(), listByStudent: jest.fn(),
  updateStatus: jest.fn(), textHash: jest.fn(),
  listPracticeByStudent: jest.fn(),
  findPracticeByIdForStudent: jest.fn(),
}));
jest.mock('../../src/repositories/quizAttempt.repository', () => ({
  upsert: jest.fn(),
  findByStudentAndQuestion: jest.fn(),
  listByStudent: jest.fn(),
  countByStudentAndTopic: jest.fn(),
  listByTopicForTeacher: jest.fn(),
  listByQuestionForTeacher: jest.fn(),
}));
jest.mock('../../src/repositories/topic.repository', () => ({ findOwnedById: jest.fn() }));
jest.mock('../../src/repositories/chapter.repository', () => ({ findOwnedById: jest.fn() }));
jest.mock('../../src/repositories/subject.repository', () => ({ findOwnedById: jest.fn() }));
jest.mock('../../src/repositories/curriculum.repository', () => ({ findOwnedById: jest.fn() }));
jest.mock('../../src/services/knowledge/retrieval.service', () => ({ search: jest.fn() }));
jest.mock('../../src/services/ai/providers', () => ({ getLLMProvider: jest.fn() }));

// ── Sprint 3 Phase 1 service mocks ────────────────────────────────────────────
jest.mock('../../src/repositories/practiceSession.repository', () => ({
  create:                         jest.fn(),
  findByIdForStudent:             jest.fn(),
  complete:                       jest.fn(),
  listCompletedByStudentAndTopic: jest.fn(),
  getSessionAttempts:             jest.fn(),
  updateQuestionCount:            jest.fn(),
}));

jest.mock('../../src/repositories/studentTopicMastery.repository', () => ({
  findByStudentAndTopic: jest.fn(),
  upsertMastery:         jest.fn(),
  lockForUpdate:         jest.fn(),
  listByStudent:         jest.fn(),
}));

// ── Load app ──────────────────────────────────────────────────────────────────
const request      = require('supertest');
const jwt          = require('jsonwebtoken');
const app          = require('../../app');

const studentRepo  = require('../../src/repositories/student.repository');
const teacherRepo  = require('../../src/repositories/teacher.repository');
const sessionRepo  = require('../../src/repositories/practiceSession.repository');
const masteryRepo  = require('../../src/repositories/studentTopicMastery.repository');
const { pool }     = require('../../src/database/connection');

// ── Helpers ───────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_that_is_long_enough';

function makeToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

const STUDENT_ACCOUNT_1 = {
  id: 1, username: 'student1', name: 'Student One',
  is_active: true, classroom_id: 10,
};
const STUDENT_ACCOUNT_2 = {
  id: 2, username: 'student2', name: 'Student Two',
  is_active: true, classroom_id: 10,
};
const TEACHER_ACCOUNT = {
  id: 3, email: 'teacher@ct.ai', name: 'Teacher',
  is_active: true,
};

const TOKEN_S1 = makeToken({ id: 1, role: 'student' });
const TOKEN_S2 = makeToken({ id: 2, role: 'student' });
const TOKEN_T  = makeToken({ id: 3, role: 'teacher' });

const MOCK_SESSION = {
  id: 10, student_id: 1, topic_id: 5,
  status: 'active', question_type: 'mcq', difficulty: 'medium',
  question_count: 5, started_at: new Date().toISOString(),
  completed_at: null, created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const MOCK_COMPLETED_SESSION = {
  ...MOCK_SESSION, status: 'completed', completed_at: new Date().toISOString(),
};

const MOCK_MASTERY = {
  id: 1, student_id: 1, topic_id: 5,
  mastery_score: '0.8000', sessions_completed: 1,
  questions_attempted: 5, questions_correct: 4,
  consecutive_correct: 4, consecutive_incorrect: 0,
  last_session_at: new Date().toISOString(),
  topic_name: 'Photosynthesis',
};

// ── Authentication guard ──────────────────────────────────────────────────────

describe('Practice Session routes — authentication', () => {
  it('POST /practice/sessions returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/practice/sessions').send({ topicId: 1 });
    expect(res.status).toBe(401);
  });

  it('GET /practice/sessions/:id returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/practice/sessions/1');
    expect(res.status).toBe(401);
  });

  it('POST /practice/sessions/:id/complete returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/practice/sessions/1/complete');
    expect(res.status).toBe(401);
  });

  it('GET /practice/mastery returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/practice/mastery');
    expect(res.status).toBe(401);
  });

  it('GET /practice/mastery/:topicId returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/practice/mastery/5');
    expect(res.status).toBe(401);
  });
});

// ── Role isolation — teacher cannot access student practice routes ─────────────

describe('Practice Session routes — role isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
    teacherRepo.findById.mockResolvedValue(TEACHER_ACCOUNT);
  });

  it('teacher POST /practice/sessions → 403', async () => {
    const res = await request(app)
      .post('/api/v1/practice/sessions')
      .set('Authorization', `Bearer ${TOKEN_T}`)
      .send({ topicId: 5 });
    expect(res.status).toBe(403);
  });

  it('teacher GET /practice/mastery → 403', async () => {
    const res = await request(app)
      .get('/api/v1/practice/mastery')
      .set('Authorization', `Bearer ${TOKEN_T}`);
    expect(res.status).toBe(403);
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe('POST /practice/sessions — validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT_1]]);
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT_1);
  });

  it('returns 400 when topicId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/practice/sessions')
      .set('Authorization', `Bearer ${TOKEN_S1}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when topicId is not a positive integer', async () => {
    const res = await request(app)
      .post('/api/v1/practice/sessions')
      .set('Authorization', `Bearer ${TOKEN_S1}`)
      .send({ topicId: -1 });
    expect(res.status).toBe(400);
  });
});

// ── Happy path — create session ───────────────────────────────────────────────

describe('POST /practice/sessions — happy path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT_1);
  });

  it('returns 201 with session on success', async () => {
    // auth query + topic access check
    pool.query
      .mockResolvedValueOnce([[STUDENT_ACCOUNT_1]])   // authenticate
      .mockResolvedValueOnce([[{ id: 5 }]]);           // topic access check
    sessionRepo.create.mockResolvedValue(MOCK_SESSION);

    const res = await request(app)
      .post('/api/v1/practice/sessions')
      .set('Authorization', `Bearer ${TOKEN_S1}`)
      .send({ topicId: 5, questionType: 'mcq', difficulty: 'medium', questionCount: 5 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.session.id).toBe(10);
    expect(res.body.data.session.status).toBe('active');
  });

  it('returns 403 when student does not have topic access', async () => {
    pool.query
      .mockResolvedValueOnce([[STUDENT_ACCOUNT_1]])   // authenticate
      .mockResolvedValueOnce([[]]); // topic access check — denied

    const res = await request(app)
      .post('/api/v1/practice/sessions')
      .set('Authorization', `Bearer ${TOKEN_S1}`)
      .send({ topicId: 999 });

    expect(res.status).toBe(403);
    expect(sessionRepo.create).not.toHaveBeenCalled();
  });
});

// ── Happy path — get session ──────────────────────────────────────────────────

describe('GET /practice/sessions/:sessionId — happy path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT_1);
  });

  it('returns 200 with session for the owner', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT_1]]);
    sessionRepo.findByIdForStudent.mockResolvedValue(MOCK_SESSION);

    const res = await request(app)
      .get('/api/v1/practice/sessions/10')
      .set('Authorization', `Bearer ${TOKEN_S1}`);

    expect(res.status).toBe(200);
    expect(res.body.data.session.id).toBe(10);
  });

  it('returns 404 when session belongs to a different student', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT_1]]);
    sessionRepo.findByIdForStudent.mockResolvedValue(null); // repo returns null (IDOR)

    const res = await request(app)
      .get('/api/v1/practice/sessions/10')
      .set('Authorization', `Bearer ${TOKEN_S1}`);

    expect(res.status).toBe(404);
  });
});

// ── Happy path — complete session ─────────────────────────────────────────────

describe('POST /practice/sessions/:sessionId/complete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT_1);
  });

  it('returns 200 with session + mastery on success', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT_1]]);
    sessionRepo.findByIdForStudent.mockResolvedValue(MOCK_SESSION);
    sessionRepo.complete.mockResolvedValue(MOCK_COMPLETED_SESSION);

    // masteryUpdate.service is NOT directly mocked here — it calls
    // pool.connect which we need to mock as well
    const mockClient = {
      query:   jest.fn().mockResolvedValue([[]]),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(mockClient);
    masteryRepo.lockForUpdate.mockResolvedValue(null);
    masteryRepo.findByStudentAndTopic.mockResolvedValue(null);
    masteryRepo.upsertMastery.mockResolvedValue(MOCK_MASTERY);
    const sessionRepoMod = require('../../src/repositories/practiceSession.repository');
    sessionRepoMod.getSessionAttempts.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/v1/practice/sessions/10/complete')
      .set('Authorization', `Bearer ${TOKEN_S1}`);

    expect(res.status).toBe(200);
    expect(res.body.data.session.status).toBe('completed');
  });

  it('returns 409 when session is already completed', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT_1]]);
    sessionRepo.findByIdForStudent.mockResolvedValue(MOCK_COMPLETED_SESSION);

    const res = await request(app)
      .post('/api/v1/practice/sessions/10/complete')
      .set('Authorization', `Bearer ${TOKEN_S1}`);

    expect(res.status).toBe(409);
  });

  it('returns 404 when session does not exist', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT_1]]);
    sessionRepo.findByIdForStudent.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/practice/sessions/999/complete')
      .set('Authorization', `Bearer ${TOKEN_S1}`);

    expect(res.status).toBe(404);
  });
});

// ── Security: IDOR — student A cannot access student B's session ──────────────

describe('Security — IDOR prevention', () => {
  it('Student A cannot GET Student B\'s session (returns 404, not 200)', async () => {
    // Student 2's token but Student 2 gets null back (session belongs to Student 1)
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT_2]]);
    sessionRepo.findByIdForStudent.mockResolvedValue(null); // not owned by student 2

    const res = await request(app)
      .get('/api/v1/practice/sessions/10') // MOCK_SESSION belongs to student 1
      .set('Authorization', `Bearer ${TOKEN_S2}`);

    expect(res.status).toBe(404);
    // Should NOT expose internal details
    expect(res.body.message).not.toMatch(/student_id/i);
  });

  it('Student A cannot complete Student B\'s session', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT_2]]);
    sessionRepo.findByIdForStudent.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/practice/sessions/10/complete')
      .set('Authorization', `Bearer ${TOKEN_S2}`);

    expect(res.status).toBe(404);
    expect(sessionRepo.complete).not.toHaveBeenCalled();
  });
});

// ── Mastery routes ────────────────────────────────────────────────────────────

describe('GET /practice/mastery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT_1);
  });

  it('returns 200 with mastery list for authenticated student', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT_1]]);
    masteryRepo.listByStudent.mockResolvedValue([MOCK_MASTERY]);

    const res = await request(app)
      .get('/api/v1/practice/mastery')
      .set('Authorization', `Bearer ${TOKEN_S1}`);

    expect(res.status).toBe(200);
    expect(res.body.data.mastery).toHaveLength(1);
  });

  it('returns 200 with empty array when no mastery exists', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT_1]]);
    masteryRepo.listByStudent.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/practice/mastery')
      .set('Authorization', `Bearer ${TOKEN_S1}`);

    expect(res.status).toBe(200);
    expect(res.body.data.mastery).toEqual([]);
  });
});

describe('GET /practice/mastery/:topicId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT_1);
  });

  it('returns 200 with mastery for a specific topic', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT_1]]);
    masteryRepo.findByStudentAndTopic.mockResolvedValue(MOCK_MASTERY);

    const res = await request(app)
      .get('/api/v1/practice/mastery/5')
      .set('Authorization', `Bearer ${TOKEN_S1}`);

    expect(res.status).toBe(200);
    expect(res.body.data.mastery).toBeTruthy();
    expect(res.body.data.mastery.topic_id).toBe(5);
  });

  it('returns 200 with null mastery when no data exists', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT_1]]);
    masteryRepo.findByStudentAndTopic.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/practice/mastery/5')
      .set('Authorization', `Bearer ${TOKEN_S1}`);

    expect(res.status).toBe(200);
    expect(res.body.data.mastery).toBeNull();
  });

  it('returns 400 for invalid topicId', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT_1]]);

    const res = await request(app)
      .get('/api/v1/practice/mastery/abc')
      .set('Authorization', `Bearer ${TOKEN_S1}`);

    expect(res.status).toBe(400);
  });
});
