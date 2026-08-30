/**
 * server/tests/integration/studentKnowledgeRoutes.integration.test.js
 *
 * Integration tests for the student read-only knowledge hierarchy endpoints:
 *
 *   GET /api/v1/student/knowledge/curricula
 *   GET /api/v1/student/knowledge/curricula/:curriculumId/subjects
 *   GET /api/v1/student/knowledge/subjects/:subjectId/chapters
 *   GET /api/v1/student/knowledge/chapters/:chapterId/topics
 *
 * Security invariants tested:
 *   1.  Unauthenticated → 401
 *   2.  Teacher token → 403 (student-only routes)
 *   3.  Student with no classroom → 404
 *   4.  Student can list curricula belonging to their classroom's teacher
 *   5.  Student cannot browse another teacher's curriculum (IDOR)
 *   6.  Subject listing scope-checks curriculum ownership
 *   7.  Chapter listing scope-checks subject ownership
 *   8.  Topic listing scope-checks chapter ownership
 *   9.  Student sees hierarchical data correctly
 *   10. Routes are registered (not 404 on path)
 */

// ── Database mock ────────────────────────────────────────────────────────────
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

// ── Knowledge repository mocks ────────────────────────────────────────────────
jest.mock('../../src/repositories/curriculum.repository', () => ({
  listByTeacher:    jest.fn(),
  findOwnedById:    jest.fn(),
  createForTeacher: jest.fn(),
  updateOwned:      jest.fn(),
  softDeleteOwned:  jest.fn(),
  hardDeleteOwned:  jest.fn(),
}));
jest.mock('../../src/repositories/subject.repository', () => ({
  listByCurriculum: jest.fn(),
  findOwnedById:    jest.fn(),
  create:           jest.fn(),
  softDeleteOwned:  jest.fn(),
  hardDeleteOwned:  jest.fn(),
}));
jest.mock('../../src/repositories/chapter.repository', () => ({
  listBySubject: jest.fn(),
  findOwnedById: jest.fn(),
  create:        jest.fn(),
  softDeleteOwned: jest.fn(),
  hardDeleteOwned: jest.fn(),
}));
jest.mock('../../src/repositories/topic.repository', () => ({
  listByChapter: jest.fn(),
  findOwnedById: jest.fn(),
  create:        jest.fn(),
  softDeleteOwned: jest.fn(),
  hardDeleteOwned: jest.fn(),
}));

// ── Unused service mocks (pulled in by other routes in the app) ───────────────
jest.mock('../../src/services/knowledge/retrieval.service', () => ({ search: jest.fn() }));
jest.mock('../../src/services/ai/providers', () => ({ getLLMProvider: jest.fn() }));
jest.mock('../../src/repositories/quizAssignment.repository', () => ({
  createQuiz: jest.fn(), listByTeacher: jest.fn(), findByIdForTeacher: jest.fn(),
  updateFields: jest.fn(), setStatus: jest.fn(), softDelete: jest.fn(),
  countQuestions: jest.fn(), addQuestion: jest.fn(), removeQuestion: jest.fn(),
  listQuestions: jest.fn(), reorderQuestions: jest.fn(),
  listForStudent: jest.fn(), findForStudent: jest.fn(),
  insertAttempt: jest.fn(), getLatestAttempt: jest.fn(), getNextAttemptNumber: jest.fn(),
  getQuizHeaderForTeacher: jest.fn(), getRankedSubmissionsForTeacher: jest.fn(),
  getClassroomStudentsForQuiz: jest.fn(), getStudentAttemptDetail: jest.fn(),
  listByTopic: jest.fn(),
}));
jest.mock('../../src/repositories/quizAttempt.repository', () => ({
  upsert: jest.fn(), findByStudentAndQuestion: jest.fn(), listByStudent: jest.fn(),
  countByStudentAndTopic: jest.fn(), listByTopicForTeacher: jest.fn(),
  listByQuestionForTeacher: jest.fn(),
}));
jest.mock('../../src/repositories/questionBank.repository', () => ({
  insert: jest.fn(), existsDuplicate: jest.fn(),
  findByIdForTeacher: jest.fn(), findPublishedById: jest.fn(),
  listByTopic: jest.fn(), listPendingApproval: jest.fn(),
  listReviewQueue: jest.fn(), listPublishedForTeacher: jest.fn(),
  listPublishedForStudent: jest.fn(), listByStudent: jest.fn(),
  updateStatus: jest.fn(), textHash: jest.fn(),
  listPracticeByStudent: jest.fn(), findPracticeByIdForStudent: jest.fn(),
}));

// ── Load app ───────────────────────────────────────────────────────────────────
const request      = require('supertest');
const jwt          = require('jsonwebtoken');
const app          = require('../../app');

