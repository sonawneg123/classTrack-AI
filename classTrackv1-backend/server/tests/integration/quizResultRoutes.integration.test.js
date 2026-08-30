/**
 * server/tests/integration/quizResultRoutes.integration.test.js
 *
 * Integration suite for the teacher quiz result endpoints (Sprint 5):
 *   GET /api/v1/questions/topics/:topicId/results
 *   GET /api/v1/questions/:questionId/results
 *
 * Security tests (IDOR / authorization):
 *   - Unauthenticated → 401
 *   - Student cannot access teacher result endpoints → 403
 *   - Teacher cannot access unknown/unowned topic → 404
 *   - Teacher gets results for owned topic → 200
 *   - Teacher gets results for owned question → 200
 */

// ── Database mock ────────────────────────────────────────────────────────────
jest.mock('../../src/database/connection', () => ({
  pool: { query: jest.fn() },
  testConnection: jest.fn(),
}));

// ── Repository mocks ─────────────────────────────────────────────────────────
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
}));

jest.mock('../../src/repositories/quizAttempt.repository', () => ({
  upsert:                    jest.fn(),
  findByStudentAndQuestion:  jest.fn(),
  listByStudent:             jest.fn(),
  countByStudentAndTopic:    jest.fn(),
  listByTopicForTeacher:     jest.fn(),
  listByQuestionForTeacher:  jest.fn(),
}));

jest.mock('../../src/repositories/topic.repository', () => ({ findOwnedById: jest.fn() }));
jest.mock('../../src/repositories/chapter.repository', () => ({ findOwnedById: jest.fn() }));
jest.mock('../../src/repositories/subject.repository', () => ({ findOwnedById: jest.fn() }));
jest.mock('../../src/repositories/curriculum.repository', () => ({ findOwnedById: jest.fn() }));
jest.mock('../../src/services/knowledge/retrieval.service', () => ({ search: jest.fn() }));
jest.mock('../../src/services/ai/providers', () => ({ getLLMProvider: jest.fn() }));

// ── Load app ──────────────────────────────────────────────────────────────────
const request     = require('supertest');
const jwt         = require('jsonwebtoken');
const app         = require('../../app');

const teacherRepo  = require('../../src/repositories/teacher.repository');
const studentRepo  = require('../../src/repositories/student.repository');
const questionRepo = require('../../src/repositories/questionBank.repository');
const attemptRepo  = require('../../src/repositories/quizAttempt.repository');
const topicRepo    = require('../../src/repositories/topic.repository');
const { pool }     = require('../../src/database/connection');

// ── Helpers ───────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_that_is_long_enough';

function makeToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

const TEACHER_ACCOUNT = {
  id: 2, email: 'teacher@classtrack.ai', name: 'Test Teacher',
  is_active: true,
};
const STUDENT_ACCOUNT = {
  id: 1, username: 'student1', name: 'Test Student',
  is_active: true, classroom_id: 10,
};

const TEACHER_TOKEN = makeToken({ id: 2, role: 'teacher' });
const STUDENT_TOKEN = makeToken({ id: 1, role: 'student' });

const MOCK_TOPIC = { id: 5, name: 'Photosynthesis', teacher_id: 2 };

const MOCK_QUESTION = {
  id: 42, question_type: 'mcq', correct_answer: 'Glucose',
  marks: 1.00, status: 'published', curriculum_id: 1,
};

const MOCK_RESULT_ROW = {
  id:               1,
  student_id:       1,
  question_id:      42,
  student_answer:   'Glucose',
  is_correct:       true,
  score:            '1.00',
  attempt_count:    1,
  first_attempted_at: new Date().toISOString(),
  last_attempted_at:  new Date().toISOString(),
  question_text:    'What do plants produce?',
  question_type:    'mcq',
  difficulty:       'easy',
  marks:            '1.00',
  correct_answer:   'Glucose',
  topic_id:         5,
  student_name:     'Alice Smith',
  student_username: 'alice_smith',
};

// ── Route registration ────────────────────────────────────────────────────────

