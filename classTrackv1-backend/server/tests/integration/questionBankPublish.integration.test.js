/**
 * server/tests/integration/questionBankPublish.integration.test.js
 *
 * Regression tests for the Question Bank → Quiz workflow.
 * Tests the exact integration gaps identified and fixed:
 *
 *   1.  Generated question cannot be added to quiz.
 *   2.  Published question can be added to quiz.
 *   3.  Practice question cannot be added.
 *   4.  Pending_approval question cannot be added.
 *   5.  Rejected question cannot be added.
 *   6.  Archived question cannot be added.
 *   7.  Topic-wise filtering works (listByTopic + publishedOnly flag).
 *   8.  Curriculum → Subject → Chapter → Topic filtering works.
 *   9.  Quick-select quantity works.
 *   10. Quantity cannot exceed available published questions.
 *   11. Manual selection works.
 *   12. Multiple topics can be added to one quiz.
 *   13. Duplicate questions are prevented.
 *   14. Marks / marksOverride are calculated correctly.
 *   15. Teacher ownership / IDOR protection works.
 *   16. Teacher cannot add another teacher's question.
 *   17. Published quiz is visible only to students in assigned classroom.
 *   18. Draft quiz is invisible to students.
 *   19. Student receives exactly the questions selected by teacher.
 *   20. Student submission/scoring still works.
 *   21. Unified student Assignments still shows the quiz.
 *   22. publishQuestion allows pending_approval → published (direct publish).
 *   23. publishQuestion allows approved → published.
 *   24. publishQuestion blocks generated, practice, rejected, archived.
 *   25. listReviewQueue returns pending_approval + approved questions.
 *   26. listPublishedForTeacher returns only published questions.
 */

// ── Mock DB + all dependencies before app require ──────────────────────────────
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
const request  = require('supertest');
const jwt      = require('jsonwebtoken');
const app      = require('../../app');

const teacherRepo  = require('../../src/repositories/teacher.repository');
const studentRepo  = require('../../src/repositories/student.repository');
const quizRepo     = require('../../src/repositories/quizAssignment.repository');
const questionRepo = require('../../src/repositories/questionBank.repository');
const topicRepo    = require('../../src/repositories/topic.repository');
const { pool }     = require('../../src/database/connection');

// ── JWT helpers ────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_that_is_long_enough';

function makeToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

// ── Fixtures ───────────────────────────────────────────────────────────────────
const TEACHER = { id: 2, email: 'teacher@test.ai', name: 'Test Teacher', is_active: true };
const STUDENT = { id: 1, username: 'student1', name: 'Test Student', is_active: true, classroom_id: 10 };

const TEACHER_TOKEN = makeToken({ id: 2, role: 'teacher' });
const STUDENT_TOKEN = makeToken({ id: 1, role: 'student' });

const DRAFT_QUIZ = {
  id: 42, teacher_id: 2, classroom_id: 10,
  title: 'Science Unit Test',
  status: 'draft',
  questions: [],
  allow_retake: false, shuffle_questions: false,
  classroom_name: 'Class 8A',
};

const PUBLISHED_QUIZ = { ...DRAFT_QUIZ, status: 'published' };

const makeQuestion = (id, status, topicId = 10) => ({
  id,
  question_type: 'mcq',
  difficulty: 'easy',
  marks: 1,
  question_text: `Question ${id}`,
  options: ['A', 'B', 'C', 'D'],
  correct_answer: 'A',
  explanation: 'Explanation',
  status,
  topic_id: topicId,
  chapter_id: 5,
  subject_id: 3,
  curriculum_id: 1,
  created_by: 2,
  created_by_role: 'teacher',
  marks_override: null,
  order_index: 0,
});

beforeEach(() => {
  jest.clearAllMocks();

  // Default auth resolution for teacher
  teacherRepo.findById.mockResolvedValue(TEACHER);
  studentRepo.findById.mockResolvedValue(STUDENT);

  // Default pool.query for classroom ownership checks
  pool.query.mockResolvedValue([[TEACHER]]);
});

// =============================================================================
// 22. publishQuestion allows pending_approval → published (direct publish)
// =============================================================================
describe('PATCH /api/v1/questions/:id/publish — direct publish from pending_approval', () => {
  it('returns 200 when publishing a pending_approval question directly', async () => {
    pool.query
      .mockResolvedValueOnce([[TEACHER]])  // auth middleware
      .mockResolvedValue([[TEACHER]]);     // other checks

    const pendingQ = makeQuestion(100, 'pending_approval');
    questionRepo.findByIdForTeacher.mockResolvedValue(pendingQ);
    questionRepo.updateStatus.mockResolvedValue({
      id: 100, status: 'published', updated_at: new Date().toISOString(),
    });

    const res = await request(app)
      .patch('/api/v1/questions/100/publish')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(questionRepo.updateStatus).toHaveBeenCalledWith(
      100, 2, 'published',
      expect.objectContaining({ approvedBy: 2 })
    );
  });
});