const studentRepo    = require('../../src/repositories/student.repository');
const teacherRepo    = require('../../src/repositories/teacher.repository');
const curriculumRepo = require('../../src/repositories/curriculum.repository');
const subjectRepo    = require('../../src/repositories/subject.repository');
const chapterRepo    = require('../../src/repositories/chapter.repository');
const topicRepo      = require('../../src/repositories/topic.repository');
const { pool }       = require('../../src/database/connection');

// ── Test fixtures ──────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_that_is_long_enough';
function makeToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

const STUDENT_ACCOUNT = {
  id: 1, username: 'student1', name: 'Test Student',
  is_active: true, classroom_id: 10,
};

const TEACHER_ACCOUNT = {
  id: 5, email: 'teacher@classtrack.ai', name: 'Ms. Priya Kumar',
  is_active: true,
};

// The student's classroom is owned by teacher 5.
// The pool.query shim is used by studentKnowledge.service._getTeacherIdForStudent()
// which runs: SELECT c.teacher_id FROM classrooms c JOIN students s ...
const CLASSROOM_QUERY_RESULT = [{ teacher_id: 5 }];

const STUDENT_TOKEN = makeToken({ id: 1, role: 'student' });
const TEACHER_TOKEN = makeToken({ id: 5, role: 'teacher' });

const MOCK_CURRICULA = [
  { id: 1, name: 'Science Grade 8', description: null, is_active: true, created_at: new Date().toISOString() },
  { id: 2, name: 'Maths Grade 8',   description: null, is_active: true, created_at: new Date().toISOString() },
];

const MOCK_SUBJECTS = [
  { id: 10, name: 'Biology', description: null, curriculum_id: 1 },
];

const MOCK_CHAPTERS = [
  { id: 20, name: 'Cell Biology', description: null, subject_id: 10 },
];

const MOCK_TOPICS = [
  { id: 30, name: 'Cell Structure', description: null, chapter_id: 20 },
  { id: 31, name: 'Cell Division',  description: null, chapter_id: 20 },
];

// ── Helper: mock pool.query for classroom lookup ──────────────────────────────
// The service calls pool.query directly (not through a repository),
// so we must mock the pool directly.
function mockClassroomLookup() {
  pool.query.mockResolvedValue([CLASSROOM_QUERY_RESULT, []]);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Student Knowledge Hierarchy — Route Registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT);
    teacherRepo.findById.mockResolvedValue(TEACHER_ACCOUNT);
  });

  it('GET /api/v1/student/knowledge/curricula returns 401 without auth (not 404)', async () => {
    const res = await request(app).get('/api/v1/student/knowledge/curricula');
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
  });

  it('GET /api/v1/student/knowledge/curricula/:id/subjects returns 401 without auth (not 404)', async () => {
    const res = await request(app).get('/api/v1/student/knowledge/curricula/1/subjects');
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
  });

  it('GET /api/v1/student/knowledge/subjects/:id/chapters returns 401 without auth (not 404)', async () => {
    const res = await request(app).get('/api/v1/student/knowledge/subjects/1/chapters');
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
  });

  it('GET /api/v1/student/knowledge/chapters/:id/topics returns 401 without auth (not 404)', async () => {
    const res = await request(app).get('/api/v1/student/knowledge/chapters/1/topics');
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
  });
});

// ── Role isolation: teacher must NOT access student-only routes ───────────────

describe('Student Knowledge Hierarchy — Role Isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    teacherRepo.findById.mockResolvedValue(TEACHER_ACCOUNT);
    pool.query.mockResolvedValue([[TEACHER_ACCOUNT], []]);
  });

  it('returns 403 when a teacher tries to list student curricula', async () => {
    const res = await request(app)
      .get('/api/v1/student/knowledge/curricula')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 when a teacher tries to list subjects via student endpoint', async () => {
    const res = await request(app)
      .get('/api/v1/student/knowledge/curricula/1/subjects')
      .set('Authorization', `Bearer ${TEACHER_TOKEN}`);
    expect(res.status).toBe(403);
  });
});

// ── Curricula listing ─────────────────────────────────────────────────────────

describe('Student Knowledge Hierarchy — List Curricula', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT);
  });

  it('returns 200 with curricula scoped to the classroom teacher', async () => {
    mockClassroomLookup();
    curriculumRepo.listByTeacher.mockResolvedValue(MOCK_CURRICULA);

    const res = await request(app)
      .get('/api/v1/student/knowledge/curricula')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.curricula).toHaveLength(2);
    expect(res.body.data.curricula[0].name).toBe('Science Grade 8');
  });

  it('returns curricula belonging to teacher_id from classroom, not request body', async () => {
    // Security: teacher_id is resolved server-side via the classroom JOIN,
    // never passed in the request.
    mockClassroomLookup();
    curriculumRepo.listByTeacher.mockResolvedValue(MOCK_CURRICULA);

    await request(app)
      .get('/api/v1/student/knowledge/curricula')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    // listByTeacher must have been called with teacher_id = 5 (from classroom)
    expect(curriculumRepo.listByTeacher).toHaveBeenCalledWith(5);
  });

  it('returns empty curricula array when teacher has no curricula (empty list)', async () => {
    // The classroom lookup succeeds but the teacher has no curricula yet.
    // This is different from "no classroom" which is a unit-test concern.
    mockClassroomLookup();
    curriculumRepo.listByTeacher.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/student/knowledge/curricula')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.curricula).toHaveLength(0);
  });
});

