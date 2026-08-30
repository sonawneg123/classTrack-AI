/**
 * server/tests/integration/quizAttemptRoutes.integration.test.js
 *
 * Integration suite for the quiz attempt endpoints (Sprint 4):
 *   POST /api/v1/questions/:questionId/attempt
 *   GET  /api/v1/questions/my-attempts
 *   GET  /api/v1/questions/:questionId/my-attempt
 *
 * Strategy:
 *   - Real Express app + real routing.
 *   - All database and LLM dependencies mocked.
 *   - Unauthenticated → 401.
 *   - Teacher tries student-only endpoint → 403.
 *   - Student submits a valid MCQ answer → 201 + correct isCorrect.
 *   - Missing/empty answer → 400 from validator.
 *   - Route IS registered (not 404) for all new endpoints.
 */

// ── Database mock (before app require) ────────────────────────────────────────
jest.mock('../../src/database/connection', () => ({
  pool: { query: jest.fn() },
  testConnection: jest.fn(),
}));

// ── Auth-related repository mocks ─────────────────────────────────────────────
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

// ── Question + attempt repository mocks ───────────────────────────────────────
jest.mock('../../src/repositories/questionBank.repository', () => ({
  insert: jest.fn(), existsDuplicate: jest.fn(),
  findByIdForTeacher: jest.fn(), findPublishedById: jest.fn(),
  listByTopic: jest.fn(), listPendingApproval: jest.fn(),
  listReviewQueue: jest.fn(), listPublishedForTeacher: jest.fn(),
  listPublishedForStudent: jest.fn(), listByStudent: jest.fn(),
  updateStatus: jest.fn(), textHash: jest.fn(),
}));

jest.mock('../../src/repositories/quizAttempt.repository', () => ({
  upsert: jest.fn(),
  findByStudentAndQuestion: jest.fn(),
  listByStudent: jest.fn(),
  countByStudentAndTopic: jest.fn(),
}));

jest.mock('../../src/repositories/topic.repository', () => ({ findOwnedById: jest.fn() }));
jest.mock('../../src/repositories/chapter.repository', () => ({ findOwnedById: jest.fn() }));
jest.mock('../../src/repositories/subject.repository', () => ({ findOwnedById: jest.fn() }));
jest.mock('../../src/repositories/curriculum.repository', () => ({ findOwnedById: jest.fn() }));
jest.mock('../../src/services/knowledge/retrieval.service', () => ({ search: jest.fn() }));
jest.mock('../../src/services/ai/providers', () => ({ getLLMProvider: jest.fn() }));

// ── Load app ───────────────────────────────────────────────────────────────────
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../../app');

const studentRepo    = require('../../src/repositories/student.repository');
const teacherRepo    = require('../../src/repositories/teacher.repository');
const questionRepo   = require('../../src/repositories/questionBank.repository');
const attemptRepo    = require('../../src/repositories/quizAttempt.repository');
const { pool }       = require('../../src/database/connection');

// ── Helpers ────────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_that_is_long_enough';

function makeToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

const STUDENT_ACCOUNT = {
  id: 1, username: 'student1', name: 'Test Student',
  is_active: true, classroom_id: 10,
};
const TEACHER_ACCOUNT = {
  id: 2, email: 'teacher@classtrack.ai', name: 'Test Teacher',
  is_active: true,
};

const STUDENT_TOKEN = makeToken({ id: 1, role: 'student' });
const TEACHER_TOKEN = makeToken({ id: 2, role: 'teacher' });

const MOCK_PUBLISHED_MCQ = {
  id:             42,
  question_type:  'mcq',
  question_text:  'What do plants convert sunlight into?',
  correct_answer: 'Glucose',
  explanation:    'Photosynthesis converts sunlight to glucose.',
  marks:          1.00,
  status:         'published',
  curriculum_id:  1,
};

const MOCK_ATTEMPT_ROW = {
  id:                1,
  student_id:        1,
  question_id:       42,
  student_answer:    'Glucose',
  is_correct:        true,
  score:             1.00,
  attempt_count:     1,
  first_attempted_at: new Date().toISOString(),
  last_attempted_at:  new Date().toISOString(),
};