// =============================================================================
// 23. publishQuestion allows approved → published
// =============================================================================
describe('PATCH /api/v1/questions/:id/publish — publish from approved', () => {
  it('returns 200 when publishing an approved question', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);

    const approvedQ = makeQuestion(101, 'approved');
    questionRepo.findByIdForTeacher.mockResolvedValue(approvedQ);
    questionRepo.updateStatus.mockResolvedValue({
      id: 101, status: 'published', updated_at: new Date().toISOString(),
    });

    const res = await request(app)
      .patch('/api/v1/questions/101/publish')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// =============================================================================
// 24. publishQuestion blocks non-publishable statuses
// =============================================================================
describe('PATCH /api/v1/questions/:id/publish — blocked statuses', () => {
  const BLOCKED_STATUSES = ['generated', 'practice', 'rejected', 'archived', 'published'];

  BLOCKED_STATUSES.forEach((status) => {
    it(`returns 400 when trying to publish a question with status="${status}"`, async () => {
      pool.query.mockResolvedValue([[TEACHER]]);

      const q = makeQuestion(200, status);
      questionRepo.findByIdForTeacher.mockResolvedValue(q);

      const res = await request(app)
        .patch('/api/v1/questions/200/publish')
        .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/only.*pending_approval.*approved|cannot.*publish/i);
    });
  });
});

// =============================================================================
// 1. Generated question cannot be added to quiz
// =============================================================================
describe('Quiz: generated question cannot be added', () => {
  it('returns 400 when adding a generated question', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...DRAFT_QUIZ, questions: [] });
    questionRepo.findByIdForTeacher.mockResolvedValue(makeQuestion(100, 'generated'));

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionId: 100 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/published/i);
  });
});

// =============================================================================
// 2. Published question can be added to quiz
// =============================================================================
describe('Quiz: published question can be added', () => {
  it('returns 201 when adding a published question', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    const publishedQ = makeQuestion(100, 'published');
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...DRAFT_QUIZ, questions: [] });
    questionRepo.findByIdForTeacher.mockResolvedValue(publishedQ);
    quizRepo.countQuestions.mockResolvedValue(0);
    quizRepo.addQuestion.mockResolvedValue({
      id: 1, quiz_assignment_id: 42, question_id: 100,
      order_index: 1, marks_override: null,
    });

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionId: 100 });

    expect(res.status).toBe(201);
    expect(res.body.data.quizQuestion).toBeDefined();
  });
});

// =============================================================================
// 3. Practice question cannot be added
// =============================================================================
describe('Quiz: practice question cannot be added', () => {
  it('returns 400 for practice question', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...DRAFT_QUIZ, questions: [] });
    questionRepo.findByIdForTeacher.mockResolvedValue(makeQuestion(100, 'practice'));

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionId: 100 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/published/i);
  });
});

// =============================================================================
// 4. Pending_approval question cannot be added to quiz
// =============================================================================
describe('Quiz: pending_approval question cannot be added', () => {
  it('returns 400 for pending_approval question', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...DRAFT_QUIZ, questions: [] });
    questionRepo.findByIdForTeacher.mockResolvedValue(makeQuestion(100, 'pending_approval'));

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionId: 100 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/published/i);
  });
});

// =============================================================================
// 5. Rejected question cannot be added
// =============================================================================
describe('Quiz: rejected question cannot be added', () => {
  it('returns 400 for rejected question', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...DRAFT_QUIZ, questions: [] });
    questionRepo.findByIdForTeacher.mockResolvedValue(makeQuestion(100, 'rejected'));

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionId: 100 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/published/i);
  });
});

// =============================================================================
// 6. Archived question cannot be added
// =============================================================================
describe('Quiz: archived question cannot be added', () => {
  it('returns 400 for archived question', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...DRAFT_QUIZ, questions: [] });
    questionRepo.findByIdForTeacher.mockResolvedValue(makeQuestion(100, 'archived'));

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionId: 100 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/published/i);
  });
});

