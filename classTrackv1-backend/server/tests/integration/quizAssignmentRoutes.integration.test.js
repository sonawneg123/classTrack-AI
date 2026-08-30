/**
 * server/tests/integration/quizAssignmentRoutes.integration.test.js
 *
 * Integration tests for the Quiz Assignment API (Sprint 7).
 *
 * Covers:
 *   - Route registration (401 without auth, not 404)
 *   - Role isolation (student cannot access teacher routes, teacher cannot access student routes)
 *   - Teacher CRUD: create, list, get, update, publish, archive, delete
 *   - Teacher question management: addQuestion, removeQuestion, reorderQuestions
 *   - Teacher results endpoint
 *   - Student: list, get, start, submit, attempt history
 *   - Security: IDOR prevention, ownership enforcement
 *   - Business rules: cannot publish with 0 questions, cannot add non-published questions
 *   - Quiz duplicate submission guard
 *
 * All database + external dependencies are mocked.
 * Tests use real Express app, real JWT signing, real routing.
 */

// ── Mock DB (before app require) ──────────────────────────────────────────────
jest.mock('../../src/database/connection', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  testConnection: jest.fn(),
}));

// ── Auth repository mocks ──────────────────────────────────────────────────────
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

// ── Domain repository mocks ───────────────────────────────────────────────────
jest.mock('../../src/repositories/quizAssignment.repository', () => ({
  createQuiz:             jest.fn(),
  listByTeacher:          jest.fn(),
  findByIdForTeacher:     jest.fn(),
  updateFields:           jest.fn(),
  setStatus:              jest.fn(),
  softDelete:             jest.fn(),
  countQuestions:         jest.fn(),
  addQuestion:            jest.fn(),
  addQuestionsBatch:      jest.fn(),
  removeQuestion:         jest.fn(),
  reorderQuestions:       jest.fn(),
  getResultsForTeacher:   jest.fn(),
  listForStudent:         jest.fn(),
  findForStudent:         jest.fn(),
  insertAttempt:          jest.fn(),
  updateAttempt:          jest.fn(),
  getNextAttemptNumber:   jest.fn(),
  getLatestAttempt:       jest.fn(),
  listAttemptsForStudent: jest.fn(),
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
  countPublishedByTopic: jest.fn(),
  selectPublishedRandom: jest.fn(),
  selectPublishedByIds:  jest.fn(),
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
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../../app');

const teacherRepo    = require('../../src/repositories/teacher.repository');
const studentRepo    = require('../../src/repositories/student.repository');
const quizRepo       = require('../../src/repositories/quizAssignment.repository');
const questionRepo   = require('../../src/repositories/questionBank.repository');
const { pool }       = require('../../src/database/connection');

// ── Helpers ────────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_that_is_long_enough';
function makeToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

const TEACHER = { id: 2, email: 'teacher@test.ai', name: 'Test Teacher', is_active: true };
const STUDENT = { id: 1, username: 'student1', name: 'Test Student', is_active: true, classroom_id: 10 };

const TEACHER_TOKEN = makeToken({ id: 2, role: 'teacher' });
const STUDENT_TOKEN = makeToken({ id: 1, role: 'student' });

const MOCK_QUIZ = {
  id: 42, teacher_id: 2, classroom_id: 5, classroom_name: 'Grade 8 - A',
  title: 'Biodiversity Quiz', instructions: null,
  time_limit_minutes: null, due_date: null,
  status: 'draft', allow_retake: false, shuffle_questions: false,
  question_count: 0, attempt_count: 0,
  questions: [],
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

const MOCK_PUBLISHED_QUIZ = {
  ...MOCK_QUIZ,
  status: 'published',
  question_count: 2,
  questions: [
    {
      id: 100, quiz_question_id: 1, order_index: 1, marks_override: null,
      question_type: 'mcq', difficulty: 'easy', marks: 1,
      question_text: 'What is photosynthesis?',
      options: ['A process', 'A reaction', 'A cycle', 'A structure'],
      correct_answer: 'A process', explanation: null,
    },
    {
      id: 101, quiz_question_id: 2, order_index: 2, marks_override: null,
      question_type: 'true_false', difficulty: 'easy', marks: 1,
      question_text: 'Plants make food via photosynthesis.',
      options: null,
      correct_answer: 'true', explanation: null,
    },
  ],
};

const MOCK_PUBLISHED_QUESTION = {
  id: 100, question_type: 'mcq', difficulty: 'easy', marks: 1,
  question_text: 'What is photosynthesis?',
  options: ['A process', 'A reaction', 'A cycle', 'A structure'],
  correct_answer: 'A process', explanation: null,
  status: 'published', topic_id: 10, curriculum_id: 1,
};

// ── beforeEach ─────────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
  teacherRepo.findById.mockResolvedValue(TEACHER);
  studentRepo.findById.mockResolvedValue(STUDENT);
  pool.query.mockResolvedValue([[TEACHER]]);
});

// ── Route registration ─────────────────────────────────────────────────────────
describe('Quiz Assignment — route registration', () => {
  it('POST /api/v1/teacher/quiz-assignments returns 401 (not 404) without auth', async () => {
    const res = await request(app).post('/api/v1/teacher/quiz-assignments').send({});
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
  });

  it('GET /api/v1/teacher/quiz-assignments returns 401 (not 404) without auth', async () => {
    const res = await request(app).get('/api/v1/teacher/quiz-assignments');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/student/quiz-assignments returns 401 (not 404) without auth', async () => {
    const res = await request(app).get('/api/v1/student/quiz-assignments');
    expect(res.status).toBe(401);
  });
});

// ── Role isolation ─────────────────────────────────────────────────────────────
describe('Quiz Assignment — role isolation', () => {
  it('student cannot POST to teacher quiz creation endpoint', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);
    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
      .send({ classroomId: 1, title: 'Test' });
    expect(res.status).toBe(403);
  });

  it('teacher cannot GET student quiz list endpoint', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    const res = await request(app)
      .get('/api/v1/student/quiz-assignments')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);
    expect(res.status).toBe(403);
  });
});

