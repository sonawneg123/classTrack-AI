/**
 * server/tests/integration/practiceRoutes.integration.test.js
 *
 * Integration suite for the Student AI Practice endpoints (Sprint 6):
 *   POST /api/v1/practice/generate
 *   GET  /api/v1/practice/questions
 *   GET  /api/v1/practice/questions/:questionId
 *   POST /api/v1/practice/questions/:questionId/attempt
 *   GET  /api/v1/practice/questions/:questionId/attempt
 *
 * Security assertions:
 *   - Unauthenticated → 401
 *   - Teacher trying student-only endpoints → 403
 *   - Student submits to own practice question → 201
 *   - Student cannot attempt another student's practice question → 404
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
  // Sprint 6 practice methods
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

// ── Load app ───────────────────────────────────────────────────────────────────
const request      = require('supertest');
const jwt          = require('jsonwebtoken');
const app          = require('../../app');

const studentRepo   = require('../../src/repositories/student.repository');
const teacherRepo   = require('../../src/repositories/teacher.repository');
const questionRepo  = require('../../src/repositories/questionBank.repository');
const attemptRepo   = require('../../src/repositories/quizAttempt.repository');
const { pool }      = require('../../src/database/connection');

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

const MOCK_PRACTICE_QUESTION = {
  id: 77,
  question_type: 'mcq',
  question_text: 'What is photosynthesis?',
  options: ['A process', 'A reaction', 'A cycle', 'A structure'],
  correct_answer: 'A process',
  explanation: 'Photosynthesis is the process of converting sunlight.',
  marks: 1.00,
  status: 'practice',
  difficulty: 'easy',
  created_by: 1,
  created_by_role: 'student',
  topic_id: 10,
};

const MOCK_ATTEMPT_ROW = {
  id:                1,
  student_id:        1,
  question_id:       77,
  student_answer:    'A process',
  is_correct:        true,
  score:             1.00,
  attempt_count:     1,
  first_attempted_at: new Date().toISOString(),
  last_attempted_at:  new Date().toISOString(),
};

// ── Route registration ────────────────────────────────────────────────────────

describe('Student Practice — route registration (Sprint 6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT);
    teacherRepo.findById.mockResolvedValue(TEACHER_ACCOUNT);
  });

  it('POST /api/v1/practice/generate returns 401 (not 404) without auth', async () => {
    const res = await request(app)
      .post('/api/v1/practice/generate')
      .send({ topicId: 1, questionType: 'mcq' });
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
  });

  it('GET /api/v1/practice/questions returns 401 (not 404) without auth', async () => {
    const res = await request(app).get('/api/v1/practice/questions');
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
  });

  it('POST /api/v1/practice/questions/:id/attempt returns 401 (not 404) without auth', async () => {
    const res = await request(app)
      .post('/api/v1/practice/questions/77/attempt')
      .send({ studentAnswer: 'A process' });
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
  });
});

// ── Role isolation — teacher cannot access student practice routes ─────────────

describe('Student Practice — role isolation (Sprint 6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    teacherRepo.findById.mockResolvedValue(TEACHER_ACCOUNT);
  });

  it('returns 403 when a teacher POSTs to /practice/generate', async () => {
    pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
    const res = await request(app)
      .post('/api/v1/practice/generate')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ topicId: 10, questionType: 'mcq', difficulty: 'medium', count: 1 });
    expect(res.status).toBe(403);
  });

  it('returns 403 when a teacher GETs /practice/questions', async () => {
    pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
    const res = await request(app)
      .get('/api/v1/practice/questions')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);
    expect(res.status).toBe(403);
  });
});

// ── Validation layer ───────────────────────────────────────────────────────────

describe('POST /api/v1/practice/generate — validation layer', () => {
  it('returns 400 when body is missing required fields', async () => {
    pool.query.mockResolvedValueOnce([[STUDENT_ACCOUNT]]).mockResolvedValue([[]]);
    const res = await request(app)
      .post('/api/v1/practice/generate')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(404);
  });

  it('returns 400 when studentAnswer is missing on attempt', async () => {
    pool.query.mockResolvedValueOnce([[STUDENT_ACCOUNT]]).mockResolvedValue([[]]);
    const res = await request(app)
      .post('/api/v1/practice/questions/77/attempt')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(404);
  });
});

// ── Happy path — list practice questions ─────────────────────────────────────

describe('GET /api/v1/practice/questions — happy path', () => {
  it('returns 200 with questions array for authenticated student', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);
    questionRepo.listPracticeByStudent.mockResolvedValue([MOCK_PRACTICE_QUESTION]);

    const res = await request(app)
      .get('/api/v1/practice/questions')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.questions)).toBe(true);
    expect(res.body.data.questions).toHaveLength(1);
    expect(res.body.data.questions[0].status).toBe('practice');
  });

  it('returns empty array when no practice questions exist', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);
    questionRepo.listPracticeByStudent.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/practice/questions')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.questions).toHaveLength(0);
  });
});

// ── Happy path — submit practice attempt ──────────────────────────────────────

describe('POST /api/v1/practice/questions/:questionId/attempt — happy path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT);
    teacherRepo.findById.mockResolvedValue(TEACHER_ACCOUNT);
  });

  it('returns 201 with isCorrect=true for a correct MCQ answer', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);
    questionRepo.findPracticeByIdForStudent.mockResolvedValue(MOCK_PRACTICE_QUESTION);
    attemptRepo.upsert.mockResolvedValue(MOCK_ATTEMPT_ROW);

    const res = await request(app)
      .post('/api/v1/practice/questions/77/attempt')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
      .send({ studentAnswer: 'A process' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isCorrect).toBe(true);
    expect(res.body.data.score).toBe(1);
    expect(res.body.data.correctAnswer).toBe('A process');
  });

  it('returns 404 when question does not belong to this student', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);
    // findPracticeByIdForStudent returns null — IDOR protection
    questionRepo.findPracticeByIdForStudent.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/practice/questions/99/attempt')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
      .send({ studentAnswer: 'Something' });

    expect(res.status).toBe(404);
    expect(attemptRepo.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when studentAnswer is empty', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);

    const res = await request(app)
      .post('/api/v1/practice/questions/77/attempt')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
      .send({ studentAnswer: '' });

    expect(res.status).toBe(400);
  });
});

// ── Happy path — get single practice attempt ──────────────────────────────────

describe('GET /api/v1/practice/questions/:questionId/attempt — happy path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT);
    teacherRepo.findById.mockResolvedValue(TEACHER_ACCOUNT);
  });

  it('returns 200 with attempt data when attempt exists', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);
    questionRepo.findPracticeByIdForStudent.mockResolvedValue(MOCK_PRACTICE_QUESTION);
    attemptRepo.findByStudentAndQuestion.mockResolvedValue(MOCK_ATTEMPT_ROW);

    const res = await request(app)
      .get('/api/v1/practice/questions/77/attempt')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.question_id).toBe(77);
  });

  it('returns 200 with null data when not yet attempted', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);
    questionRepo.findPracticeByIdForStudent.mockResolvedValue(MOCK_PRACTICE_QUESTION);
    attemptRepo.findByStudentAndQuestion.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/practice/questions/77/attempt')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    // ApiResponse omits data when it's null
    expect(res.body.data).toBeUndefined();
  });
});

// ── IDOR prevention ───────────────────────────────────────────────────────────

describe('Student Practice — IDOR prevention (Sprint 6)', () => {
  it('returns 404 for a practice question owned by a different student', async () => {
    pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);
    // The question exists but belongs to student 99, not student 1
    questionRepo.findPracticeByIdForStudent.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/practice/questions/55')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(404);
  });
});