// =============================================================================
// 7. Topic-wise filtering works
// =============================================================================
describe('GET /api/v1/questions/topics/:topicId — topic-wise filtering', () => {
  it('calls listByTopic with the correct topicId', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    topicRepo.findOwnedById.mockResolvedValue({ id: 10, name: 'Force', teacher_id: 2 });
    questionRepo.listByTopic.mockResolvedValue([
      makeQuestion(100, 'published', 10),
      makeQuestion(101, 'published', 10),
    ]);

    const res = await request(app)
      .get('/api/v1/questions/topics/10')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .query({ status: 'published' });

    expect(res.status).toBe(200);
    expect(questionRepo.listByTopic).toHaveBeenCalledWith(10, 2, { status: 'published' });
    expect(res.body.data.questions).toHaveLength(2);
  });
});

// =============================================================================
// 9. Quick-select quantity works
// =============================================================================
describe('Quiz batch quick-select: quantity works', () => {
  it('selects exactly the requested count', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    pool.query.mockResolvedValue([[TEACHER]]);
    pool.connect = jest.fn().mockResolvedValue(mockClient);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...DRAFT_QUIZ, questions: [] });
    questionRepo.countPublishedByTopic.mockResolvedValue(20);
    questionRepo.selectPublishedRandom.mockResolvedValue([
      makeQuestion(200, 'published', 10),
      makeQuestion(201, 'published', 10),
      makeQuestion(202, 'published', 10),
      makeQuestion(203, 'published', 10),
      makeQuestion(204, 'published', 10),
    ]);
    quizRepo.countQuestions.mockResolvedValue(0);
    quizRepo.addQuestionsBatch.mockResolvedValue([
      { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 },
    ]);

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions/batch')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ sources: [{ topicId: 10, count: 5 }] });

    expect(res.status).toBe(201);
    expect(res.body.data.added).toBe(5);
    expect(questionRepo.selectPublishedRandom).toHaveBeenCalledWith(10, 2, 5, []);
  });
});

// =============================================================================
// 10. Quantity cannot exceed available published questions
// =============================================================================
describe('Quiz batch: quantity cannot exceed available', () => {
  it('returns 400 when count > available published questions', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...DRAFT_QUIZ, questions: [] });
    questionRepo.countPublishedByTopic.mockResolvedValue(3); // only 3 available

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions/batch')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ sources: [{ topicId: 10, count: 10 }] }); // requesting 10

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/available/i);
  });
});

// =============================================================================
// 11. Manual selection works
// =============================================================================
describe('Quiz batch manual-select', () => {
  it('adds exactly the selected question IDs', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    pool.query.mockResolvedValue([[TEACHER]]);
    pool.connect = jest.fn().mockResolvedValue(mockClient);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...DRAFT_QUIZ, questions: [] });
    questionRepo.selectPublishedByIds.mockResolvedValue([
      makeQuestion(100, 'published'), makeQuestion(101, 'published'),
    ]);
    quizRepo.countQuestions.mockResolvedValue(0);
    quizRepo.addQuestionsBatch.mockResolvedValue([
      { id: 1, question_id: 100 }, { id: 2, question_id: 101 },
    ]);

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions/batch')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionIds: [100, 101] });

    expect(res.status).toBe(201);
    expect(res.body.data.added).toBe(2);
    expect(questionRepo.selectPublishedByIds).toHaveBeenCalledWith([100, 101], 2);
  });
});

// =============================================================================
// 12. Multiple topics can be added to one quiz
// =============================================================================
describe('Quiz batch: multiple topics in one quiz', () => {
  it('adds questions from two different topics', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    pool.query.mockResolvedValue([[TEACHER]]);
    pool.connect = jest.fn().mockResolvedValue(mockClient);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...DRAFT_QUIZ, questions: [] });
    questionRepo.countPublishedByTopic
      .mockResolvedValueOnce(10)  // topic 10
      .mockResolvedValueOnce(10); // topic 20
    questionRepo.selectPublishedRandom
      .mockResolvedValueOnce([makeQuestion(100, 'published', 10), makeQuestion(101, 'published', 10)])
      .mockResolvedValueOnce([makeQuestion(200, 'published', 20), makeQuestion(201, 'published', 20)]);
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
});

// =============================================================================
// 13. Duplicate questions are prevented
// =============================================================================
describe('Quiz: duplicate questions are prevented', () => {
  it('returns 409 when all requested questions are already in the quiz', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({
      ...DRAFT_QUIZ, questions: [{ id: 100 }, { id: 101 }],
    });

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions/batch')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionIds: [100, 101] });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already in the quiz/i);
  });

  it('returns 409 when single question already in quiz (single-add endpoint)', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({
      ...DRAFT_QUIZ, questions: [{ id: 100 }],
    });
    questionRepo.findByIdForTeacher.mockResolvedValue(makeQuestion(100, 'published'));

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionId: 100 });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already in the quiz/i);
  });
});