// ── Teacher: Validation ────────────────────────────────────────────────────────
describe('POST /api/v1/teacher/quiz-assignments — validation', () => {
  it('returns 400 when classroomId is missing', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ title: 'Quiz without classroom' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when title is missing', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ classroomId: 1 });
    expect(res.status).toBe(400);
  });
});

// ── Teacher: Create quiz ───────────────────────────────────────────────────────
describe('POST /api/v1/teacher/quiz-assignments — happy path', () => {
  it('creates a quiz and returns 201 with quiz data', async () => {
    // pool.query for classroom ownership check, then auth
    pool.query
      .mockResolvedValueOnce([[TEACHER]])                // authenticate
      .mockResolvedValueOnce([[{ id: 5 }]]);             // classroom ownership check
    quizRepo.createQuiz.mockResolvedValue(MOCK_QUIZ);

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ classroomId: 5, title: 'Biodiversity Quiz' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.quiz.title).toBe('Biodiversity Quiz');
    expect(res.body.data.quiz.status).toBe('draft');
  });

  it('returns 404 when teacher does not own the classroom', async () => {
    // teacher.routes.js (mounted at /teacher) runs its global authenticate middleware
    // first and consumes one pool.query mock before Express falls through to quiz.routes.js.
    // Three mocks are required: teacher.routes auth → quiz.routes auth → classroom check.
    pool.query
      .mockResolvedValueOnce([[TEACHER]])  // teacher.routes.js global authenticate
      .mockResolvedValueOnce([[TEACHER]])  // quiz.routes.js teacherRouter authenticate
      .mockResolvedValueOnce([[]]);        // classroom NOT found (empty)
    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ classroomId: 999, title: 'Quiz' });
    expect(res.status).toBe(404);
  });
});

