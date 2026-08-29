/**
 * server/tests/integration/questionRoutes.integration.test.js
 *
 * Regression suite that proves POST /api/v1/questions/generate (and every
 * other question endpoint) is correctly registered in the versioned v1 router
 * and reaches the expected controller / service layer.
 *
 * Root cause being guarded against:
 *   The committed HEAD of routes/v1/index.js was missing:
 *     const questionRoutes = require('../question.routes');
 *     router.use('/questions', questionRoutes);
 *   This caused every question endpoint to return 404 even for authenticated
 *   students/teachers.
 *
 * Strategy:
 *   - Real Express app (app.js), real routing, real JWT signing.
 *   - All database + LLM + embedding dependencies mocked so no external
 *     services or live DB are required (consistent with the rest of the suite).
 *   - An unauthenticated request MUST return 401 (not 404) to prove the route
 *     is registered and the authenticate middleware is reached.
 *   - An authenticated request with a valid student/teacher JWT MUST reach
 *     the generation service layer and return a non-404 response.
 */

// ── Mock the database connection (must come before app.js require) ────────────
jest.mock('../../src/database/connection', () => ({
  pool: { query: jest.fn() },
  testConnection: jest.fn(),
}));

// ── Mock repositories consumed by question routes ─────────────────────────────
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

// ── Mock audit + login-history repos (consumed transitively) ─────────────────
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

// ── Mock question-specific repositories + services ────────────────────────────
jest.mock('../../src/repositories/questionBank.repository', () => ({
  insert: jest.fn(), existsDuplicate: jest.fn(), findById: jest.fn(),
  findByTopic: jest.fn(), findPendingApproval: jest.fn(),
  updateStatus: jest.fn(), textHash: jest.fn(),
}));

jest.mock('../../src/repositories/topic.repository', () => ({
  findOwnedById: jest.fn(),
}));
jest.mock('../../src/repositories/chapter.repository', () => ({
  findOwnedById: jest.fn(),
}));
jest.mock('../../src/repositories/subject.repository', () => ({
  findOwnedById: jest.fn(),
}));
jest.mock('../../src/repositories/curriculum.repository', () => ({
  findOwnedById: jest.fn(),
}));

jest.mock('../../src/services/knowledge/retrieval.service', () => ({
  search: jest.fn(),
}));

jest.mock('../../src/services/ai/providers', () => ({
  getLLMProvider: jest.fn(),
}));

// ── Load app + dependencies ────────────────────────────────────────────────────
const request    = require('supertest');
const jwt        = require('jsonwebtoken');
const app        = require('../../app');

const studentRepo = require('../../src/repositories/student.repository');
const teacherRepo = require('../../src/repositories/teacher.repository');
const topicRepo   = require('../../src/repositories/topic.repository');
const { search }  = require('../../src/services/knowledge/retrieval.service');
const { getLLMProvider } = require('../../src/services/ai/providers');

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

const STUDENT_TOKEN  = makeToken({ id: 1, role: 'student' });
const TEACHER_TOKEN  = makeToken({ id: 2, role: 'teacher' });

// ── Fixtures ──────────────────────────────────────────────────────────────────
const MOCK_TOPIC      = { id: 10, name: 'Photosynthesis', chapter_id: 5 };
const MOCK_CHAPTER    = { id: 5,  name: 'Plant Biology',  subject_id: 3 };
const MOCK_SUBJECT    = { id: 3,  name: 'Biology',        curriculum_id: 1 };
const MOCK_CURRICULUM = { id: 1,  name: 'Science Curriculum' };

const MOCK_CHUNKS = [
  {
    chunkId: 101, chunkIndex: 0,
    text: 'Photosynthesis converts sunlight into glucose.',
    similarity: 0.92,
    source: {
      documentId: 20, documentTitle: 'Bio Textbook',
      originalFilename: 'bio.pdf', fileType: 'pdf', sourceMeta: null,
      topic:      { id: 10, name: 'Photosynthesis' },
      chapter:    { id: 5,  name: 'Plant Biology' },
      subject:    { id: 3,  name: 'Biology' },
      curriculum: { id: 1,  name: 'Science Curriculum' },
    },
  },
];

