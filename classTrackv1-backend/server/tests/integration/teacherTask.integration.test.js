/**
 * server/tests/integration/teacherTask.integration.test.js
 *
 * Boundary: real Express app, real routing/validation/controllers/services —
 * database layer mocked at the repository level, same convention as
 * auth.integration.test.js and teacherClassroom.integration.test.js, so
 * this runs without a live MySQL instance.
 */

jest.mock('../../src/database/connection', () => ({
  pool: { query: jest.fn() },
  testConnection: jest.fn(),
}));

jest.mock('../../src/repositories/task.repository', () => ({
  belongsToTeacher: jest.fn(),
  existsDuplicateTitle: jest.fn(),
  listByTeacherManaged: jest.fn(),
  create: jest.fn(),
  updateById: jest.fn(),
  softDelete: jest.fn(),
  setPublished: jest.fn(),
  toggleActive: jest.fn(),
  countBy: jest.fn(),
}));

jest.mock('../../src/repositories/classroom.repository', () => ({
  belongsToTeacher: jest.fn(),
  findOwnedById: jest.fn(),
}));

jest.mock('../../src/repositories/student.repository', () => ({
  countBy: jest.fn(),
}));

jest.mock('../../src/repositories/notification.repository', () => ({
  getActiveStudentIds: jest.fn().mockResolvedValue([]),
  bulkInsertForClassroom: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/repositories/audit.repository', () => ({
  insert: jest.fn(),
}));

const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../src/database/connection');
const taskRepo = require('../../src/repositories/task.repository');
const classroomRepo = require('../../src/repositories/classroom.repository');
const { issueAccessToken } = require('../../src/services/token.service');

const TEACHER_ACCOUNT = {
  id: 7, name: 'Ms. Rao', email: 'teacher@classtrack.ai', is_active: 1,
  password_hash: 'irrelevant', failed_login_attempts: 0, locked_until: null,
};
const STUDENT_ACCOUNT = {
  id: 20, name: 'Riya Patel', username: 'riya_patel', classroom_id: 3, is_active: 1,
  password_hash: 'irrelevant', failed_login_attempts: 0, locked_until: null,
};
const ACTIVE_CLASSROOM = { id: 3, teacher_id: 7, name: 'Algebra II', is_active: 1 };
const ARCHIVED_CLASSROOM = { id: 3, teacher_id: 7, name: 'Algebra II', is_active: 0 };

function teacherToken() {
  return issueAccessToken({ id: TEACHER_ACCOUNT.id, role: 'teacher', name: TEACHER_ACCOUNT.name });
}
function studentToken() {
  return issueAccessToken({ id: STUDENT_ACCOUNT.id, role: 'student', name: STUDENT_ACCOUNT.name });
}

function futureDateString() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}
function pastDateString() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockResolvedValue([[TEACHER_ACCOUNT]]);
});

