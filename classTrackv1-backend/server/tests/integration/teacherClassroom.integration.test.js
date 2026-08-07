/**
 * server/tests/integration/teacherClassroom.integration.test.js
 *
 * Boundary: real Express app, real routing/validation/controllers/services —
 * database layer mocked at the repository level, same convention as
 * auth.integration.test.js, so this runs without a live MySQL instance.
 */

jest.mock('../../src/database/connection', () => ({
  pool: { query: jest.fn() },
  testConnection: jest.fn(),
}));

jest.mock('../../src/repositories/classroom.repository', () => ({
  findOwnedById: jest.fn(),
  existsDuplicate: jest.fn(),
  listByTeacherManaged: jest.fn(),
  create: jest.fn(),
  updateFields: jest.fn(),
  archive: jest.fn(),
  restore: jest.fn(),
  softDelete: jest.fn(),
  regenerateCode: jest.fn(),
  existsByCode: jest.fn().mockResolvedValue(false),
  getTeacherDashboardStats: jest.fn(),
  getRecentActivity: jest.fn(),
}));

jest.mock('../../src/repositories/student.repository', () => ({
  countBy: jest.fn(),
}));

jest.mock('../../src/repositories/task.repository', () => ({
  countBy: jest.fn(),
}));

jest.mock('../../src/repositories/audit.repository', () => ({
  insert: jest.fn(),
}));

const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../src/database/connection');
const classroomRepo = require('../../src/repositories/classroom.repository');
const studentRepo = require('../../src/repositories/student.repository');
const taskRepo = require('../../src/repositories/task.repository');
const { issueAccessToken } = require('../../src/services/token.service');

const TEACHER_ACCOUNT = {
  id: 7, name: 'Ms. Rao', email: 'teacher@classtrack.ai', is_active: 1,
  password_hash: 'irrelevant', failed_login_attempts: 0, locked_until: null,
};
const STUDENT_ACCOUNT = {
  id: 20, name: 'Riya Patel', username: 'riya_patel', classroom_id: 3, is_active: 1,
  password_hash: 'irrelevant', failed_login_attempts: 0, locked_until: null,
};

function teacherToken() {
  return issueAccessToken({ id: TEACHER_ACCOUNT.id, role: 'teacher', name: TEACHER_ACCOUNT.name });
}
function studentToken() {
  return issueAccessToken({ id: STUDENT_ACCOUNT.id, role: 'student', name: STUDENT_ACCOUNT.name });
}

beforeEach(() => {
  jest.clearAllMocks();
  classroomRepo.existsByCode.mockResolvedValue(false);
});