// ── Route registration proofs ─────────────────────────────────────────────────
describe('Quiz Attempt — route registration (Sprint 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT);
    teacherRepo.findById.mockResolvedValue(TEACHER_ACCOUNT);
  });

  // ── POST /attempt — unauthenticated → 401 ────────────────────────────────
  describe('POST /api/v1/questions/:id/attempt — route registration', () => {
    it('returns 401 (not 404) without auth', async () => {
      const res = await request(app).post('/api/v1/questions/42/attempt').send({ studentAnswer: 'Glucose' });
      expect(res.status).toBe(401);
      expect(res.status).not.toBe(404);
    });
  });

  // ── GET /my-attempts — unauthenticated → 401 ─────────────────────────────
  describe('GET /api/v1/questions/my-attempts — route registration', () => {
    it('returns 401 (not 404) without auth', async () => {
      const res = await request(app).get('/api/v1/questions/my-attempts');
      expect(res.status).toBe(401);
      expect(res.status).not.toBe(404);
    });
  });

  // ── GET /:id/my-attempt — unauthenticated → 401 ──────────────────────────
  describe('GET /api/v1/questions/:id/my-attempt — route registration', () => {
    it('returns 401 (not 404) without auth', async () => {
      const res = await request(app).get('/api/v1/questions/42/my-attempt');
      expect(res.status).toBe(401);
      expect(res.status).not.toBe(404);
    });
  });

  // ── Teacher cannot access student-only attempt endpoints ──────────────────
  describe('Role isolation — teacher cannot submit attempts', () => {
    it('returns 403 when a teacher POSTs to /attempt', async () => {
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
      const res = await request(app)
        .post('/api/v1/questions/42/attempt')
        .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
        .send({ studentAnswer: 'Glucose' });
      expect(res.status).toBe(403);
    });

    it('returns 403 when a teacher GETs /my-attempts', async () => {
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
      const res = await request(app)
        .get('/api/v1/questions/my-attempts')
        .set('Authorization', `Bearer ${TEACHER_TOKEN}`);
      expect(res.status).toBe(403);
    });
  });

  // ── Validation layer ──────────────────────────────────────────────────────
  describe('POST /api/v1/questions/:id/attempt — validation', () => {
    beforeEach(() => {
      pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);
    });

    it('returns 400 when studentAnswer is missing', async () => {
      const res = await request(app)
        .post('/api/v1/questions/42/attempt')
        .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.status).not.toBe(404);
    });

    it('returns 400 when studentAnswer is an empty string', async () => {
      const res = await request(app)
        .post('/api/v1/questions/42/attempt')
        .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
        .send({ studentAnswer: '' });
      expect(res.status).toBe(400);
    });
  });

  // ── Happy-path: authenticated student submits a correct MCQ answer ────────
  describe('POST /api/v1/questions/:id/attempt — happy path', () => {
    it('returns 201 with isCorrect=true for a correct MCQ answer', async () => {
      // authenticate: SELECT from pool
      pool.query
        .mockResolvedValueOnce([[STUDENT_ACCOUNT]])   // authenticate
        .mockResolvedValueOnce([[{ teacher_id: 2 }]]) // _getStudentTeacherId
        .mockResolvedValue([[]]);

      questionRepo.findPublishedById.mockResolvedValue(MOCK_PUBLISHED_MCQ);
      attemptRepo.upsert.mockResolvedValue(MOCK_ATTEMPT_ROW);

      const res = await request(app)
        .post('/api/v1/questions/42/attempt')
        .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
        .send({ studentAnswer: 'Glucose' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isCorrect).toBe(true);
      expect(res.body.data.score).toBe(1);
      expect(res.body.data.correctAnswer).toBe('Glucose');
      expect(res.body.data.attemptCount).toBe(1);
    });

    it('returns 201 with isCorrect=false for a wrong MCQ answer', async () => {
      pool.query
        .mockResolvedValueOnce([[STUDENT_ACCOUNT]])
        .mockResolvedValueOnce([[{ teacher_id: 2 }]])
        .mockResolvedValue([[]]);

      questionRepo.findPublishedById.mockResolvedValue(MOCK_PUBLISHED_MCQ);
      attemptRepo.upsert.mockResolvedValue({
        ...MOCK_ATTEMPT_ROW,
        student_answer: 'Starch',
        is_correct: false,
        score: 0,
      });

      const res = await request(app)
        .post('/api/v1/questions/42/attempt')
        .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
        .send({ studentAnswer: 'Starch' });

      expect(res.status).toBe(201);
      expect(res.body.data.isCorrect).toBe(false);
      expect(res.body.data.score).toBe(0);
    });

    it('returns 404 when question is not published', async () => {
      pool.query
        .mockResolvedValueOnce([[STUDENT_ACCOUNT]])
        .mockResolvedValueOnce([[{ teacher_id: 2 }]])
        .mockResolvedValue([[]]);

      questionRepo.findPublishedById.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/questions/42/attempt')
        .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
        .send({ studentAnswer: 'Glucose' });

      expect(res.status).toBe(404);
    });
  });

  // ── GET /my-attempts — happy path ─────────────────────────────────────────
  describe('GET /api/v1/questions/my-attempts — happy path', () => {
    it('returns 200 with attempts array', async () => {
      pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);
      attemptRepo.listByStudent.mockResolvedValue([
        {
          ...MOCK_ATTEMPT_ROW,
          question_text: 'What do plants convert sunlight into?',
          question_type: 'mcq',
        },
      ]);

      const res = await request(app)
        .get('/api/v1/questions/my-attempts')
        .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.attempts)).toBe(true);
      expect(res.body.data.attempts).toHaveLength(1);
    });

    it('filters by topicId query param when supplied', async () => {
      pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);
      attemptRepo.listByStudent.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/questions/my-attempts?topicId=5')
        .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

      expect(res.status).toBe(200);
      expect(attemptRepo.listByStudent).toHaveBeenCalledWith(1, 5);
    });

    it('returns empty array when student has no attempts yet', async () => {
      pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);
      attemptRepo.listByStudent.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/questions/my-attempts')
        .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.data.attempts).toHaveLength(0);
    });
  });

  // ── GET /:id/my-attempt — happy path ─────────────────────────────────────
  describe('GET /api/v1/questions/:id/my-attempt — happy path', () => {
    it('returns 200 with the attempt when it exists', async () => {
      pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);
      attemptRepo.findByStudentAndQuestion.mockResolvedValue(MOCK_ATTEMPT_ROW);

      const res = await request(app)
        .get('/api/v1/questions/42/my-attempt')
        .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.data.question_id).toBe(42);
      expect(res.body.data.is_correct).toBe(true);
    });

    it('returns 200 with no data field when no prior attempt exists', async () => {
      pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);
      attemptRepo.findByStudentAndQuestion.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/questions/42/my-attempt')
        .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // ApiResponse omits `data` from the envelope when data is null
      // (see response.util.js: `if (data !== null) this.data = data`)
      expect(res.body.data).toBeUndefined();
    });
  });
});