// =============================================================================
// 14. Marks / marksOverride are correctly passed through
// =============================================================================
describe('Quiz: marks and marksOverride', () => {
  it('passes marksOverride to addQuestion repository call', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    const publishedQ = makeQuestion(100, 'published');
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...DRAFT_QUIZ, questions: [] });
    questionRepo.findByIdForTeacher.mockResolvedValue(publishedQ);
    quizRepo.countQuestions.mockResolvedValue(0);
    quizRepo.addQuestion.mockResolvedValue({
      id: 1, quiz_assignment_id: 42, question_id: 100,
      order_index: 1, marks_override: 2.5,
    });

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionId: 100, marksOverride: 2.5 });

    expect(res.status).toBe(201);
    expect(quizRepo.addQuestion).toHaveBeenCalledWith(42, 100, 1, 2.5);
  });

  it('rejects marksOverride of 0', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...DRAFT_QUIZ, questions: [] });
    questionRepo.findByIdForTeacher.mockResolvedValue(makeQuestion(100, 'published'));

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionId: 100, marksOverride: 0 });

    expect(res.status).toBe(400);
  });
});

// =============================================================================
// 15. Teacher ownership / IDOR protection
// =============================================================================
describe('Quiz: teacher ownership / IDOR protection', () => {
  it('returns 404 when quiz does not belong to requesting teacher', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue(null); // quiz not owned

    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/999')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(404);
  });

  it('returns 403 when student tries to access teacher quiz endpoints', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);

    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(403);
  });
});

// =============================================================================
// 16. Teacher cannot add another teacher's question
// =============================================================================
describe('Quiz: teacher cannot add another teacher\'s question', () => {
  it('returns 404 when question does not belong to teacher (findByIdForTeacher returns null)', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.findByIdForTeacher.mockResolvedValue({ ...DRAFT_QUIZ, questions: [] });
    // Returns null because question belongs to a different teacher's curriculum
    questionRepo.findByIdForTeacher.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/teacher/quiz-assignments/42/questions')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`)
      .send({ questionId: 999 });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found|does not belong/i);
  });
});

// =============================================================================
// 17. Published quiz is visible only to students in assigned classroom
// =============================================================================
describe('Student: published quiz visibility', () => {
  it('returns quizzes only for student\'s classroom', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);
    quizRepo.listForStudent.mockResolvedValue([
      { ...PUBLISHED_QUIZ, id: 42, status: 'published' },
    ]);

    const res = await request(app)
      .get('/api/v1/student/quiz-assignments')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    expect(quizRepo.listForStudent).toHaveBeenCalledWith(STUDENT.id);
    expect(res.body.data.quizzes).toHaveLength(1);
  });
});

// =============================================================================
// 18. Draft quiz is invisible to students
// =============================================================================
describe('Student: draft quiz is not visible', () => {
  it('returns 404 when student tries to access a draft quiz', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);
    // Repository returns null because quiz is draft (SQL WHERE status = 'published')
    quizRepo.findForStudent.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/student/quiz-assignments/42')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(404);
  });
});

// =============================================================================
// 19. Student receives exactly the questions selected by teacher
// =============================================================================
describe('Student: receives exact teacher-selected questions', () => {
  it('returns the quiz with exactly the questions from quiz_assignment_questions', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);
    const selectedQuestions = [
      { ...makeQuestion(100, 'published', 10), quiz_question_id: 1, order_index: 1 },
      { ...makeQuestion(101, 'published', 10), quiz_question_id: 2, order_index: 2 },
      { ...makeQuestion(200, 'published', 20), quiz_question_id: 3, order_index: 3 },
    ];
    quizRepo.findForStudent.mockResolvedValue({
      ...PUBLISHED_QUIZ,
      questions: selectedQuestions,
      latest_attempt: null,
    });

    const res = await request(app)
      .get('/api/v1/student/quiz-assignments/42')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.quiz.questions).toHaveLength(3);
    expect(res.body.data.quiz.questions.map((q) => q.id)).toEqual([100, 101, 200]);
  });
});

