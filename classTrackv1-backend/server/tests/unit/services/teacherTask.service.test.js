/**
 * server/tests/unit/services/teacherTask.service.test.js
 *
 * Boundary: teacher.service.js's task functions called directly —
 * repositories mocked, no Express/routing/validation layer involved.
 * Complements the integration test's end-to-end HTTP coverage by
 * isolating the business-rule logic itself.
 */

jest.mock('../../../src/repositories/task.repository', () => ({
  belongsToTeacher: jest.fn(),
  existsDuplicateTitle: jest.fn(),
  create: jest.fn(),
  updateById: jest.fn(),
  softDelete: jest.fn(),
  setPublished: jest.fn(),
}));
jest.mock('../../../src/repositories/classroom.repository', () => ({
  belongsToTeacher: jest.fn(),
  findOwnedById: jest.fn(),
}));
jest.mock('../../../src/repositories/notification.repository', () => ({
  getActiveStudentIds: jest.fn().mockResolvedValue([]),
  bulkInsertForClassroom: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../src/repositories/audit.repository', () => ({ insert: jest.fn() }));
jest.mock('../../../src/repositories/student.repository', () => ({}));
jest.mock('../../../src/repositories/submission.repository', () => ({}));

const teacherService = require('../../../src/services/teacher.service');
const taskRepo = require('../../../src/repositories/task.repository');
const classroomRepo = require('../../../src/repositories/classroom.repository');

const ACTIVE_CLASSROOM = { id: 3, teacher_id: 7, name: 'Algebra II', is_active: 1 };
const ARCHIVED_CLASSROOM = { id: 3, teacher_id: 7, name: 'Algebra II', is_active: 0 };

function futureDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}
function pastDate() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => jest.clearAllMocks());

describe('teacherService.createTask — business rules', () => {
  beforeEach(() => {
    classroomRepo.belongsToTeacher.mockResolvedValue(ACTIVE_CLASSROOM);
    taskRepo.existsDuplicateTitle.mockResolvedValue(false);
    taskRepo.create.mockResolvedValue(1);
  });

  it('rejects a due date in the past', async () => {
    await expect(
      teacherService.createTask({ classroomId: 3, teacherId: 7, title: 'X', dueDate: pastDate() })
    ).rejects.toThrow(/past/i);
    expect(taskRepo.create).not.toHaveBeenCalled();
  });

  it('accepts a due date in the future', async () => {
    await expect(
      teacherService.createTask({ classroomId: 3, teacherId: 7, title: 'X', dueDate: futureDate() })
    ).resolves.toBe(1);
  });

  it('accepts no due date at all', async () => {
    await expect(
      teacherService.createTask({ classroomId: 3, teacherId: 7, title: 'X' })
    ).resolves.toBe(1);
  });

  it('rejects a duplicate title in the same classroom', async () => {
    taskRepo.existsDuplicateTitle.mockResolvedValue(true);
    await expect(
      teacherService.createTask({ classroomId: 3, teacherId: 7, title: 'Problem Set 7' })
    ).rejects.toThrow(/already have a task/i);
  });

  it('defaults aiEvaluationEnabled to true when not specified', async () => {
    await teacherService.createTask({ classroomId: 3, teacherId: 7, title: 'X' });
    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ ai_evaluation_enabled: 1 })
    );
  });

  it('serializes allowedFileTypes to JSON', async () => {
    await teacherService.createTask({ classroomId: 3, teacherId: 7, title: 'X', allowedFileTypes: ['pdf'] });
    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ allowed_file_types: JSON.stringify(['pdf']) })
    );
  });
});

describe('teacherService.updateTask — business rules', () => {
  const existingTask = { id: 1, classroom_id: 3, teacher_id: 7, title: 'Problem Set 7' };

  beforeEach(() => {
    taskRepo.belongsToTeacher.mockResolvedValue(existingTask);
    taskRepo.existsDuplicateTitle.mockResolvedValue(false);
  });

  it('throws 404 for a task not owned by this teacher', async () => {
    taskRepo.belongsToTeacher.mockResolvedValue(null);
    await expect(
      teacherService.updateTask({ taskId: 1, teacherId: 7, title: 'New title' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('does not re-check duplicates when the title is unchanged (case-insensitive)', async () => {
    await teacherService.updateTask({ taskId: 1, teacherId: 7, title: 'problem set 7' });
    expect(taskRepo.existsDuplicateTitle).not.toHaveBeenCalled();
  });

  it('checks duplicates when the title actually changes, excluding itself', async () => {
    await teacherService.updateTask({ taskId: 1, teacherId: 7, title: 'Problem Set 9' });
    expect(taskRepo.existsDuplicateTitle).toHaveBeenCalledWith(
      expect.objectContaining({ classroomId: 3, excludeId: 1 })
    );
  });

  it('rejects a past due date on edit', async () => {
    await expect(
      teacherService.updateTask({ taskId: 1, teacherId: 7, dueDate: pastDate() })
    ).rejects.toThrow(/past/i);
    expect(taskRepo.updateById).not.toHaveBeenCalled();
  });
});

describe('teacherService.publishTask / unpublishTask', () => {
  const existingTask = { id: 1, classroom_id: 3, teacher_id: 7, title: 'Problem Set 7' };

  it('publishes when the classroom is active', async () => {
    taskRepo.belongsToTeacher.mockResolvedValue(existingTask);
    classroomRepo.findOwnedById.mockResolvedValue(ACTIVE_CLASSROOM);
    await teacherService.publishTask(1, 7);
    expect(taskRepo.setPublished).toHaveBeenCalledWith(1, true);
  });

  it('refuses to publish when the classroom is archived', async () => {
    taskRepo.belongsToTeacher.mockResolvedValue(existingTask);
    classroomRepo.findOwnedById.mockResolvedValue(ARCHIVED_CLASSROOM);
    await expect(teacherService.publishTask(1, 7)).rejects.toThrow(/archived/i);
    expect(taskRepo.setPublished).not.toHaveBeenCalled();
  });

  it('unpublish does not check classroom archive state', async () => {
    taskRepo.belongsToTeacher.mockResolvedValue(existingTask);
    await teacherService.unpublishTask(1, 7);
    expect(classroomRepo.findOwnedById).not.toHaveBeenCalled();
    expect(taskRepo.setPublished).toHaveBeenCalledWith(1, false);
  });
});

describe('teacherService.deleteTask', () => {
  it('soft-deletes an owned task', async () => {
    taskRepo.belongsToTeacher.mockResolvedValue({ id: 1, classroom_id: 3 });
    await teacherService.deleteTask(1, 7);
    expect(taskRepo.softDelete).toHaveBeenCalledWith(1);
  });

  it('throws 404 for a task not owned (or already deleted)', async () => {
    taskRepo.belongsToTeacher.mockResolvedValue(null);
    await expect(teacherService.deleteTask(1, 7)).rejects.toMatchObject({ statusCode: 404 });
    expect(taskRepo.softDelete).not.toHaveBeenCalled();
  });
});