describe('Quiz Results — route registration (Sprint 5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    teacherRepo.findById.mockResolvedValue(TEACHER_ACCOUNT);
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT);
  });

  // GET /topics/:id/results — unauthenticated → 401
  describe('GET /api/v1/questions/topics/:topicId/results', () => {
    it('returns 401 (not 404) without auth', async () => {
      const res = await request(app).get('/api/v1/questions/topics/5/results');
      expect(res.status).toBe(401);
      expect(res.status).not.toBe(404);
    });
  });

  // GET /:id/results — unauthenticated → 401
  describe('GET /api/v1/questions/:questionId/results', () => {
    it('returns 401 (not 404) without auth', async () => {
      const res = await request(app).get('/api/v1/questions/42/results');
      expect(res.status).toBe(401);
      expect(res.status).not.toBe(404);
    });
  });
});

// ── Authorization — students cannot access teacher endpoints ──────────────────

describe('Quiz Results — role isolation (Sprint 5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    teacherRepo.findById.mockResolvedValue(TEACHER_ACCOUNT);
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT);
  });

  it('returns 403 when a student GETs /topics/:id/results', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);
    const res = await request(app)
      .get('/api/v1/questions/topics/5/results')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 when a student GETs /:id/results', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);
    const res = await request(app)
      .get('/api/v1/questions/42/results')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);
    expect(res.status).toBe(403);
  });
});

// ── Happy path — teacher gets topic results ───────────────────────────────────

describe('GET /api/v1/questions/topics/:topicId/results — happy path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    teacherRepo.findById.mockResolvedValue(TEACHER_ACCOUNT);
  });

  it('returns 200 with attempts array for owned topic', async () => {
    pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
    topicRepo.findOwnedById.mockResolvedValue(MOCK_TOPIC);
    attemptRepo.listByTopicForTeacher.mockResolvedValue([MOCK_RESULT_ROW]);

    const res = await request(app)
      .get('/api/v1/questions/topics/5/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.attempts)).toBe(true);
    expect(res.body.data.attempts).toHaveLength(1);
    expect(res.body.data.attempts[0].student_name).toBe('Alice Smith');
    expect(res.body.data.attempts[0].is_correct).toBe(true);
  });

  it('returns 200 with empty array when no attempts exist', async () => {
    pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
    topicRepo.findOwnedById.mockResolvedValue(MOCK_TOPIC);
    attemptRepo.listByTopicForTeacher.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/questions/topics/5/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.attempts).toHaveLength(0);
  });

  it('returns 404 when topic is not owned by this teacher', async () => {
    pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
    topicRepo.findOwnedById.mockResolvedValue(null); // not owned

    const res = await request(app)
      .get('/api/v1/questions/topics/5/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(404);
  });
});

// ── Happy path — teacher gets question results ────────────────────────────────

describe('GET /api/v1/questions/:questionId/results — happy path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    teacherRepo.findById.mockResolvedValue(TEACHER_ACCOUNT);
  });

  it('returns 200 with attempts array for owned question', async () => {
    pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
    questionRepo.findByIdForTeacher.mockResolvedValue(MOCK_QUESTION);
    attemptRepo.listByQuestionForTeacher.mockResolvedValue([MOCK_RESULT_ROW]);

    const res = await request(app)
      .get('/api/v1/questions/42/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.attempts)).toBe(true);
    expect(res.body.data.attempts[0].student_username).toBe('alice_smith');
  });

  it('returns 404 when question is not owned by this teacher', async () => {
    pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
    questionRepo.findByIdForTeacher.mockResolvedValue(null); // not owned

    const res = await request(app)
      .get('/api/v1/questions/42/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(404);
  });
});

// ── Authorization regression — IDOR prevention ──────────────────────────────

describe('Quiz Results — IDOR prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    teacherRepo.findById.mockResolvedValue(TEACHER_ACCOUNT);
  });

  it('cannot access another teacher\'s topic results (returns 404)', async () => {
    pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
    // Topic exists but belongs to a different teacher — findOwnedById returns null
    topicRepo.findOwnedById.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/questions/topics/999/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(404);
    expect(attemptRepo.listByTopicForTeacher).not.toHaveBeenCalled();
  });

  it('cannot access another teacher\'s question results (returns 404)', async () => {
    pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
    // Question exists but belongs to a different teacher — findByIdForTeacher returns null
    questionRepo.findByIdForTeacher.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/questions/999/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(404);
    expect(attemptRepo.listByQuestionForTeacher).not.toHaveBeenCalled();
  });
});