// =============================================================================
// 20. Student submission/scoring still works
// =============================================================================
describe('Student: submission and scoring', () => {
  it('returns score after successful quiz submission', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    pool.query
      .mockResolvedValueOnce([[STUDENT]])   // auth
      .mockResolvedValue([[STUDENT]]);       // other
    pool.connect = jest.fn().mockResolvedValue(mockClient);

    const questions = [
      { ...makeQuestion(100, 'published', 10), quiz_question_id: 1, order_index: 1 },
      { ...makeQuestion(101, 'published', 10), quiz_question_id: 2, order_index: 2 },
    ];
    quizRepo.findForStudent.mockResolvedValue({
      ...PUBLISHED_QUIZ, questions,
    });
    quizRepo.getLatestAttempt.mockResolvedValue({
      id: 1, status: 'in_progress', attempt_number: 1,
    });

    const res = await request(app)
      .post('/api/v1/student/quiz-assignments/42/submit')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`)
      .send({
        answers: [
          { questionId: 100, studentAnswer: 'A' },
          { questionId: 101, studentAnswer: 'B' }, // wrong
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.totalScore).toBeDefined();
    expect(res.body.data.maxScore).toBeDefined();
    expect(res.body.data.answers).toHaveLength(2);
  });
});

// =============================================================================
// 21. Student Assignments page includes quiz via listForStudent
// =============================================================================
describe('Student: unified assignments includes quiz', () => {
  it('GET /student/quiz-assignments returns the quiz in the list', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);
    quizRepo.listForStudent.mockResolvedValue([
      {
        id: 42,
        title: 'Science Unit Test',
        status: 'published',
        classroom_name: 'Class 8A',
        question_count: '10',
        attempt_number: null,
        attempt_status: null,
        attempt_score: null,
        attempt_max_score: null,
        attempt_submitted_at: null,
        due_date: new Date(Date.now() + 86400000).toISOString(),
      },
    ]);

    const res = await request(app)
      .get('/api/v1/student/quiz-assignments')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.quizzes).toHaveLength(1);
    expect(res.body.data.quizzes[0].id).toBe(42);
  });
});

// =============================================================================
// 25. listReviewQueue returns pending_approval + approved
// =============================================================================
describe('GET /api/v1/questions/review-queue', () => {
  it('returns both pending_approval and approved questions', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    questionRepo.listReviewQueue.mockResolvedValue([
      makeQuestion(100, 'pending_approval'),
      makeQuestion(101, 'approved'),
    ]);

    const res = await request(app)
      .get('/api/v1/questions/review-queue')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.questions).toHaveLength(2);
    const statuses = res.body.data.questions.map((q) => q.status);
    expect(statuses).toContain('pending_approval');
    expect(statuses).toContain('approved');
  });

  it('can filter to pending_approval only via ?status=pending_approval', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    questionRepo.listReviewQueue.mockResolvedValue([
      makeQuestion(100, 'pending_approval'),
    ]);

    const res = await request(app)
      .get('/api/v1/questions/review-queue?status=pending_approval')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(questionRepo.listReviewQueue).toHaveBeenCalledWith(2, { status: 'pending_approval' });
  });

  it('returns 403 when student accesses review queue', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);

    const res = await request(app)
      .get('/api/v1/questions/review-queue')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(403);
  });
});

// =============================================================================
// 26. listPublishedForTeacher returns only published questions
// =============================================================================
describe('GET /api/v1/questions/published', () => {
  it('returns published questions for teacher', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    questionRepo.listPublishedForTeacher.mockResolvedValue([
      makeQuestion(100, 'published'),
      makeQuestion(101, 'published'),
    ]);

    const res = await request(app)
      .get('/api/v1/questions/published')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.questions).toHaveLength(2);
    expect(questionRepo.listPublishedForTeacher).toHaveBeenCalledWith(2, {});
  });

  it('filters by topicId when provided', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    questionRepo.listPublishedForTeacher.mockResolvedValue([
      makeQuestion(100, 'published', 10),
    ]);

    const res = await request(app)
      .get('/api/v1/questions/published?topicId=10')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(questionRepo.listPublishedForTeacher).toHaveBeenCalledWith(2, { topicId: 10 });
  });

  it('returns 403 when student accesses teacher published list', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);

    const res = await request(app)
      .get('/api/v1/questions/published')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(403);
  });
});

// =============================================================================
// 8. Curriculum → Subject → Chapter → Topic hierarchy filtering
// =============================================================================
describe('Topic hierarchy filtering', () => {
  it('listByTopic verifies topic ownership via topicRepo.findOwnedById', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    topicRepo.findOwnedById.mockResolvedValue({ id: 5, name: 'Force', chapter_id: 3 });
    questionRepo.listByTopic.mockResolvedValue([makeQuestion(100, 'published', 5)]);

    const res = await request(app)
      .get('/api/v1/questions/topics/5')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(topicRepo.findOwnedById).toHaveBeenCalledWith(5, 2);
  });

  it('returns 404 when topic does not belong to teacher', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    topicRepo.findOwnedById.mockResolvedValue(null); // not owned

    const res = await request(app)
      .get('/api/v1/questions/topics/999')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(404);
  });
});