describe('Teacher dashboard + classroom management', () => {
  // -------------------------------------------------------------------------
  describe('GET /api/v1/teacher/dashboard', () => {
    it('requires authentication', async () => {
      const res = await request(app).get('/api/v1/teacher/dashboard');
      expect(res.status).toBe(401);
    });

    it('rejects a student token (role security)', async () => {
      pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);
      const res = await request(app)
        .get('/api/v1/teacher/dashboard')
        .set('Authorization', `Bearer ${studentToken()}`);
      expect(res.status).toBe(403);
    });

    it('returns aggregated stats in a single call to the repository (no N+1)', async () => {
      pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
      classroomRepo.getTeacherDashboardStats.mockResolvedValue({
        totalClassrooms: 5, totalStudents: 120, activeAssignments: 8, pendingEvaluations: 3,
      });
      classroomRepo.getRecentActivity.mockResolvedValue([
        { type: 'task_posted', id: 1, label: 'Problem Set 7', classroom_name: 'Algebra II', occurred_at: '2026-07-28T10:00:00.000Z' },
      ]);

      const res = await request(app)
        .get('/api/v1/teacher/dashboard')
        .set('Authorization', `Bearer ${teacherToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(
        expect.objectContaining({
          totalClassrooms: 5, totalStudents: 120, activeAssignments: 8, pendingEvaluations: 3,
          recentActivity: expect.any(Array),
        })
      );
      expect(classroomRepo.getTeacherDashboardStats).toHaveBeenCalledTimes(1);
      expect(classroomRepo.getTeacherDashboardStats).toHaveBeenCalledWith(TEACHER_ACCOUNT.id);
    });
  });

  // -------------------------------------------------------------------------
  describe('GET /api/v1/teacher/classrooms/manage', () => {
    beforeEach(() => pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]));

    it('paginates, and applies default sort/status when the client sends none', async () => {
      classroomRepo.listByTeacherManaged.mockResolvedValue({
        rows: [{
          id: 1, name: 'Algebra II', subject: 'Math', section: 'A', class_code: 'ABC12345',
          is_active: 1, created_at: '2026-01-01', student_count: 30, task_count: 4,
          latest_activity_at: '2026-07-20',
        }],
        total: 1,
      });

      const res = await request(app)
        .get('/api/v1/teacher/classrooms/manage')
        .set('Authorization', `Bearer ${teacherToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.classrooms).toHaveLength(1);
      expect(res.body.data.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
      expect(classroomRepo.listByTeacherManaged).toHaveBeenCalledWith(
        expect.objectContaining({ teacherId: 7, status: 'active', sortBy: 'createdAt', sortDir: 'desc', limit: 20, offset: 0 })
      );
    });

    it('passes search, sort, and pagination query params through to the repository', async () => {
      classroomRepo.listByTeacherManaged.mockResolvedValue({ rows: [], total: 0 });

      const res = await request(app)
        .get('/api/v1/teacher/classrooms/manage')
        .query({ page: 2, limit: 5, search: 'algebra', status: 'archived', sortBy: 'name', sortDir: 'asc' })
        .set('Authorization', `Bearer ${teacherToken()}`);

      expect(res.status).toBe(200);
      expect(classroomRepo.listByTeacherManaged).toHaveBeenCalledWith(
        expect.objectContaining({
          teacherId: 7, search: 'algebra', status: 'archived',
          sortBy: 'name', sortDir: 'asc', limit: 5, offset: 5,
        })
      );
    });

    it('rejects an invalid status filter with a validation error', async () => {
      const res = await request(app)
        .get('/api/v1/teacher/classrooms/manage')
        .query({ status: 'not-a-real-status' })
        .set('Authorization', `Bearer ${teacherToken()}`);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('POST /api/v1/teacher/classrooms/manage (create)', () => {
    beforeEach(() => pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]));

    it('rejects a name that is too short', async () => {
      const res = await request(app)
        .post('/api/v1/teacher/classrooms/manage')
        .set('Authorization', `Bearer ${teacherToken()}`)
        .send({ name: 'A' });
      expect(res.status).toBe(400);
    });

    it('rejects a duplicate classroom (same name + section) with 409', async () => {
      classroomRepo.existsDuplicate.mockResolvedValue(true);
      const res = await request(app)
        .post('/api/v1/teacher/classrooms/manage')
        .set('Authorization', `Bearer ${teacherToken()}`)
        .send({ name: 'Algebra II', section: 'A' });
      expect(res.status).toBe(409);
      expect(classroomRepo.create).not.toHaveBeenCalled();
    });

    it('creates a classroom with a generated join code on success', async () => {
      classroomRepo.existsDuplicate.mockResolvedValue(false);
      classroomRepo.create.mockResolvedValue(42);

      const res = await request(app)
        .post('/api/v1/teacher/classrooms/manage')
        .set('Authorization', `Bearer ${teacherToken()}`)
        .send({ name: 'Algebra II', subject: 'Math', section: 'A' });

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual(
        expect.objectContaining({ id: 42, name: 'Algebra II', subject: 'Math', section: 'A' })
      );
      expect(res.body.data.classCode).toEqual(expect.any(String));
      expect(classroomRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Algebra II', teacher_id: 7, created_by: 7 })
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('Classroom ownership + soft-delete enforcement', () => {
    beforeEach(() => pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]));

    it('returns 404 for a classroom that does not belong to this teacher (or is soft-deleted)', async () => {
      classroomRepo.findOwnedById.mockResolvedValue(null);
      const res = await request(app)
        .patch('/api/v1/teacher/classrooms/manage/999/archive')
        .set('Authorization', `Bearer ${teacherToken()}`);
      expect(res.status).toBe(404);
    });

    it('archives an owned, active classroom', async () => {
      classroomRepo.findOwnedById.mockResolvedValue({ id: 1, teacher_id: 7, is_active: 1 });
      const res = await request(app)
        .patch('/api/v1/teacher/classrooms/manage/1/archive')
        .set('Authorization', `Bearer ${teacherToken()}`);
      expect(res.status).toBe(200);
      expect(classroomRepo.archive).toHaveBeenCalledWith(1);
    });

    it('rejects archiving a classroom that is already archived', async () => {
      classroomRepo.findOwnedById.mockResolvedValue({ id: 1, teacher_id: 7, is_active: 0 });
      const res = await request(app)
        .patch('/api/v1/teacher/classrooms/manage/1/archive')
        .set('Authorization', `Bearer ${teacherToken()}`);
      expect(res.status).toBe(400);
      expect(classroomRepo.archive).not.toHaveBeenCalled();
    });

    it('restores an archived classroom', async () => {
      classroomRepo.findOwnedById.mockResolvedValue({ id: 1, teacher_id: 7, is_active: 0 });
      const res = await request(app)
        .patch('/api/v1/teacher/classrooms/manage/1/restore')
        .set('Authorization', `Bearer ${teacherToken()}`);
      expect(res.status).toBe(200);
      expect(classroomRepo.restore).toHaveBeenCalledWith(1);
    });

    it('soft-deletes a classroom (delete, not destroy)', async () => {
      classroomRepo.findOwnedById.mockResolvedValue({ id: 1, teacher_id: 7, is_active: 1 });
      const res = await request(app)
        .delete('/api/v1/teacher/classrooms/manage/1')
        .set('Authorization', `Bearer ${teacherToken()}`);
      expect(res.status).toBe(200);
      expect(classroomRepo.softDelete).toHaveBeenCalledWith(1);
    });

    it('regenerates the join code for an owned classroom', async () => {
      classroomRepo.findOwnedById.mockResolvedValue({ id: 1, teacher_id: 7, is_active: 1 });
      const res = await request(app)
        .patch('/api/v1/teacher/classrooms/manage/1/regenerate-code')
        .set('Authorization', `Bearer ${teacherToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.data.classCode).toEqual(expect.any(String));
      expect(classroomRepo.regenerateCode).toHaveBeenCalledWith(1, expect.any(String));
    });
  });
});
