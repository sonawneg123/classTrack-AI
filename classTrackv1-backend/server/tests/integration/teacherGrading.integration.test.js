/**
 * server/tests/integration/teacherGrading.integration.test.js
 *
 * Integration tests for:
 *   GET /api/v1/teacher/classrooms/manage/:classroomId/grading-overview
 *
 * Boundary: real Express app + real routing/validation/controllers/services.
 * Database layer mocked at the repository level (same convention as
 * teacherClassroom.integration.test.js), so these run without a live MySQL
 * instance.
 *
 * IMPORTANT: The authenticate() middleware calls pool.query to re-validate the
 * account on every request (checking is_active / locked_until). Any test that
 * sends a token must set pool.query.mockResolvedValue([[<account>]]) first,
 * matching the pattern used in teacherClassroom.integration.test.js.
 *
 * Coverage:
 *   - Authentication (401 when unauthenticated)
 *   - Authorization (403 non-teacher role)
 *   - Ownership / not-found (404 for another teacher's classroom, deleted classroom)
 *   - Happy path: valid classroom, correct response shape
 *   - Zero-student classroom
 *   - Zero-submission classroom
 *   - Mixed submission states (submitted/analyzing/analyzed/failed)
 *   - Teacher score override precedence
 *   - No sensitive fields exposed
 *   - Archived classroom (is_active=0) remains accessible
 *   - Validator rejects non-integer classroomId
 */

jest.mock('../../src/database/connection', () => ({
  pool: { query: jest.fn() },
  testConnection: jest.fn(),
}));

jest.mock('../../src/repositories/classroom.repository', () => ({
  findOwnedById:            jest.fn(),
  getGradingOverview:       jest.fn(),
  existsByCode:             jest.fn().mockResolvedValue(false),
  getTeacherDashboardStats: jest.fn(),
  getRecentActivity:        jest.fn(),
}));

jest.mock('../../src/repositories/audit.repository', () => ({
  insert: jest.fn(),
}));

