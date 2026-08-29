/**
 * server/tests/integration/questionMyQuestions.integration.test.js
 *
 * Regression suite for GET /api/v1/questions/my-questions
 *
 * Root causes being guarded against:
 *   1. Students' generated questions disappeared on page reload because
 *      there was no backend endpoint to list them from the DB.
 *   2. The new endpoint must be accessible ONLY to students (not teachers).
 *   3. An unauthenticated request must return 401 (not 404) — proving the
 *      route is registered and the authenticate middleware runs.
 *   4. An authenticated student reaches the service layer (non-404).
 *   5. An authenticated teacher receives 403 (role guard fires).
 */

// ── Mock DB + repositories ────────────────────────────────────────────────────
jest.mock('../../src/database/connection', () => ({
  pool: { query: jest.fn() },
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
  listByStudent: jest.fn(),
  listPublishedForStudent: jest.fn(),
  updateStatus: jest.fn(), textHash: jest.fn(),
}));

jest.mock('../../src/repositories/topic.repository',     () => ({ findOwnedById: jest.fn() }));
jest.mock('../../src/repositories/chapter.repository',   () => ({ findOwnedById: jest.fn() }));
jest.mock('../../src/repositories/subject.repository',   () => ({ findOwnedById: jest.fn() }));
jest.mock('../../src/repositories/curriculum.repository',() => ({ findOwnedById: jest.fn() }));
jest.mock('../../src/services/knowledge/retrieval.service', () => ({ search: jest.fn() }));
jest.mock('../../src/services/ai/providers',               () => ({ getLLMProvider: jest.fn() }));

// ── Load app ──────────────────────────────────────────────────────────────────
const request     = require('supertest');
const jwt         = require('jsonwebtoken');
const app         = require('../../app');

const studentRepo = require('../../src/repositories/student.repository');
const teacherRepo = require('../../src/repositories/teacher.repository');
const questionRepo = require('../../src/repositories/questionBank.repository');
const { pool }    = require('../../src/database/connection');

// ── Helpers ───────────────────────────────────────────────────────────────────
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

const MOCK_PENDING_QUESTION = {
  id: 1, question_type: 'mcq', difficulty: 'medium',
  question_text: 'What is photosynthesis?',
  status: 'pending_approval', topic_id: 42,
  created_by: 1, created_by_role: 'student',
  created_at: new Date().toISOString(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('GET /api/v1/questions/my-questions — route registration + persistence', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT);
    teacherRepo.findById.mockResolvedValue(TEACHER_ACCOUNT);
  });

  // ── Route registration ──────────────────────────────────────────────────────
  it('returns 401 (not 404) without auth — route IS registered', async () => {
    const res = await request(app).get('/api/v1/questions/my-questions');
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
    expect(res.body.success).toBe(false);
  });

  // ── Student: happy path ─────────────────────────────────────────────────────
  it('authenticated student reaches the service layer (non-404)', async () => {
    pool.query
      .mockResolvedValueOnce([[STUDENT_ACCOUNT]])        // authenticate
      .mockResolvedValueOnce([[{ teacher_id: 2 }]])     // _getStudentTeacherId
      .mockResolvedValue([[]]);

    questionRepo.listByStudent.mockResolvedValue([MOCK_PENDING_QUESTION]);

    const res = await request(app)
      .get('/api/v1/questions/my-questions')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).not.toBe(404);
  });

  it('authenticated student receives persisted questions (200 with questions array)', async () => {
    pool.query
      .mockResolvedValueOnce([[STUDENT_ACCOUNT]])        // authenticate
      .mockResolvedValueOnce([[{ teacher_id: 2 }]])     // _getStudentTeacherId
      .mockResolvedValue([[]]);

    questionRepo.listByStudent.mockResolvedValue([MOCK_PENDING_QUESTION]);

    const res = await request(app)
      .get('/api/v1/questions/my-questions')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.questions)).toBe(true);
    expect(res.body.data.questions[0].status).toBe('pending_approval');
  });

  it('filters by topicId when query param supplied', async () => {
    pool.query
      .mockResolvedValueOnce([[STUDENT_ACCOUNT]])
      .mockResolvedValueOnce([[{ teacher_id: 2 }]])
      .mockResolvedValue([[]]);

    questionRepo.listByStudent.mockResolvedValue([MOCK_PENDING_QUESTION]);

    const res = await request(app)
      .get('/api/v1/questions/my-questions?topicId=42')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    // listByStudent was called (reached the service layer with topicId)
    expect(questionRepo.listByStudent).toHaveBeenCalled();
  });

  it('returns empty array when student has no questions — does not return 404', async () => {
    pool.query
      .mockResolvedValueOnce([[STUDENT_ACCOUNT]])
      .mockResolvedValueOnce([[{ teacher_id: 2 }]])
      .mockResolvedValue([[]]);

    questionRepo.listByStudent.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/questions/my-questions')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.questions).toEqual([]);
  });

  // ── Authorisation: teacher must NOT access this endpoint ───────────────────
  it('returns 403 when a teacher tries to access the student endpoint', async () => {
    pool.query
      .mockResolvedValueOnce([[TEACHER_ACCOUNT]])   // authenticate
      .mockResolvedValue([[]]);

    const res = await request(app)
      .get('/api/v1/questions/my-questions')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    // authorizeRoles('student') fires → 403
    expect(res.status).toBe(403);
    expect(res.status).not.toBe(404);
  });

  // ── Persistence regression: questions survive reload ───────────────────────
  it('returns the same question on a second call (simulates page reload)', async () => {
    const dbQuestion = { ...MOCK_PENDING_QUESTION, status: 'approved' };

    for (let i = 0; i < 2; i++) {
      pool.query
        .mockResolvedValueOnce([[STUDENT_ACCOUNT]])
        .mockResolvedValueOnce([[{ teacher_id: 2 }]])
        .mockResolvedValue([[]]);

      questionRepo.listByStudent.mockResolvedValueOnce([dbQuestion]);

      const res = await request(app)
        .get('/api/v1/questions/my-questions')
        .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.data.questions[0].id).toBe(dbQuestion.id);
      expect(res.body.data.questions[0].status).toBe('approved');
    }
  });

  // ── Real-time sync: status update reflected on re-fetch ────────────────────
  it('reflects updated status on subsequent fetches (teacher approval propagation)', async () => {
    // First fetch: pending_approval
    pool.query
      .mockResolvedValueOnce([[STUDENT_ACCOUNT]])
      .mockResolvedValueOnce([[{ teacher_id: 2 }]])
      .mockResolvedValue([[]]);
    questionRepo.listByStudent.mockResolvedValueOnce([{ ...MOCK_PENDING_QUESTION, status: 'pending_approval' }]);

    const firstRes = await request(app)
      .get('/api/v1/questions/my-questions')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);
    expect(firstRes.body.data.questions[0].status).toBe('pending_approval');

    // Simulate teacher approval in DB; second fetch returns updated status
    pool.query
      .mockResolvedValueOnce([[STUDENT_ACCOUNT]])
      .mockResolvedValueOnce([[{ teacher_id: 2 }]])
      .mockResolvedValue([[]]);
    questionRepo.listByStudent.mockResolvedValueOnce([{ ...MOCK_PENDING_QUESTION, status: 'approved' }]);

    const secondRes = await request(app)
      .get('/api/v1/questions/my-questions')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);
    expect(secondRes.body.data.questions[0].status).toBe('approved');
  });
});