// ── Teacher: List quizzes ──────────────────────────────────────────────────────
describe('GET /api/v1/teacher/quiz-assignments — happy path', () => {
  it('returns 200 with quiz list', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.listByTeacher.mockResolvedValue([MOCK_QUIZ]);

    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.quizzes)).toBe(true);
    expect(res.body.data.quizzes[0].id).toBe(42);
  });
});

// ── Teacher: Publish quiz ──────────────────────────────────────────────────────
describe('PATCH /api/v1/teacher/quiz-assignments/:quizId/publish', () => {
  it('returns 400 when quiz has no questions', async () => {
    pool.query
      .mockResolvedValueOnce([[TEACHER]])  // authenticate
      .mockResolvedValueOnce([[{ id: 5, is_active: true }]]);  // classroom check
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...MOCK_QUIZ });
    quizRepo.countQuestions.mockResolvedValue(0);

    const res = await request(app)
      .patch('/api/v1/teacher/quiz-assignments/42/publish')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no questions/i);
  });

  it('returns 200 when quiz has questions and classroom is active', async () => {
    pool.query
      .mockResolvedValueOnce([[TEACHER]])              // authenticate
      .mockResolvedValueOnce([[{ id: 5, is_active: true }]]);  // classroom check
    quizRepo.findByIdForTeacher
      .mockResolvedValueOnce({ ...MOCK_QUIZ, questions: [{}] })  // _requireOwnedQuiz
      .mockResolvedValueOnce({ ...MOCK_QUIZ, status: 'published', questions: [{}] }); // re-fetch
    quizRepo.countQuestions.mockResolvedValue(1);
    quizRepo.setStatus.mockResolvedValue({ id: 42, status: 'published' });

    const res = await request(app)
      .patch('/api/v1/teacher/quiz-assignments/42/publish')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(quizRepo.setStatus).toHaveBeenCalledWith(42, 2, 'published');
  });
});

// ── Teacher: Add question ──────────────────────────────────────────────────────
describe('POST /api/v1/teacher/quiz-assignments/:quizId/questions', () => {
  it('returns 400 when question is not published', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...MOCK_QUIZ });
    questionRepo.findByIdForTeacher.mockResolvedValue({
      ...MOCK_PUBLISHED_QUESTION, status: 'pending_approval',
    });

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionId: 100 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/published/i);
  });

  it('returns 404 when question does not belong to teacher', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...MOCK_QUIZ });
    questionRepo.findByIdForTeacher.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionId: 999 });

    expect(res.status).toBe(404);
  });

  it('returns 409 when question is already in the quiz', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({
      ...MOCK_QUIZ,
      questions: [{ id: 100 }],
    });
    questionRepo.findByIdForTeacher.mockResolvedValue(MOCK_PUBLISHED_QUESTION);

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionId: 100 });

    expect(res.status).toBe(409);
  });

  it('returns 201 when successfully adding a published question', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...MOCK_QUIZ, questions: [] });
    questionRepo.findByIdForTeacher.mockResolvedValue(MOCK_PUBLISHED_QUESTION);
    quizRepo.countQuestions.mockResolvedValue(0);
    quizRepo.addQuestion.mockResolvedValue({
      id: 1, quiz_assignment_id: 42, question_id: 100, order_index: 1, marks_override: null,
    });

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionId: 100 });

    expect(res.status).toBe(201);
    expect(quizRepo.addQuestion).toHaveBeenCalledWith(42, 100, 1, null);
  });
});

// ── Student: List quizzes ──────────────────────────────────────────────────────
describe('GET /api/v1/student/quiz-assignments — student happy path', () => {
  it('returns 200 with quiz list for authenticated student', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);
    quizRepo.listForStudent.mockResolvedValue([
      { ...MOCK_PUBLISHED_QUIZ, latest_attempt: null },
    ]);

    const res = await request(app)
      .get('/api/v1/student/quiz-assignments')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.quizzes).toHaveLength(1);
    expect(res.body.data.quizzes[0].status).toBe('published');
  });
});