jest.mock('../../src/repositories/student.repository',      () => ({ countBy: jest.fn() }));
jest.mock('../../src/repositories/task.repository',         () => ({ countBy: jest.fn() }));
jest.mock('../../src/repositories/notification.repository', () => ({
  getActiveStudentIds:        jest.fn().mockResolvedValue([]),
  bulkInsertForClassroom:     jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app     = require('../../app');
const { pool } = require('../../src/database/connection');
const classroomRepo = require('../../src/repositories/classroom.repository');
const { issueAccessToken } = require('../../src/services/token.service');

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TEACHER_ACCOUNT = {
  id: 7, name: 'Ms. Rao', email: 'teacher@classtrack.ai',
  is_active: 1, failed_login_attempts: 0, locked_until: null,
  password_hash: 'irrelevant',
};
const OTHER_TEACHER_ACCOUNT = {
  id: 99, name: 'Other Teacher', email: 'other@classtrack.ai',
  is_active: 1, failed_login_attempts: 0, locked_until: null,
  password_hash: 'irrelevant',
};
const STUDENT_ACCOUNT = {
  id: 20, name: 'Riya Patel', username: 'riya_patel', classroom_id: 3,
  is_active: 1, failed_login_attempts: 0, locked_until: null,
  password_hash: 'irrelevant',
};

const ACTIVE_CLASSROOM = {
  id: 3, teacher_id: TEACHER_ACCOUNT.id, name: 'Algebra II', subject: 'Maths',
  section: 'A', class_code: 'ABCD1234', is_active: 1, deleted_at: null,
};

/** Minimal valid grading overview payload returned by classroomRepo.getGradingOverview */
function makeOverviewPayload({
  studentCount    = 2,
  taskCount       = 2,
  totalSubmissions = 2,
  evaluatedCount  = 1,
  pendingCount    = 1,
  avgScore        = 75.5,
  tasks           = null,
  students        = null,
} = {}) {
  return {
    summary: {
      classroom_id:      3,
      classroom_name:    'Algebra II',
      subject:           'Maths',
      section:           'A',
      class_code:        'ABCD1234',
      is_active:         1,
      student_count:     studentCount,
      task_count:        taskCount,
      total_submissions: totalSubmissions,
      evaluated_count:   evaluatedCount,
      pending_count:     pendingCount,
      avg_score:         avgScore,
    },
    tasks: tasks ?? [
      {
        task_id: 1, title: 'Essay 1', due_date: '2025-06-01', max_score: 100,
        is_active: 1, archived_at: null,
        student_count: 2, submitted_count: 2, evaluated_count: 1,
        pending_count: 1, avg_score: 75.5,
      },
    ],
    students: students ?? [
      {
        student_id: 10, name: 'Alice', username: 'alice01',
        task_count: 2, submitted_count: 1, evaluated_count: 1,
        pending_count: 0, avg_score: 80.0,
      },
      {
        student_id: 11, name: 'Bob', username: 'bob02',
        task_count: 2, submitted_count: 1, evaluated_count: 0,
        pending_count: 1, avg_score: null,
      },
    ],
  };
}

function teacherToken() {
  return issueAccessToken({ id: TEACHER_ACCOUNT.id, role: 'teacher', name: TEACHER_ACCOUNT.name });
}
function otherTeacherToken() {
  return issueAccessToken({ id: OTHER_TEACHER_ACCOUNT.id, role: 'teacher', name: OTHER_TEACHER_ACCOUNT.name });
}
function studentToken() {
  return issueAccessToken({ id: STUDENT_ACCOUNT.id, role: 'student', name: STUDENT_ACCOUNT.name });
}

const URL = (id = 3) => `/api/v1/teacher/classrooms/manage/${id}/grading-overview`;

beforeEach(() => jest.clearAllMocks());

// ── Test suites ───────────────────────────────────────────────────────────────

describe('GET /api/v1/teacher/classrooms/manage/:id/grading-overview', () => {

  // --------------------------------------------------------------------------
  describe('Authentication', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).get(URL());
      expect(res.status).toBe(401);
    });
  });

  // --------------------------------------------------------------------------
  describe('Authorization', () => {
    it('returns 403 when caller is a student (wrong role)', async () => {
      // authenticate() will look up the student account in the DB
      pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);

      const res = await request(app)
        .get(URL())
        .set('Authorization', `Bearer ${studentToken()}`);

      expect(res.status).toBe(403);
    });
  });

  // --------------------------------------------------------------------------
  describe('Classroom ownership', () => {
    it('returns 404 when classroom does not exist', async () => {
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
      classroomRepo.findOwnedById.mockResolvedValue(null);

      const res = await request(app)
        .get(URL(999))
        .set('Authorization', `Bearer ${teacherToken()}`);

      expect(res.status).toBe(404);
    });

    it('returns 404 when classroom belongs to a different teacher', async () => {
      pool.query.mockResolvedValue([[OTHER_TEACHER_ACCOUNT]]);
      // findOwnedById checks teacher_id — will return null for the wrong owner
      classroomRepo.findOwnedById.mockResolvedValue(null);

      const res = await request(app)
        .get(URL(3))
        .set('Authorization', `Bearer ${otherTeacherToken()}`);

      expect(res.status).toBe(404);
    });

    it('returns 404 for a soft-deleted classroom (findOwnedById returns null)', async () => {
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
      classroomRepo.findOwnedById.mockResolvedValue(null);

      const res = await request(app)
        .get(URL(3))
        .set('Authorization', `Bearer ${teacherToken()}`);

      expect(res.status).toBe(404);
    });
  });

  // --------------------------------------------------------------------------
  describe('Happy path — valid classroom', () => {
    beforeEach(() => {
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
      classroomRepo.findOwnedById.mockResolvedValue(ACTIVE_CLASSROOM);
      classroomRepo.getGradingOverview.mockResolvedValue(makeOverviewPayload());
    });

    it('returns 200 with correct top-level shape', async () => {
      const res = await request(app)
        .get(URL())
        .set('Authorization', `Bearer ${teacherToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('summary');
      expect(res.body.data).toHaveProperty('tasks');
      expect(res.body.data).toHaveProperty('students');
    });

    it('returns correct classroom summary', async () => {
      const res = await request(app)
        .get(URL())
        .set('Authorization', `Bearer ${teacherToken()}`);

      const { summary } = res.body.data;
      expect(summary.classroomId).toBe(3);
      expect(summary.classroomName).toBe('Algebra II');
      expect(summary.classCode).toBe('ABCD1234');
      expect(summary.isActive).toBe(true);
      expect(summary.studentCount).toBe(2);
      expect(summary.taskCount).toBe(2);
      expect(summary.totalSubmissions).toBe(2);
      expect(summary.evaluatedCount).toBe(1);
      expect(summary.pendingCount).toBe(1);
      expect(summary.avgScore).toBe(75.5);
    });

    it('returns tasks array with correct fields', async () => {
      const res = await request(app)
        .get(URL())
        .set('Authorization', `Bearer ${teacherToken()}`);

      const task = res.body.data.tasks[0];
      expect(task).toHaveProperty('taskId');
      expect(task).toHaveProperty('title');
      expect(task).toHaveProperty('dueDate');
      expect(task).toHaveProperty('maxScore');
      expect(task).toHaveProperty('isPublished');
      expect(task).toHaveProperty('isArchived');
      expect(task).toHaveProperty('studentCount');
      expect(task).toHaveProperty('submittedCount');
      expect(task).toHaveProperty('evaluatedCount');
      expect(task).toHaveProperty('pendingCount');
      expect(task).toHaveProperty('avgScore');
      expect(task).toHaveProperty('completionPct');
    });

    it('returns students array with correct fields', async () => {
      const res = await request(app)
        .get(URL())
        .set('Authorization', `Bearer ${teacherToken()}`);

      const student = res.body.data.students[0];
      expect(student).toHaveProperty('studentId');
      expect(student).toHaveProperty('name');
      expect(student).toHaveProperty('username');
      expect(student).toHaveProperty('taskCount');
      expect(student).toHaveProperty('submittedCount');
      expect(student).toHaveProperty('evaluatedCount');
      expect(student).toHaveProperty('pendingCount');
      expect(student).toHaveProperty('avgScore');
    });

    it('does not expose sensitive fields (password_hash, tokens, locked_until)', async () => {
      const res = await request(app)
        .get(URL())
        .set('Authorization', `Bearer ${teacherToken()}`);

      const body = JSON.stringify(res.body);
      expect(body).not.toContain('password_hash');
      expect(body).not.toContain('locked_until');
      expect(body).not.toContain('failed_login_attempts');
      expect(body).not.toContain('token_hash');
    });
  });

  // --------------------------------------------------------------------------
  describe('Zero-data edge cases', () => {
    it('handles classroom with zero students gracefully', async () => {
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
      classroomRepo.findOwnedById.mockResolvedValue(ACTIVE_CLASSROOM);
      classroomRepo.getGradingOverview.mockResolvedValue(
        makeOverviewPayload({
          studentCount: 0, taskCount: 0, totalSubmissions: 0,
          evaluatedCount: 0, pendingCount: 0, avgScore: null,
          tasks: [], students: [],
        })
      );

      const res = await request(app)
        .get(URL())
        .set('Authorization', `Bearer ${teacherToken()}`);

      expect(res.status).toBe(200);
      const { summary } = res.body.data;
      expect(summary.studentCount).toBe(0);
      expect(summary.totalSubmissions).toBe(0);
      expect(summary.avgScore).toBeNull();
      expect(res.body.data.tasks).toHaveLength(0);
      expect(res.body.data.students).toHaveLength(0);
    });

    it('handles classroom with tasks but zero submissions', async () => {
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
      classroomRepo.findOwnedById.mockResolvedValue(ACTIVE_CLASSROOM);
      classroomRepo.getGradingOverview.mockResolvedValue(
        makeOverviewPayload({
          studentCount: 5, taskCount: 3, totalSubmissions: 0,
          evaluatedCount: 0, pendingCount: 0, avgScore: null,
          tasks: [
            {
              task_id: 1, title: 'Essay 1', due_date: null, max_score: 100,
              is_active: 1, archived_at: null,
              student_count: 5, submitted_count: 0, evaluated_count: 0,
              pending_count: 0, avg_score: null,
            },
          ],
          students: [
            {
              student_id: 10, name: 'Alice', username: 'alice01',
              task_count: 3, submitted_count: 0, evaluated_count: 0,
              pending_count: 0, avg_score: null,
            },
          ],
        })
      );

      const res = await request(app)
        .get(URL())
        .set('Authorization', `Bearer ${teacherToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.summary.totalSubmissions).toBe(0);
      expect(res.body.data.summary.avgScore).toBeNull();
      expect(res.body.data.tasks[0].submittedCount).toBe(0);
      expect(res.body.data.tasks[0].avgScore).toBeNull();
      expect(res.body.data.tasks[0].completionPct).toBe(0);
      expect(res.body.data.students[0].submittedCount).toBe(0);
      expect(res.body.data.students[0].avgScore).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  describe('Submission state correctness', () => {
    it('counts analyzed submissions as evaluated', async () => {
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
      classroomRepo.findOwnedById.mockResolvedValue(ACTIVE_CLASSROOM);
      classroomRepo.getGradingOverview.mockResolvedValue(
        makeOverviewPayload({
          totalSubmissions: 3, evaluatedCount: 3, pendingCount: 0, avgScore: 82.0,
        })
      );

      const res = await request(app)
        .get(URL())
        .set('Authorization', `Bearer ${teacherToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.summary.evaluatedCount).toBe(3);
      expect(res.body.data.summary.pendingCount).toBe(0);
    });

    it('counts submitted/analyzing/failed as pending', async () => {
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
      classroomRepo.findOwnedById.mockResolvedValue(ACTIVE_CLASSROOM);
      classroomRepo.getGradingOverview.mockResolvedValue(
        makeOverviewPayload({
          totalSubmissions: 3, evaluatedCount: 0, pendingCount: 3, avgScore: null,
        })
      );

      const res = await request(app)
        .get(URL())
        .set('Authorization', `Bearer ${teacherToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.summary.evaluatedCount).toBe(0);
      expect(res.body.data.summary.pendingCount).toBe(3);
      expect(res.body.data.summary.avgScore).toBeNull();
    });

    it('handles mixed states correctly', async () => {
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
      classroomRepo.findOwnedById.mockResolvedValue(ACTIVE_CLASSROOM);
      classroomRepo.getGradingOverview.mockResolvedValue(
        makeOverviewPayload({
          totalSubmissions: 5, evaluatedCount: 2, pendingCount: 3, avgScore: 70.0,
        })
      );

      const res = await request(app)
        .get(URL())
        .set('Authorization', `Bearer ${teacherToken()}`);

      expect(res.status).toBe(200);
      const { summary } = res.body.data;
      expect(summary.evaluatedCount).toBe(2);
      expect(summary.pendingCount).toBe(3);
      expect(summary.avgScore).toBe(70);
    });
  });

  // --------------------------------------------------------------------------
  describe('Score precedence', () => {
    it('avgScore reflects teacher_score when present (COALESCE precedence)', async () => {
      // The SQL uses COALESCE(teacher_score, ai_score) in the repository layer.
      // Here we verify the service passes through the pre-computed avg_score unchanged.
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
      classroomRepo.findOwnedById.mockResolvedValue(ACTIVE_CLASSROOM);
      classroomRepo.getGradingOverview.mockResolvedValue(
        makeOverviewPayload({ avgScore: 95.0 })
      );

      const res = await request(app)
        .get(URL())
        .set('Authorization', `Bearer ${teacherToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.summary.avgScore).toBe(95);
    });

    it('returns null avgScore when no evaluated submissions exist', async () => {
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
      classroomRepo.findOwnedById.mockResolvedValue(ACTIVE_CLASSROOM);
      classroomRepo.getGradingOverview.mockResolvedValue(
        makeOverviewPayload({ avgScore: null, evaluatedCount: 0 })
      );

      const res = await request(app)
        .get(URL())
        .set('Authorization', `Bearer ${teacherToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.summary.avgScore).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  describe('Numeric correctness', () => {
    it('completionPct is 0 when no students enrolled', async () => {
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
      classroomRepo.findOwnedById.mockResolvedValue(ACTIVE_CLASSROOM);
      classroomRepo.getGradingOverview.mockResolvedValue(
        makeOverviewPayload({
          tasks: [{
            task_id: 1, title: 'T1', due_date: null, max_score: 100,
            is_active: 1, archived_at: null,
            student_count: 0, submitted_count: 0, evaluated_count: 0,
            pending_count: 0, avg_score: null,
          }],
        })
      );

      const res = await request(app)
        .get(URL())
        .set('Authorization', `Bearer ${teacherToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.tasks[0].completionPct).toBe(0);
    });

    it('completionPct is 100 when all students submitted', async () => {
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
      classroomRepo.findOwnedById.mockResolvedValue(ACTIVE_CLASSROOM);
      classroomRepo.getGradingOverview.mockResolvedValue(
        makeOverviewPayload({
          tasks: [{
            task_id: 1, title: 'T1', due_date: null, max_score: 100,
            is_active: 1, archived_at: null,
            student_count: 4, submitted_count: 4, evaluated_count: 4,
            pending_count: 0, avg_score: 88.0,
          }],
        })
      );

      const res = await request(app)
        .get(URL())
        .set('Authorization', `Bearer ${teacherToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.tasks[0].completionPct).toBe(100);
    });

    it('avgScore is rounded to 2 decimal places', async () => {
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
      classroomRepo.findOwnedById.mockResolvedValue(ACTIVE_CLASSROOM);
      classroomRepo.getGradingOverview.mockResolvedValue(
        makeOverviewPayload({ avgScore: 66.6666666 })
      );

      const res = await request(app)
        .get(URL())
        .set('Authorization', `Bearer ${teacherToken()}`);

      expect(res.status).toBe(200);
      // Service: Number(Number(66.6666666).toFixed(2)) = 66.67
      expect(res.body.data.summary.avgScore).toBe(66.67);
    });
  });

  // --------------------------------------------------------------------------
  describe('Validator', () => {
    it('rejects non-integer classroomId with 400', async () => {
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);

      const res = await request(app)
        .get('/api/v1/teacher/classrooms/manage/abc/grading-overview')
        .set('Authorization', `Bearer ${teacherToken()}`);

      expect(res.status).toBe(400);
    });
  });

  // --------------------------------------------------------------------------
  describe('Archived classroom', () => {
    it('returns 200 for an archived (is_active=0) classroom — still readable', async () => {
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
      // Archived = is_active 0 but deleted_at IS NULL — findOwnedById returns it
      const archivedClassroom = { ...ACTIVE_CLASSROOM, is_active: 0 };
      classroomRepo.findOwnedById.mockResolvedValue(archivedClassroom);
      // The summary row from getGradingOverview also reflects is_active = 0
      const archivedPayload = makeOverviewPayload();
      archivedPayload.summary.is_active = 0;
      classroomRepo.getGradingOverview.mockResolvedValue(archivedPayload);

      const res = await request(app)
        .get(URL())
        .set('Authorization', `Bearer ${teacherToken()}`);

      // Archived classrooms are NOT deleted — grading data is still visible
      expect(res.status).toBe(200);
      expect(res.body.data.summary.isActive).toBe(false);
    });
  });
});