// ── Subject listing ───────────────────────────────────────────────────────────

describe('Student Knowledge Hierarchy — List Subjects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT);
  });

  it('returns 200 with subjects when curriculum belongs to the classroom teacher', async () => {
    mockClassroomLookup();
    curriculumRepo.findOwnedById.mockResolvedValue(MOCK_CURRICULA[0]);
    subjectRepo.listByCurriculum.mockResolvedValue(MOCK_SUBJECTS);

    const res = await request(app)
      .get('/api/v1/student/knowledge/curricula/1/subjects')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.subjects).toHaveLength(1);
    expect(res.body.data.subjects[0].name).toBe('Biology');
  });

  it('returns 404 when curriculum does not belong to the classroom teacher (IDOR blocked)', async () => {
    // findOwnedById returns null → curriculum belongs to a different teacher
    mockClassroomLookup();
    curriculumRepo.findOwnedById.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/student/knowledge/curricula/999/subjects')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(404);
  });
});

// ── Chapter listing ────────────────────────────────────────────────────────────

describe('Student Knowledge Hierarchy — List Chapters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT);
  });

  it('returns 200 with chapters when subject belongs to the classroom teacher', async () => {
    mockClassroomLookup();
    subjectRepo.findOwnedById.mockResolvedValue(MOCK_SUBJECTS[0]);
    chapterRepo.listBySubject.mockResolvedValue(MOCK_CHAPTERS);

    const res = await request(app)
      .get('/api/v1/student/knowledge/subjects/10/chapters')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.chapters).toHaveLength(1);
    expect(res.body.data.chapters[0].name).toBe('Cell Biology');
  });

  it('returns 404 when subject does not belong to the classroom teacher (IDOR blocked)', async () => {
    mockClassroomLookup();
    subjectRepo.findOwnedById.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/student/knowledge/subjects/999/chapters')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(404);
  });
});

// ── Topic listing ──────────────────────────────────────────────────────────────

describe('Student Knowledge Hierarchy — List Topics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT);
  });

  it('returns 200 with topics when chapter belongs to the classroom teacher', async () => {
    mockClassroomLookup();
    chapterRepo.findOwnedById.mockResolvedValue(MOCK_CHAPTERS[0]);
    topicRepo.listByChapter.mockResolvedValue(MOCK_TOPICS);

    const res = await request(app)
      .get('/api/v1/student/knowledge/chapters/20/topics')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.topics).toHaveLength(2);
    expect(res.body.data.topics[0].name).toBe('Cell Structure');
    expect(res.body.data.topics[1].name).toBe('Cell Division');
  });

  it('returns 404 when chapter does not belong to the classroom teacher (IDOR blocked)', async () => {
    mockClassroomLookup();
    chapterRepo.findOwnedById.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/student/knowledge/chapters/999/topics')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(404);
  });

  it('returns full hierarchy: topics are correct items from the chapter', async () => {
    mockClassroomLookup();
    chapterRepo.findOwnedById.mockResolvedValue(MOCK_CHAPTERS[0]);
    topicRepo.listByChapter.mockResolvedValue(MOCK_TOPICS);

    const res = await request(app)
      .get('/api/v1/student/knowledge/chapters/20/topics')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(200);
    const topics = res.body.data.topics;
    expect(topics.map((t) => t.id)).toEqual([30, 31]);
  });
});

// ── Security: student A cannot access student B's teacher's hierarchy ─────────

describe('Student Knowledge Hierarchy — Cross-classroom IDOR Protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    studentRepo.findById.mockResolvedValue(STUDENT_ACCOUNT);
  });

  it('cannot list subjects when curriculum belongs to a different teacher', async () => {
    // Student 1 → classroom 10 → teacher 5
    // But curriculum 50 belongs to teacher 9 (another teacher).
    // findOwnedById(50, 5) returns null → blocked.
    mockClassroomLookup();
    curriculumRepo.findOwnedById.mockResolvedValue(null); // not owned by teacher 5

    const res = await request(app)
      .get('/api/v1/student/knowledge/curricula/50/subjects')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(404);
  });

  it('cannot list chapters when subject belongs to a different teacher', async () => {
    mockClassroomLookup();
    subjectRepo.findOwnedById.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/student/knowledge/subjects/50/chapters')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(404);
  });

  it('cannot list topics when chapter belongs to a different teacher', async () => {
    mockClassroomLookup();
    chapterRepo.findOwnedById.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/student/knowledge/chapters/50/topics')
      .set('Authorization', `Bearer ${STUDENT_TOKEN}`);

    expect(res.status).toBe(404);
  });
});