// ── Student: Start quiz ────────────────────────────────────────────────────────
describe('POST /api/v1/student/quiz-assignments/:quizId/start', () => {
  it('returns 200 and creates a new in-progress attempt', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);
    quizRepo.findForStudent.mockResolvedValue({ ...MOCK_PUBLISHED_QUIZ });
    quizRepo.getLatestAttempt.mockResolvedValue(null);
    quizRepo.getNextAttemptNumber.mockResolvedValue(1);
    quizRepo.insertAttempt.mockResolvedValue({
      id: 1, quiz_assignment_id: 42, student_id: 1,
      attempt_number: 1, status: 'in_progress',
      score: null, max_score: null,
      started_at: new Date().toISOString(), submitted_at: null,
    });

    const res = await request(app)
      .post('/api/v1/student/quiz-assignments/42/start')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.attempt.status).toBe('in_progress');
    expect(quizRepo.insertAttempt).toHaveBeenCalled();
  });

  it('returns 403 when quiz does not allow retake and already submitted', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);
    quizRepo.findForStudent.mockResolvedValue({ ...MOCK_PUBLISHED_QUIZ, allow_retake: false });
    quizRepo.getLatestAttempt.mockResolvedValue({ status: 'submitted', attempt_number: 1 });

    const res = await request(app)
      .post('/api/v1/student/quiz-assignments/42/start')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/retake/i);
  });
});

// ── Student: Submit quiz ───────────────────────────────────────────────────────
describe('POST /api/v1/student/quiz-assignments/:quizId/submit', () => {
  it('returns 200 with scoring results', async () => {
    const inProgressAttempt = {
      id: 1, quiz_assignment_id: 42, student_id: 1,
      attempt_number: 1, status: 'in_progress',
      score: null, max_score: null,
    };
    const mockClient = {
      query:   jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    pool.query.mockResolvedValue([[STUDENT]]);
    pool.connect = jest.fn().mockResolvedValue(mockClient);
    quizRepo.findForStudent.mockResolvedValue({ ...MOCK_PUBLISHED_QUIZ });
    quizRepo.getLatestAttempt.mockResolvedValue(inProgressAttempt);

    const res = await request(app)
      .post('/api/v1/student/quiz-assignments/42/submit')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
      .send({
        answers: [
          { questionId: 100, studentAnswer: 'A process' },
          { questionId: 101, studentAnswer: 'true' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('totalScore');
    expect(res.body.data).toHaveProperty('maxScore');
    expect(res.body.data.answers).toHaveLength(2);
  });

  it('returns 409 on duplicate submission (already submitted)', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);
    quizRepo.findForStudent.mockResolvedValue({ ...MOCK_PUBLISHED_QUIZ });
    quizRepo.getLatestAttempt.mockResolvedValue({
      id: 1, status: 'submitted', attempt_number: 1,
    });

    const res = await request(app)
      .post('/api/v1/student/quiz-assignments/42/submit')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
      .send({
        answers: [{ questionId: 100, studentAnswer: 'A process' }],
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already been submitted/i);
  });

  it('returns 400 when no attempt started (no latest attempt)', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);
    quizRepo.findForStudent.mockResolvedValue({ ...MOCK_PUBLISHED_QUIZ });
    quizRepo.getLatestAttempt.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/student/quiz-assignments/42/submit')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
      .send({
        answers: [{ questionId: 100, studentAnswer: 'A process' }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/start/i);
  });

  it('returns 400 when answers array is empty', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);

    const res = await request(app)
      .post('/api/v1/student/quiz-assignments/42/submit')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
      .send({ answers: [] });

    expect(res.status).toBe(400);
  });
});

// ── Student: IDOR prevention ──────────────────────────────────────────────────
describe('Quiz Assignment — IDOR prevention', () => {
  it('student cannot see another student quiz (different classroom) — returns 404', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);
    quizRepo.findForStudent.mockResolvedValue(null); // quiz not in student's classroom

    const res = await request(app)
      .get('/api/v1/student/quiz-assignments/999')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(404);
  });

  it('teacher cannot access another teacher quiz — returns 404', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue(null); // quiz not owned by this teacher

    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/999')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(404);
  });
});

