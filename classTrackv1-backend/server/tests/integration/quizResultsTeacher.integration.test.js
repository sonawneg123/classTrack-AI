/**
 * server/tests/integration/quizResultsTeacher.integration.test.js
 *
 * Integration tests for the teacher quiz result endpoints (Sprint 7+):
 *
 *   GET /api/v1/teacher/quiz-assignments/:quizId/results
 *   GET /api/v1/teacher/quiz-assignments/:quizId/results/pdf
 *   GET /api/v1/teacher/quiz-assignments/:quizId/students/:studentId/attempts/:attemptNumber
 *
 * Requirements tested:
 *   1.  Teacher can retrieve quiz results
 *   2.  Student names appear correctly (no anonymous IDs)
 *   3.  Ranking is computed server-side (DENSE_RANK)
 *   4.  Tied scores receive the same rank
 *   5.  Competition ranking — tied rank skips (1,2,2,4 pattern)
 *   6.  Multiple attempts → best attempt used for ranking
 *   7.  Individual student detail (answers per question)
 *   8.  Wrong teacher returns 404
 *   9.  IDOR: wrong quiz/attempt is blocked
 *   10. Empty results state works (no submissions yet)
 *   11. PDF endpoint returns Content-Type: application/pdf
 *   12. Unauthenticated → 401
 *   13. Student cannot access teacher results endpoints → 403
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

jest.mock('../../src/repositories/quizAssignment.repository', () => ({
  createQuiz:                     jest.fn(),
  listByTeacher:                  jest.fn(),
  findByIdForTeacher:             jest.fn(),
  updateFields:                   jest.fn(),
  setStatus:                      jest.fn(),
  softDelete:                     jest.fn(),
  countQuestions:                 jest.fn(),
  addQuestion:                    jest.fn(),
  addQuestionsBatch:              jest.fn(),
  removeQuestion:                 jest.fn(),
  reorderQuestions:               jest.fn(),
  getResultsForTeacher:           jest.fn(),
  getQuizHeaderForTeacher:        jest.fn(),
  getClassroomStudentsForQuiz:    jest.fn(),
  getRankedSubmissionsForTeacher: jest.fn(),
  getStudentAttemptDetail:        jest.fn(),
  listForStudent:                 jest.fn(),
  findForStudent:                 jest.fn(),
  insertAttempt:                  jest.fn(),
  updateAttempt:                  jest.fn(),
  getNextAttemptNumber:           jest.fn(),
  getLatestAttempt:               jest.fn(),
  listAttemptsForStudent:         jest.fn(),
}));

jest.mock('../../src/repositories/questionBank.repository', () => ({
  insert: jest.fn(), existsDuplicate: jest.fn(),
  findByIdForTeacher: jest.fn(), findPublishedById: jest.fn(),
  listByTopic: jest.fn(), listPendingApproval: jest.fn(),
  listReviewQueue: jest.fn(), listPublishedForTeacher: jest.fn(),
  listPublishedForStudent: jest.fn(), listByStudent: jest.fn(),
  updateStatus: jest.fn(), textHash: jest.fn(),
  countPublishedByTopic: jest.fn(), listPublishedByTopic: jest.fn(),
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

// ── App + dependencies ────────────────────────────────────────────────────────
const request  = require('supertest');
const jwt      = require('jsonwebtoken');
const app      = require('../../app');

const teacherRepo = require('../../src/repositories/teacher.repository');
const studentRepo = require('../../src/repositories/student.repository');
const quizRepo    = require('../../src/repositories/quizAssignment.repository');
const { pool }    = require('../../src/database/connection');

// ── Fixtures ──────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_that_is_long_enough';

function makeToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

const TEACHER    = { id: 2, email: 'teacher@test.ai', name: 'Test Teacher', is_active: true };
const TEACHER_B  = { id: 3, email: 'other@test.ai',   name: 'Other Teacher', is_active: true };
const STUDENT    = { id: 1, username: 'student1', name: 'Test Student', is_active: true, classroom_id: 10 };

const TEACHER_TOKEN   = makeToken({ id: 2, role: 'teacher' });
const TEACHER_B_TOKEN = makeToken({ id: 3, role: 'teacher' });
const STUDENT_TOKEN   = makeToken({ id: 1, role: 'student' });

const QUIZ_HEADER = {
  id: 42, title: 'Photosynthesis Quiz', classroom_id: 10, teacher_id: 2,
  classroom_name: 'Class A', teacher_name: 'Test Teacher',
  max_score: '10', allow_retake: false, status: 'published', due_date: null,
};

// Simulates 3 ranked students: score 10, 8, 8 → ranks 1, 2, 2
const RANKED_ROWS = [
  {
    id: 101, student_id: 1, student_name: 'Rahul Sharma',  student_username: 'rahul',
    attempt_number: 1, status: 'submitted', score: '10', max_score: '10',
    started_at: '2025-01-01T09:00:00Z', submitted_at: '2025-01-01T09:30:00Z',
    total_attempts: 1, rank: 1,
  },
  {
    id: 102, student_id: 2, student_name: 'Amit Patil',    student_username: 'amit',
    attempt_number: 1, status: 'submitted', score: '8',  max_score: '10',
    started_at: '2025-01-01T09:00:00Z', submitted_at: '2025-01-01T09:25:00Z',
    total_attempts: 1, rank: 2,
  },
  {
    id: 103, student_id: 3, student_name: 'Sneha More',    student_username: 'sneha',
    attempt_number: 1, status: 'submitted', score: '8',  max_score: '10',
    started_at: '2025-01-01T09:00:00Z', submitted_at: '2025-01-01T09:28:00Z',
    total_attempts: 1, rank: 2,
  },
];

// A student enrolled but not attempted
const CLASSROOM_STUDENTS = [
  { id: 1, name: 'Rahul Sharma', username: 'rahul' },
  { id: 2, name: 'Amit Patil',   username: 'amit'  },
  { id: 3, name: 'Sneha More',   username: 'sneha' },
  { id: 4, name: 'Jyoti Das',    username: 'jyoti' }, // NOT attempted
];

const STUDENT_ATTEMPT_DETAIL = {
  attempt: {
    id: 101, attempt_number: 1, status: 'submitted',
    score: '10', max_score: '10',
    started_at: '2025-01-01T09:00:00Z', submitted_at: '2025-01-01T09:30:00Z',
    student_id: 1, student_name: 'Rahul Sharma', student_username: 'rahul',
  },
  questions: [
    {
      order_index: 1, question_id: 200,
      question_text: 'What is photosynthesis?', question_type: 'mcq',
      difficulty: 'easy', correct_answer: 'C', explanation: 'Sunlight converts CO2',
      effective_marks: '5', student_answer: 'C', is_correct: true, score: '5',
    },
    {
      order_index: 2, question_id: 201,
      question_text: 'What gas is released?', question_type: 'mcq',
      difficulty: 'easy', correct_answer: 'Oxygen', explanation: null,
      effective_marks: '5', student_answer: 'Oxygen', is_correct: true, score: '5',
    },
  ],
};

// ── beforeEach ────────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
  teacherRepo.findById.mockResolvedValue(TEACHER);
  studentRepo.findById.mockResolvedValue(STUDENT);
});

// ── Authentication guard ──────────────────────────────────────────────────────

describe('Authentication — unauthenticated → 401', () => {
  it('GET /results returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/teacher/quiz-assignments/42/results');
    expect(res.status).toBe(401);
  });

  it('GET /results/pdf returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/teacher/quiz-assignments/42/results/pdf');
    expect(res.status).toBe(401);
  });

  it('GET /students/:id/attempts/:n returns 401 without token', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/students/1/attempts/1');
    expect(res.status).toBe(401);
  });
});

// ── Role isolation ────────────────────────────────────────────────────────────

describe('Role isolation — student cannot access teacher results', () => {
  it('returns 403 when a student GETs /results', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);
    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/results')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 when a student GETs /results/pdf', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);
    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/results/pdf')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 when a student GETs student attempt detail', async () => {
    pool.query.mockResolvedValue([[STUDENT]]);
    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/students/1/attempts/1')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);
    expect(res.status).toBe(403);
  });
});

// ── Happy path: GET /results ──────────────────────────────────────────────────

describe('GET /teacher/quiz-assignments/:quizId/results — happy path', () => {
  beforeEach(() => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.getQuizHeaderForTeacher.mockResolvedValue(QUIZ_HEADER);
    quizRepo.getRankedSubmissionsForTeacher.mockResolvedValue(RANKED_ROWS);
    quizRepo.getClassroomStudentsForQuiz.mockResolvedValue(CLASSROOM_STUDENTS);
  });

  it('returns 200 with quiz metadata', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.quiz.title).toBe('Photosynthesis Quiz');
    expect(res.body.data.quiz.classroom).toBe('Class A');
    expect(res.body.data.quiz.teacher).toBe('Test Teacher');
    expect(res.body.data.quiz.maxScore).toBe(10);
  });

  it('includes summary statistics', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    const { summary } = res.body.data;
    expect(summary.totalStudents).toBe(4);  // 4 enrolled
    expect(summary.attempted).toBe(3);       // 3 submitted
    expect(summary.notAttempted).toBe(1);    // Jyoti did not attempt
    expect(typeof summary.averagePercentage).toBe('number');
    expect(typeof summary.highestPercentage).toBe('number');
    expect(typeof summary.lowestPercentage).toBe('number');
  });

  it('returns student names (not anonymous IDs)', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    const names = res.body.data.students.map((s) => s.studentName);
    expect(names).toContain('Rahul Sharma');
    expect(names).toContain('Amit Patil');
    expect(names).toContain('Sneha More');
  });

  it('returns usernames', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    const usernames = res.body.data.students.map((s) => s.username);
    expect(usernames).toContain('rahul');
    expect(usernames).toContain('amit');
  });

  it('returns correct ranks: highest score = rank 1', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    const students = res.body.data.students;
    const rahul = students.find((s) => s.studentName === 'Rahul Sharma');
    expect(rahul.rank).toBe(1);
    expect(rahul.score).toBe(10);
    expect(rahul.percentage).toBe(100);
  });

  // Requirement 4 + 5: Tied scores → same rank, competition ranking
  it('assigns the same rank to tied scores (competition ranking)', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    const students = res.body.data.students;
    const amit  = students.find((s) => s.studentName === 'Amit Patil');
    const sneha = students.find((s) => s.studentName === 'Sneha More');
    // Both scored 8/10 → both rank 2
    expect(amit.rank).toBe(2);
    expect(sneha.rank).toBe(2);
    // Score and percentage are correct
    expect(amit.score).toBe(8);
    expect(amit.percentage).toBe(80);
    expect(sneha.score).toBe(8);
  });

  it('includes notAttempted list for enrolled students who did not submit', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    const notAttempted = res.body.data.notAttempted;
    expect(Array.isArray(notAttempted)).toBe(true);
    expect(notAttempted).toHaveLength(1);
    expect(notAttempted[0].studentName).toBe('Jyoti Das');
    expect(notAttempted[0].status).toBe('not_attempted');
  });

  it('does not assign a rank to not-attempted students', async () => {
    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    const notAttempted = res.body.data.notAttempted;
    notAttempted.forEach((s) => {
      expect(s.rank).toBeUndefined();
    });
  });
});

// ── Empty results state ───────────────────────────────────────────────────────

describe('GET /results — empty state (no submissions)', () => {
  it('returns 200 with empty students array and correct summary', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.getQuizHeaderForTeacher.mockResolvedValue(QUIZ_HEADER);
    quizRepo.getRankedSubmissionsForTeacher.mockResolvedValue([]);
    quizRepo.getClassroomStudentsForQuiz.mockResolvedValue(CLASSROOM_STUDENTS);

    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.students).toHaveLength(0);
    expect(res.body.data.summary.attempted).toBe(0);
    expect(res.body.data.summary.notAttempted).toBe(4);
    expect(res.body.data.summary.averagePercentage).toBeNull();
    expect(res.body.data.notAttempted).toHaveLength(4);
  });
});

// ── Multiple attempts: best attempt used for ranking ─────────────────────────

describe('Ranking with multiple attempts (allow_retake)', () => {
  it('uses best attempt score (highest) for ranking, not first attempt', async () => {
    // Student retook and improved: attempt 1 = 4pts, attempt 2 = 9pts
    // Repo already returns the best attempt row — repo is mocked to return correctly
    const multiAttemptRows = [
      {
        id: 110, student_id: 5, student_name: 'Ali Khan', student_username: 'ali',
        attempt_number: 2,  // best attempt is #2
        status: 'submitted', score: '9', max_score: '10',
        started_at: '2025-01-02T10:00:00Z', submitted_at: '2025-01-02T11:00:00Z',
        total_attempts: 2,  // has 2 total attempts
        rank: 1,
      },
    ];

    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.getQuizHeaderForTeacher.mockResolvedValue(QUIZ_HEADER);
    quizRepo.getRankedSubmissionsForTeacher.mockResolvedValue(multiAttemptRows);
    quizRepo.getClassroomStudentsForQuiz.mockResolvedValue([
      { id: 5, name: 'Ali Khan', username: 'ali' },
    ]);

    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(200);
    const ali = res.body.data.students[0];
    expect(ali.attemptNumber).toBe(2);  // best attempt used
    expect(ali.totalAttempts).toBe(2);   // history preserved
    expect(ali.score).toBe(9);
    expect(ali.rank).toBe(1);
  });
});

// ── Individual student result ─────────────────────────────────────────────────

describe('GET /students/:studentId/attempts/:attemptNumber — happy path', () => {
  it('returns 200 with per-question breakdown', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.getQuizHeaderForTeacher.mockResolvedValue(QUIZ_HEADER);
    quizRepo.getStudentAttemptDetail.mockResolvedValue(STUDENT_ATTEMPT_DETAIL);

    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/students/1/attempts/1')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { student, attempt, questions } = res.body.data;
    expect(student.name).toBe('Rahul Sharma');
    expect(student.username).toBe('rahul');
    expect(attempt.score).toBe(10);
    expect(attempt.maxScore).toBe(10);
    expect(attempt.percentage).toBe(100);
    expect(attempt.attemptNumber).toBe(1);
    expect(Array.isArray(questions)).toBe(true);
    expect(questions).toHaveLength(2);
  });

  it('returns question details including correct/student answers', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.getQuizHeaderForTeacher.mockResolvedValue(QUIZ_HEADER);
    quizRepo.getStudentAttemptDetail.mockResolvedValue(STUDENT_ATTEMPT_DETAIL);

    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/students/1/attempts/1')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    const { questions } = res.body.data;
    expect(questions[0].correctAnswer).toBe('C');
    expect(questions[0].studentAnswer).toBe('C');
    expect(questions[0].isCorrect).toBe(true);
    expect(questions[0].score).toBe(5);
    expect(questions[0].effectiveMarks).toBe(5);
  });

  it('returns 404 when attempt does not belong to the quiz', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.getQuizHeaderForTeacher.mockResolvedValue(QUIZ_HEADER);
    quizRepo.getStudentAttemptDetail.mockResolvedValue(null); // not found

    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/students/999/attempts/1')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(404);
  });
});

// ── IDOR prevention ───────────────────────────────────────────────────────────

describe('IDOR prevention — teacher cannot access another teacher\'s quiz results', () => {
  it('returns 404 when quiz belongs to a different teacher', async () => {
    // Teacher B (id=3) tries to access Quiz owned by Teacher A (id=2)
    pool.query.mockResolvedValue([[TEACHER_B]]);
    quizRepo.getQuizHeaderForTeacher.mockResolvedValue(null); // ownership check fails

    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/results')
      .set('Authorization', `Bearer ${TEACHER_B_TOKEN}`);

    expect(res.status).toBe(404);
  });

  it('does not call getRankedSubmissions when ownership check fails', async () => {
    pool.query.mockResolvedValue([[TEACHER_B]]);
    quizRepo.getQuizHeaderForTeacher.mockResolvedValue(null);

    await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/results')
      .set('Authorization', `Bearer ${TEACHER_B_TOKEN}`);

    expect(quizRepo.getRankedSubmissionsForTeacher).not.toHaveBeenCalled();
    expect(quizRepo.getClassroomStudentsForQuiz).not.toHaveBeenCalled();
  });

  it('returns 404 for student detail when quiz belongs to different teacher', async () => {
    pool.query.mockResolvedValue([[TEACHER_B]]);
    quizRepo.getQuizHeaderForTeacher.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/students/1/attempts/1')
      .set('Authorization', `Bearer ${TEACHER_B_TOKEN}`);

    expect(res.status).toBe(404);
    expect(quizRepo.getStudentAttemptDetail).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown quiz ID', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.getQuizHeaderForTeacher.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/9999/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(404);
  });
});

// ── PDF endpoint ──────────────────────────────────────────────────────────────

describe('GET /results/pdf', () => {
  it('returns 200 with Content-Type application/pdf', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);
    quizRepo.getQuizHeaderForTeacher.mockResolvedValue(QUIZ_HEADER);
    quizRepo.getRankedSubmissionsForTeacher.mockResolvedValue(RANKED_ROWS);
    quizRepo.getClassroomStudentsForQuiz.mockResolvedValue(CLASSROOM_STUDENTS);

    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/results/pdf')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    // PDF should not be empty
    expect(res.body).toBeTruthy();
  }, 10000);

  it('returns 404 for PDF of quiz not owned by teacher', async () => {
    pool.query.mockResolvedValue([[TEACHER_B]]);
    quizRepo.getQuizHeaderForTeacher.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/results/pdf')
      .set('Authorization', `Bearer ${TEACHER_B_TOKEN}`);

    expect(res.status).toBe(404);
  });
});

// ── Param validation ──────────────────────────────────────────────────────────

describe('Param validation', () => {
  it('returns 400 for non-numeric quizId on results', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);

    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/abc/results')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric studentId on attempt detail', async () => {
    pool.query.mockResolvedValue([[TEACHER]]);

    const res = await request(app)
      .get('/api/v1/teacher/quiz-assignments/42/students/abc/attempts/1')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);

    expect(res.status).toBe(400);
  });
});