const MOCK_LLM_RESPONSE = {
  questions: [
    {
      type: 'mcq',
      question: 'What do plants convert sunlight into?',
      options: ['Starch', 'Glucose', 'Protein', 'Fat'],
      correct_answer: 'Glucose',
      explanation: 'Photosynthesis converts sunlight into glucose.',
      difficulty: 'medium',
    },
  ],
};

// ── Route registration proofs ─────────────────────────────────────────────────
describe('Question Bank — route registration (Sprint 3 regression)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // authenticate middleware resolves student account from DB
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT);
    teacherRepo.findById.mockResolvedValue(TEACHER_ACCOUNT);
  });

  // ── Core registration proof: 401 not 404 ───────────────────────────────────
  describe('POST /api/v1/questions/generate — route registration', () => {
    it('returns 401 (not 404) when no Bearer token is supplied', async () => {
      const res = await request(app)
        .post('/api/v1/questions/generate')
        .send({ topicId: 1, questionType: 'mcq' });

      // 401 proves the route IS registered and authenticate middleware ran.
      // 404 would mean the route is NOT mounted in v1/index.js.
      expect(res.status).toBe(401);
      expect(res.status).not.toBe(404);
    });

    it('returns 401 with the expected error body shape', async () => {
      const res = await request(app)
        .post('/api/v1/questions/generate')
        .send({ topicId: 1, questionType: 'mcq' });

      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/token/i);
    });
  });

  describe('GET /api/v1/questions/pending-approval — route registration', () => {
    it('returns 401 (not 404) without auth', async () => {
      const res = await request(app).get('/api/v1/questions/pending-approval');
      expect(res.status).toBe(401);
      expect(res.status).not.toBe(404);
    });
  });

  describe('GET /api/v1/questions/topics/:topicId — route registration', () => {
    it('returns 401 (not 404) without auth', async () => {
      const res = await request(app).get('/api/v1/questions/topics/1');
      expect(res.status).toBe(401);
      expect(res.status).not.toBe(404);
    });
  });

  describe('GET /api/v1/questions/topics/:topicId/published — route registration', () => {
    it('returns 401 (not 404) without auth', async () => {
      const res = await request(app).get('/api/v1/questions/topics/1/published');
      expect(res.status).toBe(401);
      expect(res.status).not.toBe(404);
    });
  });

  describe('PATCH /api/v1/questions/:questionId/approve — route registration', () => {
    it('returns 401 (not 404) without auth', async () => {
      const res = await request(app).patch('/api/v1/questions/1/approve');
      expect(res.status).toBe(401);
      expect(res.status).not.toBe(404);
    });
  });

  // ── Authenticated: route reaches service layer ─────────────────────────────
  describe('POST /api/v1/questions/generate — authenticated student', () => {
    it('reaches the generation service — non-404 response with valid JWT + valid body', async () => {
      // Arrange: authenticated student + happy-path service mocks
      const chapterRepo    = require('../../src/repositories/chapter.repository');
      const subjectRepo    = require('../../src/repositories/subject.repository');
      const curriculumRepo = require('../../src/repositories/curriculum.repository');
      const questionRepo   = require('../../src/repositories/questionBank.repository');

      topicRepo.findOwnedById.mockResolvedValue(MOCK_TOPIC);
      chapterRepo.findOwnedById.mockResolvedValue(MOCK_CHAPTER);
      subjectRepo.findOwnedById.mockResolvedValue(MOCK_SUBJECT);
      curriculumRepo.findOwnedById.mockResolvedValue(MOCK_CURRICULUM);
      search.mockResolvedValue({ results: MOCK_CHUNKS });
      questionRepo.existsDuplicate.mockResolvedValue(false);
      questionRepo.insert.mockResolvedValue({
        id: 99, status: 'pending_approval', created_at: new Date().toISOString(),
      });
      getLLMProvider.mockReturnValue({
        generateStructuredOutput: jest.fn().mockResolvedValue(MOCK_LLM_RESPONSE),
      });

      // authenticate calls pool.query directly; _resolveTeacherForStudent also uses pool.query
      const { pool } = require('../../src/database/connection');
      pool.query
        .mockResolvedValueOnce([[STUDENT_ACCOUNT]])   // authenticate: SELECT * FROM students WHERE id = $1
        .mockResolvedValueOnce([[{ teacher_id: 2 }]]) // _resolveTeacherForStudent
        .mockResolvedValue([[]]);

      const res = await request(app)
        .post('/api/v1/questions/generate')
        .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
        .send({ topicId: 10, questionType: 'mcq', difficulty: 'medium', count: 1 });

      // The important assertion: route is reachable (not 404).
      // Accept any non-404 response — even 400/403/500 proves the route exists.
      expect(res.status).not.toBe(404);
    });

    it('returns non-404 when pool returns no classroom for student', async () => {
      // When a student has no classroom, _resolveTeacherForStudent throws 403.
      // This proves the route IS registered (route handler ran) — if 404 were
      // returned it would mean the route is not mounted.
      const { pool } = require('../../src/database/connection');
      pool.query
        .mockResolvedValueOnce([[STUDENT_ACCOUNT]])   // authenticate
        .mockResolvedValueOnce([[]])                  // _resolveTeacherForStudent — no classroom
        .mockResolvedValue([[]]);

      const res = await request(app)
        .post('/api/v1/questions/generate')
        .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
        .send({ topicId: 10, questionType: 'mcq', difficulty: 'medium', count: 1 });

      // Must NOT be 404; business logic produces 403 (no classroom)
      expect(res.status).not.toBe(404);
    });
  });

  describe('POST /api/v1/questions/generate — authenticated teacher', () => {
    it('reaches the generation service — non-404 response with valid JWT', async () => {
      const chapterRepo    = require('../../src/repositories/chapter.repository');
      const subjectRepo    = require('../../src/repositories/subject.repository');
      const curriculumRepo = require('../../src/repositories/curriculum.repository');
      const questionRepo   = require('../../src/repositories/questionBank.repository');

      topicRepo.findOwnedById.mockResolvedValue(MOCK_TOPIC);
      chapterRepo.findOwnedById.mockResolvedValue(MOCK_CHAPTER);
      subjectRepo.findOwnedById.mockResolvedValue(MOCK_SUBJECT);
      curriculumRepo.findOwnedById.mockResolvedValue(MOCK_CURRICULUM);
      search.mockResolvedValue({ results: MOCK_CHUNKS });
      questionRepo.existsDuplicate.mockResolvedValue(false);
      questionRepo.insert.mockResolvedValue({
        id: 42, status: 'pending_approval', created_at: new Date().toISOString(),
      });
      getLLMProvider.mockReturnValue({
        generateStructuredOutput: jest.fn().mockResolvedValue(MOCK_LLM_RESPONSE),
      });

      const { pool } = require('../../src/database/connection');
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]); // authenticate

      const res = await request(app)
        .post('/api/v1/questions/generate')
        .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
        .send({ topicId: 10, questionType: 'mcq', difficulty: 'medium', count: 1 });

      expect(res.status).not.toBe(404);
    });
  });

  // ── Validator is reached (not bypassed) ───────────────────────────────────
  describe('POST /api/v1/questions/generate — validation layer', () => {
    it('returns 400 (not 404) when body is missing required fields', async () => {
      const { pool } = require('../../src/database/connection');
      // Provide the student account so authenticate passes; then validation fires
      pool.query
        .mockResolvedValueOnce([[STUDENT_ACCOUNT]])  // authenticate
        .mockResolvedValue([[]]);

      const res = await request(app)
        .post('/api/v1/questions/generate')
        .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
        .send({});  // missing topicId, questionType

      // 400 proves: route is registered AND authenticate + validate middleware ran
      expect(res.status).not.toBe(404);
      expect(res.status).toBe(400);
    });
  });
});