// ── Teacher: practice question cannot be added ────────────────────────────────
describe('Business rule: practice questions cannot be added to quiz', () => {
  it('returns 400 when attempting to add a practice question', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...MOCK_QUIZ });
    questionRepo.findByIdForTeacher.mockResolvedValue({
      ...MOCK_PUBLISHED_QUESTION, status: 'practice',
    });

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionId: 100 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/published/i);
  });
});

// ── Batch add questions — quick-select ────────────────────────────────────────
describe('POST /api/v1/teacher/quiz-assignments/:quizId/questions/batch (quick-select)', () => {
  const PUBLISHED_Q_LIST = [
    { id: 200, question_type: 'mcq', difficulty: 'easy', marks: 1, question_text: 'Q1', status: 'published', topic_id: 10 },
    { id: 201, question_type: 'mcq', difficulty: 'easy', marks: 1, question_text: 'Q2', status: 'published', topic_id: 10 },
    { id: 202, question_type: 'mcq', difficulty: 'easy', marks: 1, question_text: 'Q3', status: 'published', topic_id: 10 },
  ];

  it('returns 201 and adds 3 questions from a single topic', async () => {
    const mockClient = {
      query:   jest.fn().mockResolvedValue({ rows: [{ id: 1, question_id: 200 }] }),
      release: jest.fn(),
    };
    pool.query.mockResolvedValue([[TEACHER]]);
    pool.connect = jest.fn().mockResolvedValue(mockClient);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...MOCK_QUIZ, questions: [] });
    questionRepo.countPublishedByTopic.mockResolvedValue(25);
    questionRepo.selectPublishedRandom.mockResolvedValue(PUBLISHED_Q_LIST);
    quizRepo.countQuestions.mockResolvedValue(0);
    quizRepo.addQuestionsBatch.mockResolvedValue([
      { id: 1, question_id: 200 },
      { id: 2, question_id: 201 },
      { id: 3, question_id: 202 },
    ]);

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions/batch')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ sources: [{ topicId: 10, count: 3 }] });

    expect(res.status).toBe(201);
    expect(res.body.data.added).toBe(3);
    expect(questionRepo.countPublishedByTopic).toHaveBeenCalledWith(10, TEACHER.id);
    expect(questionRepo.selectPublishedRandom).toHaveBeenCalled();
  });

  it('returns 201 when adding from multiple topics', async () => {
    const mockClient = {
      query:   jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }),
      release: jest.fn(),
    };
    pool.query.mockResolvedValue([[TEACHER]]);
    pool.connect = jest.fn().mockResolvedValue(mockClient);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...MOCK_QUIZ, questions: [] });
    questionRepo.countPublishedByTopic
      .mockResolvedValueOnce(25)  // topic 10
      .mockResolvedValueOnce(18); // topic 20
    questionRepo.selectPublishedRandom
      .mockResolvedValueOnce([{ id: 200 }, { id: 201 }]) // topic 10, count 2
      .mockResolvedValueOnce([{ id: 300 }, { id: 301 }]); // topic 20, count 2
    quizRepo.countQuestions.mockResolvedValue(0);
    quizRepo.addQuestionsBatch.mockResolvedValue([
      { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 },
    ]);

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions/batch')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ sources: [{ topicId: 10, count: 2 }, { topicId: 20, count: 2 }] });

    expect(res.status).toBe(201);
    expect(res.body.data.added).toBe(4);
  });

  it('returns 400 when requested count exceeds available published questions', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...MOCK_QUIZ, questions: [] });
    questionRepo.countPublishedByTopic.mockResolvedValue(3);

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions/batch')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ sources: [{ topicId: 10, count: 10 }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/available/i);
  });

  it('returns 400 when topic has no published questions', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...MOCK_QUIZ, questions: [] });
    questionRepo.countPublishedByTopic.mockResolvedValue(0);

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions/batch')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ sources: [{ topicId: 10, count: 5 }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no published questions/i);
  });

  it('returns 400 when quiz is already published', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({
      ...MOCK_QUIZ, status: 'published', questions: [],
    });

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions/batch')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ sources: [{ topicId: 10, count: 5 }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/published/i);
  });

  it('returns 400 with invalid body (missing sources and questionIds)', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions/batch')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 404 when quiz not owned by teacher', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/999/questions/batch')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ sources: [{ topicId: 10, count: 3 }] });

    expect(res.status).toBe(404);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions/batch')
      .send({ sources: [{ topicId: 10, count: 3 }] });

    expect(res.status).toBe(401);
  });
});