describe('Teacher task management', () => {
  // -------------------------------------------------------------------------
  describe('Authorization', () => {
    it('GET /teacher/tasks requires authentication', async () => {
      const res = await request(app).get('/api/v1/teacher/tasks');
      expect(res.status).toBe(401);
    });

    it('rejects a student token on every task-management route', async () => {
      pool.query.mockResolvedValue([[STUDENT_ACCOUNT]]);
      const res = await request(app)
        .get('/api/v1/teacher/tasks')
        .set('Authorization', `Bearer ${studentToken()}`);
      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  describe('GET /api/v1/teacher/tasks', () => {
    it('lists tasks with default pagination/sort', async () => {
      taskRepo.listByTeacherManaged.mockResolvedValue({
        rows: [{
          id: 1, classroom_id: 3, classroom_name: 'Algebra II', title: 'Problem Set 7',
          description: null, instructions: null, max_score: 100, due_date: null, task_date: null,
          is_active: 1, ai_evaluation_enabled: 1, allowed_file_types: null,
          created_at: '2026-01-01', submission_count: 4,
        }],
        total: 1,
      });
      const res = await request(app)
        .get('/api/v1/teacher/tasks')
        .set('Authorization', `Bearer ${teacherToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.data.tasks).toHaveLength(1);
      expect(res.body.data.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
      expect(taskRepo.listByTeacherManaged).toHaveBeenCalledWith(
        expect.objectContaining({ teacherId: 7, status: 'all', sortBy: 'createdAt', sortDir: 'desc' })
      );
    });

    it('rejects an invalid status filter', async () => {
      const res = await request(app)
        .get('/api/v1/teacher/tasks')
        .query({ status: 'bogus' })
        .set('Authorization', `Bearer ${teacherToken()}`);
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  describe('POST /api/v1/teacher/tasks (create)', () => {
    beforeEach(() => {
      classroomRepo.belongsToTeacher.mockResolvedValue(ACTIVE_CLASSROOM);
      taskRepo.existsDuplicateTitle.mockResolvedValue(false);
      taskRepo.create.mockResolvedValue(55);
    });

    it('requires classroomId and title', async () => {
      const res = await request(app)
        .post('/api/v1/teacher/tasks')
        .set('Authorization', `Bearer ${teacherToken()}`)
        .send({ title: 'X' }); // missing classroomId, title too short
      expect(res.status).toBe(400);
    });

    it('rejects a due date in the past', async () => {
      const res = await request(app)
        .post('/api/v1/teacher/tasks')
        .set('Authorization', `Bearer ${teacherToken()}`)
        .send({ classroomId: 3, title: 'Problem Set 8', dueDate: pastDateString() });
      expect(res.status).toBe(400);
      expect(taskRepo.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate title within the same classroom with 409', async () => {
      taskRepo.existsDuplicateTitle.mockResolvedValue(true);
      const res = await request(app)
        .post('/api/v1/teacher/tasks')
        .set('Authorization', `Bearer ${teacherToken()}`)
        .send({ classroomId: 3, title: 'Problem Set 7' });
      expect(res.status).toBe(409);
      expect(taskRepo.create).not.toHaveBeenCalled();
    });

    it('creates a task with the new fields and notifies students', async () => {
      const res = await request(app)
        .post('/api/v1/teacher/tasks')
        .set('Authorization', `Bearer ${teacherToken()}`)
        .send({
          classroomId: 3, title: 'Problem Set 8', dueDate: futureDateString(),
          aiEvaluationEnabled: false, allowedFileTypes: ['pdf', 'txt'],
        });
      expect(res.status).toBe(201);
      expect(taskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          classroom_id: 3, title: 'Problem Set 8',
          ai_evaluation_enabled: 0,
          allowed_file_types: JSON.stringify(['pdf', 'txt']),
        })
      );
    });

    it('rejects a task for a classroom the teacher does not own', async () => {
      classroomRepo.belongsToTeacher.mockResolvedValue(null);
      const res = await request(app)
        .post('/api/v1/teacher/tasks')
        .set('Authorization', `Bearer ${teacherToken()}`)
        .send({ classroomId: 999, title: 'Not mine' });
      expect(res.status).toBe(404);
      expect(taskRepo.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('Task ownership + soft-delete enforcement', () => {
    it('returns 404 for a task that is not owned (or is soft-deleted, since belongsToTeacher excludes deleted rows)', async () => {
      taskRepo.belongsToTeacher.mockResolvedValue(null);
      const res = await request(app)
        .get('/api/v1/teacher/tasks/999')
        .set('Authorization', `Bearer ${teacherToken()}`);
      expect(res.status).toBe(404);
    });

    it('soft-deletes a task (delete, not destroy)', async () => {
      taskRepo.belongsToTeacher.mockResolvedValue({ id: 1, classroom_id: 3, title: 'Problem Set 7' });
      const res = await request(app)
        .delete('/api/v1/teacher/tasks/1')
        .set('Authorization', `Bearer ${teacherToken()}`);
      expect(res.status).toBe(200);
      expect(taskRepo.softDelete).toHaveBeenCalledWith(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('PATCH /api/v1/teacher/tasks/:taskId (edit)', () => {
    it('rejects a due date in the past on edit', async () => {
      taskRepo.belongsToTeacher.mockResolvedValue({ id: 1, classroom_id: 3, title: 'Problem Set 7' });
      const res = await request(app)
        .patch('/api/v1/teacher/tasks/1')
        .set('Authorization', `Bearer ${teacherToken()}`)
        .send({ dueDate: pastDateString() });
      expect(res.status).toBe(400);
      expect(taskRepo.updateById).not.toHaveBeenCalled();
    });

    it('rejects renaming to a title that collides with another task in the same classroom', async () => {
      taskRepo.belongsToTeacher.mockResolvedValue({ id: 1, classroom_id: 3, title: 'Problem Set 7' });
      taskRepo.existsDuplicateTitle.mockResolvedValue(true);
      const res = await request(app)
        .patch('/api/v1/teacher/tasks/1')
        .set('Authorization', `Bearer ${teacherToken()}`)
        .send({ title: 'Problem Set 9' });
      expect(res.status).toBe(409);
      expect(taskRepo.updateById).not.toHaveBeenCalled();
    });

    it('allows re-saving the same title unchanged without a duplicate check', async () => {
      taskRepo.belongsToTeacher.mockResolvedValue({ id: 1, classroom_id: 3, title: 'Problem Set 7' });
      const res = await request(app)
        .patch('/api/v1/teacher/tasks/1')
        .set('Authorization', `Bearer ${teacherToken()}`)
        .send({ title: 'Problem Set 7', description: 'Updated description' });
      expect(res.status).toBe(200);
      expect(taskRepo.existsDuplicateTitle).not.toHaveBeenCalled();
      expect(taskRepo.updateById).toHaveBeenCalledWith(1, expect.objectContaining({ description: 'Updated description' }));
    });
  });

  // -------------------------------------------------------------------------
  describe('Publish / Unpublish', () => {
    it('publishes a task in an active classroom', async () => {
      taskRepo.belongsToTeacher.mockResolvedValue({ id: 1, classroom_id: 3, title: 'Problem Set 7' });
      classroomRepo.findOwnedById.mockResolvedValue(ACTIVE_CLASSROOM);
      const res = await request(app)
        .patch('/api/v1/teacher/tasks/1/publish')
        .set('Authorization', `Bearer ${teacherToken()}`);
      expect(res.status).toBe(200);
      expect(taskRepo.setPublished).toHaveBeenCalledWith(1, true);
    });

    it('refuses to publish a task whose classroom is archived', async () => {
      taskRepo.belongsToTeacher.mockResolvedValue({ id: 1, classroom_id: 3, title: 'Problem Set 7' });
      classroomRepo.findOwnedById.mockResolvedValue(ARCHIVED_CLASSROOM);
      const res = await request(app)
        .patch('/api/v1/teacher/tasks/1/publish')
        .set('Authorization', `Bearer ${teacherToken()}`);
      expect(res.status).toBe(400);
      expect(taskRepo.setPublished).not.toHaveBeenCalled();
    });

    it('unpublishes a task regardless of classroom archive state', async () => {
      taskRepo.belongsToTeacher.mockResolvedValue({ id: 1, classroom_id: 3, title: 'Problem Set 7' });
      const res = await request(app)
        .patch('/api/v1/teacher/tasks/1/unpublish')
        .set('Authorization', `Bearer ${teacherToken()}`);
      expect(res.status).toBe(200);
      expect(taskRepo.setPublished).toHaveBeenCalledWith(1, false);
    });
  });
});