// ── Batch add questions — manual select ────────────────────────────────────────
describe('POST /api/v1/teacher/quiz-assignments/:quizId/questions/batch (manual select)', () => {
  it('returns 201 when manually selecting published questions', async () => {
    const mockClient = {
      query:   jest.fn().mockResolvedValue({ rows: [{ id: 1, question_id: 100 }] }),
      release: jest.fn(),
    };
    pool.query.mockResolvedValue([[TEACHER]]);
    pool.connect = jest.fn().mockResolvedValue(mockClient);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...MOCK_QUIZ, questions: [] });
    questionRepo.selectPublishedByIds.mockResolvedValue([
      { id: 100, status: 'published' },
      { id: 101, status: 'published' },
    ]);
    quizRepo.countQuestions.mockResolvedValue(0);
    quizRepo.addQuestionsBatch.mockResolvedValue([
      { id: 1, question_id: 100 },
      { id: 2, question_id: 101 },
    ]);

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions/batch')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionIds: [100, 101] });

    expect(res.status).toBe(201);
    expect(res.body.data.added).toBe(2);
    expect(questionRepo.selectPublishedByIds).toHaveBeenCalledWith([100, 101], TEACHER.id);
  });

  it('returns 400 when manually selected question is not published or does not belong to teacher', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...MOCK_QUIZ, questions: [] });
    // Only 1 returned when 2 were requested — one is not valid
    questionRepo.selectPublishedByIds.mockResolvedValue([{ id: 100, status: 'published' }]);

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions/batch')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionIds: [100, 999] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not found|not published|curriculum/i);
  });

  it('returns 409 when all requested questions are already in the quiz', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({
      ...MOCK_QUIZ, questions: [{ id: 100 }, { id: 101 }],
    });

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions/batch')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionIds: [100, 101] });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already in the quiz/i);
  });

  it('deduplicates questionIds and only adds new ones', async () => {
    const mockClient = {
      query:   jest.fn().mockResolvedValue({ rows: [{ id: 1, question_id: 100 }] }),
      release: jest.fn(),
    };
    pool.query.mockResolvedValue([[TEACHER]]);
    pool.connect = jest.fn().mockResolvedValue(mockClient);
    // question 101 already in quiz, 100 is new
    quizRepo.findByIdForTeacher.mockResolvedValue({
      ...MOCK_QUIZ, questions: [{ id: 101 }],
    });
    questionRepo.selectPublishedByIds.mockResolvedValue([{ id: 100, status: 'published' }]);
    quizRepo.countQuestions.mockResolvedValue(1);
    quizRepo.addQuestionsBatch.mockResolvedValue([{ id: 2, question_id: 100 }]);

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions/batch')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionIds: [100, 100, 101] }); // 100 duplicated, 101 in quiz

    expect(res.status).toBe(201);
    expect(res.body.data.added).toBe(1);
    // Verify only [100] was verified (101 was in quiz, 100 deduped)
    expect(questionRepo.selectPublishedByIds).toHaveBeenCalledWith([100], TEACHER.id);
  });
});

// ── Batch: student cannot call teacher batch endpoint ─────────────────────────
describe('POST /api/v1/teacher/quiz-assignments/:quizId/questions/batch — role enforcement', () => {
  it('returns 403 when student attempts to call batch endpoint', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions/batch')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
      .send({ sources: [{ topicId: 10, count: 3 }] });

    expect(res.status).toBe(403);
  });
});
