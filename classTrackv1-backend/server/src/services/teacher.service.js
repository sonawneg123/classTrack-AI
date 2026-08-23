/**
 * server/src/services/teacher.service.js
 *
 * All business logic for the teacher role.
 * Controllers call these methods — no SQL, no bcrypt, no file I/O in controllers.
 */
const bcrypt   = require('bcryptjs');
const { ApiError } = require('../utils/response.util');
const { effectiveScore } = require('../utils/scoring.util');
const { generateTempPassword } = require('../utils/password.util');
const { generateClassCode } = require('../utils/generateCode.util');
const logger   = require('../utils/logger.util');

const classroomRepo  = require('../repositories/classroom.repository');
const taskRepo       = require('../repositories/task.repository');
const studentRepo    = require('../repositories/student.repository');
const submissionRepo = require('../repositories/submission.repository');
const auditRepo      = require('../repositories/audit.repository');
const notifRepo      = require('../repositories/notification.repository');

// ---------------------------------------------------------------------------
// Classrooms
// ---------------------------------------------------------------------------
async function getMyClassrooms(teacherId) {
  return classroomRepo.listByTeacher(teacherId);
}

async function _requireOwnedClassroom(classroomId, teacherId) {
  const classroom = await classroomRepo.belongsToTeacher(classroomId, teacherId);
  if (!classroom) throw ApiError.notFound('Classroom not found.');
  return classroom;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
function _assertDueDateNotPast(dueDate) {
  if (!dueDate) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (new Date(dueDate) < today) {
    throw ApiError.badRequest('Due date cannot be in the past.');
  }
}

async function createTask({
  classroomId, teacherId, title, description, instructions, maxScore, dueDate, taskDate,
  aiEvaluationEnabled, allowedFileTypes, lateSubmissionAllowed, maxFileSizeMb,
}) {
  const classroom = await _requireOwnedClassroom(classroomId, teacherId);

  _assertDueDateNotPast(dueDate);

  const isDuplicate = await taskRepo.existsDuplicateTitle({ classroomId: Number(classroomId), title });
  if (isDuplicate) {
    throw ApiError.conflict('You already have a task with this title in this classroom.');
  }

  const taskId = await taskRepo.create({
    classroom_id: Number(classroomId),
    teacher_id:   teacherId,
    title:        title.trim(),
    description:  description  || null,
    instructions: instructions || null,
    max_score:    maxScore     || 100,
    due_date:     dueDate      || null,
    task_date:    taskDate     || null,
    ai_evaluation_enabled: aiEvaluationEnabled === undefined ? 1 : (aiEvaluationEnabled ? 1 : 0),
    allowed_file_types:    allowedFileTypes ? JSON.stringify(allowedFileTypes) : null,
    late_submission_allowed: lateSubmissionAllowed ? 1 : 0,
    max_file_size_mb:        maxFileSizeMb ?? null,
  });

  // Bulk-notify every enrolled student immediately
  const studentIds = await notifRepo.getActiveStudentIds(Number(classroomId));
  await notifRepo.bulkInsertForClassroom(studentIds, {
    classroomId: Number(classroomId),
    taskId,
    type:    'task_posted',
    title:   `New task: ${title.trim()}`,
    message: `${classroom.name} has a new task${dueDate ? ` due ${dueDate}` : ''}.`,
  });

  logger.info('Task created, students notified', { taskId, classroomId, studentCount: studentIds.length });
  return taskId;
}

async function updateTask({
  taskId, teacherId, title, description, instructions, maxScore, dueDate, taskDate,
  aiEvaluationEnabled, allowedFileTypes, lateSubmissionAllowed, maxFileSizeMb,
}) {
  const task = await taskRepo.belongsToTeacher(taskId, teacherId);
  if (!task) throw ApiError.notFound('Task not found.');

  if (dueDate !== undefined) _assertDueDateNotPast(dueDate);

  if (title !== undefined && title.trim().toLowerCase() !== task.title.toLowerCase()) {
    const isDuplicate = await taskRepo.existsDuplicateTitle({
      classroomId: task.classroom_id, title, excludeId: taskId,
    });
    if (isDuplicate) {
      throw ApiError.conflict('You already have a task with this title in this classroom.');
    }
  }

  const updates = {};
  if (title        !== undefined) updates.title        = title.trim();
  if (description   !== undefined) updates.description  = description;
  if (instructions  !== undefined) updates.instructions = instructions;
  if (maxScore      !== undefined) updates.max_score    = maxScore;
  if (dueDate       !== undefined) updates.due_date     = dueDate || null;
  if (taskDate      !== undefined) updates.task_date    = taskDate || null;
  if (aiEvaluationEnabled !== undefined) updates.ai_evaluation_enabled = aiEvaluationEnabled ? 1 : 0;
  if (allowedFileTypes    !== undefined) updates.allowed_file_types = allowedFileTypes ? JSON.stringify(allowedFileTypes) : null;
  if (lateSubmissionAllowed !== undefined) updates.late_submission_allowed = lateSubmissionAllowed ? 1 : 0;
  if (maxFileSizeMb        !== undefined) updates.max_file_size_mb = maxFileSizeMb;

  if (Object.keys(updates).length > 0) {
    await taskRepo.updateById(taskId, updates);
  }
  logger.info('Task updated', { taskId, teacherId });
}

async function toggleTaskActive(taskId, teacherId) {
  const task = await taskRepo.belongsToTeacher(taskId, teacherId);
  if (!task) throw ApiError.notFound('Task not found.');
  await taskRepo.toggleActive(taskId);
  logger.info('Task visibility toggled', { taskId, teacherId });
}

async function getClassroomTasks(classroomId, teacherId) {
  await _requireOwnedClassroom(classroomId, teacherId);
  return taskRepo.listByClassroomForTeacher(classroomId);
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------
async function getTaskSubmissions(taskId, teacherId) {
  const task = await taskRepo.belongsToTeacher(taskId, teacherId);
  if (!task) throw ApiError.notFound('Task not found.');

  const students    = await studentRepo.listByClassroom(task.classroom_id);
  const submissions = await submissionRepo.listByTask(taskId);

  const byStudent = {};
  submissions.forEach((s) => {
    s.effective_score = effectiveScore(s);
    byStudent[s.student_id] = s;
  });

  return { task, roster: students.map((s) => ({ student: s, submission: byStudent[s.id] || null })) };
}

async function getSubmissionHistory(submissionId, teacherId) {
  const sub = await submissionRepo.belongsToTeacherClassroom(submissionId, teacherId);
  if (!sub) throw ApiError.notFound('Submission not found.');
  return submissionRepo.getVersionHistory(submissionId);
}

async function overrideScore({ submissionId, teacherId, teacherScore, teacherFeedback }) {
  const sub = await submissionRepo.belongsToTeacherClassroom(submissionId, teacherId);
  if (!sub) throw ApiError.notFound('Submission not found.');

  if (teacherScore !== null && teacherScore !== undefined) {
    const score = Number(teacherScore);
    if (Number.isNaN(score) || score < 0 || score > sub.max_score) {
      throw ApiError.badRequest(`Score must be between 0 and ${sub.max_score}.`);
    }
  }

  await submissionRepo.overrideScore(submissionId, teacherId, teacherScore ?? null, teacherFeedback);

  await notifRepo.insertOne({
    recipientType: 'student', recipientId: sub.student_id, taskId: sub.task_id,
    type:    'score_overridden',
    title:   'Your teacher reviewed your grade',
    message: teacherFeedback || 'Your teacher added a note to your submission.',
  });

  await auditRepo.insert({
    actorType: 'teacher', actorId: teacherId,
    action: 'score_overridden', targetType: 'submission', targetId: submissionId,
    details: { teacherScore },
  });

  logger.info('Score overridden', { submissionId, teacherId, teacherScore });
}

// ---------------------------------------------------------------------------
// Student password reset
// ---------------------------------------------------------------------------
async function resetStudentPassword(studentId, teacherId) {
  const [rows] = await require('../database/connection').pool.query(
    `SELECT s.id, s.name FROM students s
     JOIN classrooms c ON c.id = s.classroom_id
     WHERE s.id = ? AND c.teacher_id = ?`,
    [studentId, teacherId]
  );
  if (!rows.length) throw ApiError.notFound('Student not found in your classrooms.');

  const tempPassword = generateTempPassword();
  const hash = await bcrypt.hash(tempPassword, 10);
  await studentRepo.updatePassword(studentId, hash);

  await auditRepo.insert({
    actorType: 'teacher', actorId: teacherId,
    action: 'student_password_reset', targetType: 'student', targetId: studentId,
  });

  logger.info('Student password reset by teacher', { studentId, teacherId });
  return { message: `Password reset for ${rows[0].name}.`, tempPassword };
}

// ---------------------------------------------------------------------------
// Report data builder (shared by PDF + CSV services)
// ---------------------------------------------------------------------------
async function buildClassroomReportData(classroomId, teacherId) {
  const classroom = await _requireOwnedClassroom(classroomId, teacherId);
  const { pool } = require('../database/connection');

  const [tasks]    = await pool.query('SELECT * FROM tasks WHERE classroom_id = ? ORDER BY task_date', [classroomId]);
  const [students] = await pool.query('SELECT * FROM students WHERE classroom_id = ? ORDER BY name', [classroomId]);
  const subs       = await submissionRepo.listForClassroom(classroomId);

  const studentRows = students.map((student) => {
    const submissions = {};
    subs.filter((s) => s.student_id === student.id).forEach((s) => (submissions[s.task_id] = s));
    return { student, submissions };
  });

  return { classroom, tasks, studentRows };
}

module.exports = {
  getMyClassrooms, createTask, updateTask, toggleTaskActive, getClassroomTasks,
  getTaskSubmissions, getSubmissionHistory, overrideScore,
  resetStudentPassword, buildClassroomReportData,
  getDashboardStats, listClassroomsManaged, getClassroomDetails,
  createClassroom, updateClassroom, archiveClassroom, restoreClassroom,
  deleteClassroom, regenerateJoinCode,
  listTasksManaged, getTaskDetails, deleteTask, publishTask, unpublishTask,
  archiveTask, restoreTask, duplicateTask,
  getGradingOverview,
};

// ---------------------------------------------------------------------------
// Task management (flat /teacher/tasks resource)
// ---------------------------------------------------------------------------

async function listTasksManaged(teacherId, query) {
  const page   = Number(query.page)  || 1;
  const limit  = Number(query.limit) || 20;
  const offset = (page - 1) * limit;

  const { rows, total } = await taskRepo.listByTeacherManaged({
    teacherId,
    limit,
    offset,
    search:      query.search || null,
    status:      query.status || 'all',
    classroomId: query.classroomId || null,
    sortBy:      query.sortBy || 'createdAt',
    sortDir:     query.sortDir || 'desc',
  });

  return {
    tasks: rows.map((r) => ({
      id: r.id, classroomId: r.classroom_id, classroomName: r.classroom_name,
      title: r.title, description: r.description, instructions: r.instructions,
      maxScore: Number(r.max_score), dueDate: r.due_date, taskDate: r.task_date,
      isPublished: Boolean(r.is_active), aiEvaluationEnabled: Boolean(r.ai_evaluation_enabled),
      allowedFileTypes: r.allowed_file_types || null, createdAt: r.created_at,
      lateSubmissionAllowed: Boolean(r.late_submission_allowed), maxFileSizeMb: r.max_file_size_mb,
      isArchived: Boolean(r.archived_at),
      submissionCount: Number(r.submission_count),
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

async function getTaskDetails(taskId, teacherId) {
  const task = await taskRepo.belongsToTeacher(taskId, teacherId);
  if (!task) throw ApiError.notFound('Task not found.');
  return {
    id: task.id, classroomId: task.classroom_id, title: task.title,
    description: task.description, instructions: task.instructions,
    maxScore: Number(task.max_score), dueDate: task.due_date, taskDate: task.task_date,
    isPublished: Boolean(task.is_active), aiEvaluationEnabled: Boolean(task.ai_evaluation_enabled),
    allowedFileTypes: task.allowed_file_types || null, createdAt: task.created_at,
    lateSubmissionAllowed: Boolean(task.late_submission_allowed), maxFileSizeMb: task.max_file_size_mb,
    isArchived: Boolean(task.archived_at),
  };
}

async function deleteTask(taskId, teacherId) {
  const task = await taskRepo.belongsToTeacher(taskId, teacherId);
  if (!task) throw ApiError.notFound('Task not found.');

  await taskRepo.softDelete(taskId);
  await auditRepo.insert({
    actorType: 'teacher', actorId: teacherId,
    action: 'task_deleted', targetType: 'task', targetId: taskId,
  });
  logger.info('Task soft-deleted', { taskId, teacherId });
}

async function publishTask(taskId, teacherId) {
  const task = await taskRepo.belongsToTeacher(taskId, teacherId);
  if (!task) throw ApiError.notFound('Task not found.');
  if (task.archived_at) throw ApiError.badRequest('Cannot publish an archived task. Restore it first.');

  const classroom = await classroomRepo.findOwnedById(task.classroom_id, teacherId);
  if (!classroom || !classroom.is_active) {
    throw ApiError.badRequest('Cannot publish a task in an archived classroom.');
  }

  await taskRepo.setPublished(taskId, true);
  await auditRepo.insert({
    actorType: 'teacher', actorId: teacherId,
    action: 'task_published', targetType: 'task', targetId: taskId,
  });
  logger.info('Task published', { taskId, teacherId });
}

async function unpublishTask(taskId, teacherId) {
  const task = await taskRepo.belongsToTeacher(taskId, teacherId);
  if (!task) throw ApiError.notFound('Task not found.');

  await taskRepo.setPublished(taskId, false);
  await auditRepo.insert({
    actorType: 'teacher', actorId: teacherId,
    action: 'task_unpublished', targetType: 'task', targetId: taskId,
  });
  logger.info('Task unpublished', { taskId, teacherId });
}

/** Archive is independent of publish/delete — an archived task is filed
 *  away (hidden from students and the default list) but not deleted. */
async function archiveTask(taskId, teacherId) {
  const task = await taskRepo.belongsToTeacher(taskId, teacherId);
  if (!task) throw ApiError.notFound('Task not found.');
  if (task.archived_at) throw ApiError.badRequest('Task is already archived.');

  await taskRepo.archive(taskId);
  await auditRepo.insert({
    actorType: 'teacher', actorId: teacherId,
    action: 'task_archived', targetType: 'task', targetId: taskId,
  });
  logger.info('Task archived', { taskId, teacherId });
}

async function restoreTask(taskId, teacherId) {
  const task = await taskRepo.belongsToTeacher(taskId, teacherId);
  if (!task) throw ApiError.notFound('Task not found.');
  if (!task.archived_at) throw ApiError.badRequest('Task is not archived.');

  await taskRepo.restore(taskId);
  await auditRepo.insert({
    actorType: 'teacher', actorId: teacherId,
    action: 'task_restored', targetType: 'task', targetId: taskId,
  });
  logger.info('Task restored', { taskId, teacherId });
}

/** Duplicate creates a brand-new draft (unpublished) task in the same
 *  classroom, copying every configurable field. Does NOT notify students
 *  (createTask's notification is specific to genuinely new assignments;
 *  a duplicate starts as a draft, so nothing is visible to notify about
 *  yet — the teacher publishes it separately when ready). */
async function duplicateTask(taskId, teacherId) {
  const task = await taskRepo.belongsToTeacher(taskId, teacherId);
  if (!task) throw ApiError.notFound('Task not found.');

  let copyTitle = `${task.title} (Copy)`;
  if (await taskRepo.existsDuplicateTitle({ classroomId: task.classroom_id, title: copyTitle })) {
    throw ApiError.conflict(`"${copyTitle}" already exists in this classroom — rename the original or an existing copy first.`);
  }

  const newTaskId = await taskRepo.create({
    classroom_id: task.classroom_id,
    teacher_id:   teacherId,
    title:        copyTitle,
    description:  task.description,
    instructions: task.instructions,
    max_score:    task.max_score,
    due_date:     null, // a copy's due date is deliberately not carried over
    task_date:    null,
    is_active:    0,    // always starts as an unpublished draft
    ai_evaluation_enabled:   task.ai_evaluation_enabled,
    allowed_file_types:      task.allowed_file_types ? JSON.stringify(task.allowed_file_types) : null,
    late_submission_allowed: task.late_submission_allowed,
    max_file_size_mb:        task.max_file_size_mb,
  });

  await auditRepo.insert({
    actorType: 'teacher', actorId: teacherId,
    action: 'task_duplicated', targetType: 'task', targetId: newTaskId,
    details: { sourceTaskId: taskId },
  });
  logger.info('Task duplicated', { sourceTaskId: taskId, newTaskId, teacherId });
  return newTaskId;
}

// ---------------------------------------------------------------------------
// Teacher dashboard
// ---------------------------------------------------------------------------

async function getDashboardStats(teacherId) {
  const [stats, recentActivity] = await Promise.all([
    classroomRepo.getTeacherDashboardStats(teacherId),
    classroomRepo.getRecentActivity(teacherId, 10),
  ]);
  return { ...stats, recentActivity };
}

// ---------------------------------------------------------------------------
// Classroom management
// ---------------------------------------------------------------------------

/** Ownership check for the new management endpoints — unlike
 *  _requireOwnedClassroom (above, relied on by existing task functions and
 *  left untouched), this one excludes soft-deleted classrooms via
 *  findOwnedById, so a deleted classroom can never be edited/archived/
 *  restored/regenerated again. */
async function _requireOwnedActiveClassroom(classroomId, teacherId) {
  const classroom = await classroomRepo.findOwnedById(classroomId, teacherId);
  if (!classroom) throw ApiError.notFound('Classroom not found.');
  return classroom;
}

function _validateClassroomFields({ name, subject, section }) {
  const errors = [];
  if (name !== undefined && !name.trim()) errors.push('Classroom name cannot be blank.');
  if (errors.length) throw ApiError.badRequest('Validation failed.', errors);
}

async function listClassroomsManaged(teacherId, query) {
  const page   = Number(query.page)  || 1;
  const limit  = Number(query.limit) || 20;
  const offset = (page - 1) * limit;

  const { rows, total } = await classroomRepo.listByTeacherManaged({
    teacherId,
    limit,
    offset,
    search:  query.search || null,
    status:  query.status || 'active',
    sortBy:  query.sortBy || 'createdAt',
    sortDir: query.sortDir || 'desc',
  });

  return {
    classrooms: rows.map((r) => ({
      id: r.id, name: r.name, subject: r.subject, section: r.section,
      classCode: r.class_code, isActive: Boolean(r.is_active), createdAt: r.created_at,
      studentCount: Number(r.student_count), taskCount: Number(r.task_count),
      latestActivityAt: r.latest_activity_at,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

async function getClassroomDetails(classroomId, teacherId) {
  const classroom = await _requireOwnedActiveClassroom(classroomId, teacherId);
  const [studentCount, taskCount] = await Promise.all([
    studentRepo.countBy('classroom_id', classroomId),
    taskRepo.countBy('classroom_id', classroomId),
  ]);
  return {
    id: classroom.id, name: classroom.name, subject: classroom.subject, section: classroom.section,
    classCode: classroom.class_code, isActive: Boolean(classroom.is_active), createdAt: classroom.created_at,
    studentCount, taskCount,
  };
}

async function createClassroom({ name, subject, section, teacherId }) {
  _validateClassroomFields({ name, subject, section });

  const isDuplicate = await classroomRepo.existsDuplicate({ teacherId, name, section });
  if (isDuplicate) {
    throw ApiError.conflict('You already have a classroom with this name and section.');
  }

  const classCode = await generateClassCode(classroomRepo);
  const id = await classroomRepo.create({
    name: name.trim(),
    subject: subject || null,
    section: section || null,
    class_code: classCode,
    teacher_id: teacherId,
    created_by: teacherId,
  });

  await auditRepo.insert({
    actorType: 'teacher', actorId: teacherId,
    action: 'classroom_created', targetType: 'classroom', targetId: id,
    details: { name: name.trim(), classCode },
  });

  logger.info('Classroom created', { classroomId: id, classCode, teacherId });
  return { id, name: name.trim(), subject: subject || null, section: section || null, classCode };
}

async function updateClassroom({ classroomId, teacherId, name, subject, section }) {
  const classroom = await _requireOwnedActiveClassroom(classroomId, teacherId);
  _validateClassroomFields({ name, subject, section });

  const nextName    = name !== undefined ? name.trim() : classroom.name;
  const nextSection = section !== undefined ? section : classroom.section;

  if (name !== undefined || section !== undefined) {
    const isDuplicate = await classroomRepo.existsDuplicate({
      teacherId, name: nextName, section: nextSection, excludeId: classroomId,
    });
    if (isDuplicate) {
      throw ApiError.conflict('You already have a classroom with this name and section.');
    }
  }

  const patch = {};
  if (name !== undefined)    patch.name = nextName;
  if (subject !== undefined) patch.subject = subject || null;
  if (section !== undefined) patch.section = section || null;

  if (Object.keys(patch).length > 0) {
    await classroomRepo.updateFields(classroomId, patch);
    await auditRepo.insert({
      actorType: 'teacher', actorId: teacherId,
      action: 'classroom_updated', targetType: 'classroom', targetId: classroomId,
      details: patch,
    });
  }

  logger.info('Classroom updated', { classroomId, teacherId });
}

async function archiveClassroom(classroomId, teacherId) {
  const classroom = await _requireOwnedActiveClassroom(classroomId, teacherId);
  if (!classroom.is_active) throw ApiError.badRequest('Classroom is already archived.');

  await classroomRepo.archive(classroomId);
  await auditRepo.insert({
    actorType: 'teacher', actorId: teacherId,
    action: 'classroom_archived', targetType: 'classroom', targetId: classroomId,
  });
  logger.info('Classroom archived', { classroomId, teacherId });
}

async function restoreClassroom(classroomId, teacherId) {
  const classroom = await _requireOwnedActiveClassroom(classroomId, teacherId);
  if (classroom.is_active) throw ApiError.badRequest('Classroom is not archived.');

  await classroomRepo.restore(classroomId);
  await auditRepo.insert({
    actorType: 'teacher', actorId: teacherId,
    action: 'classroom_restored', targetType: 'classroom', targetId: classroomId,
  });
  logger.info('Classroom restored', { classroomId, teacherId });
}

/** Soft delete only — the row is kept, `deleted_at` is set, and it's
 *  excluded from every teacher-facing query from that point on. There is
 *  no un-delete; that's what distinguishes it from archive/restore. */
async function deleteClassroom(classroomId, teacherId) {
  await _requireOwnedActiveClassroom(classroomId, teacherId);

  await classroomRepo.softDelete(classroomId);
  await auditRepo.insert({
    actorType: 'teacher', actorId: teacherId,
    action: 'classroom_deleted', targetType: 'classroom', targetId: classroomId,
  });
  logger.info('Classroom soft-deleted', { classroomId, teacherId });
}

async function regenerateJoinCode(classroomId, teacherId) {
  await _requireOwnedActiveClassroom(classroomId, teacherId);

  const classCode = await generateClassCode(classroomRepo);
  await classroomRepo.regenerateCode(classroomId, classCode);
  await auditRepo.insert({
    actorType: 'teacher', actorId: teacherId,
    action: 'classroom_code_regenerated', targetType: 'classroom', targetId: classroomId,
    details: { classCode },
  });
  logger.info('Classroom join code regenerated', { classroomId, teacherId });
  return { classCode };
}

// ---------------------------------------------------------------------------
// Grading overview
// ---------------------------------------------------------------------------

/**
 * Returns an aggregated grading overview for one classroom.
 *
 * Authorization:
 *   - Teacher must own the classroom (findOwnedById excludes deleted classrooms).
 *   - Deleted classrooms → 404 (same as all other /manage/:id endpoints).
 *
 * Score precedence: teacher_score wins over ai_score — COALESCE(teacher_score, ai_score).
 * This matches effectiveScore() in scoring.util.js.
 *
 * Evaluations state:
 *   "evaluated" = status='analyzed' OR teacher_score IS NOT NULL
 *   "pending"   = any submission not yet evaluated
 *
 * Response shape (all numeric counts are Number, avgScore is Number|null):
 * {
 *   summary: { classroomId, classroomName, subject, section, classCode, isActive,
 *              studentCount, taskCount, totalSubmissions, evaluatedCount,
 *              pendingCount, avgScore },
 *   tasks:   [{ taskId, title, dueDate, maxScore, isPublished, isArchived,
 *               studentCount, submittedCount, evaluatedCount, pendingCount,
 *               avgScore, completionPct }],
 *   students:[{ studentId, name, username, taskCount, submittedCount,
 *               evaluatedCount, pendingCount, avgScore }]
 * }
 */
async function getGradingOverview(classroomId, teacherId) {
  // Ownership + deleted-classroom guard (same helper as all other manage endpoints)
  await _requireOwnedActiveClassroom(classroomId, teacherId);

  const { summary, tasks, students } = await classroomRepo.getGradingOverview(classroomId);

  const totalStudents = Number(summary.student_count);

  return {
    summary: {
      classroomId:      Number(summary.classroom_id),
      classroomName:    summary.classroom_name,
      subject:          summary.subject || null,
      section:          summary.section || null,
      classCode:        summary.class_code,
      isActive:         Boolean(summary.is_active),
      studentCount:     totalStudents,
      taskCount:        Number(summary.task_count),
      totalSubmissions: Number(summary.total_submissions),
      evaluatedCount:   Number(summary.evaluated_count),
      pendingCount:     Number(summary.pending_count),
      avgScore:         summary.avg_score !== null && summary.avg_score !== undefined
                          ? Number(Number(summary.avg_score).toFixed(2))
                          : null,
    },
    tasks: tasks.map((t) => {
      const submittedCount = Number(t.submitted_count);
      const studentCount   = Number(t.student_count);
      return {
        taskId:          Number(t.task_id),
        title:           t.title,
        dueDate:         t.due_date || null,
        maxScore:        Number(t.max_score),
        isPublished:     Boolean(t.is_active),
        isArchived:      Boolean(t.archived_at),
        studentCount,
        submittedCount,
        evaluatedCount:  Number(t.evaluated_count),
        pendingCount:    Number(t.pending_count),
        avgScore:        t.avg_score !== null && t.avg_score !== undefined
                           ? Number(Number(t.avg_score).toFixed(2))
                           : null,
        completionPct:   studentCount > 0
                           ? Number(((submittedCount / studentCount) * 100).toFixed(1))
                           : 0,
      };
    }),
    students: students.map((s) => ({
      studentId:      Number(s.student_id),
      name:           s.name,
      username:       s.username,
      taskCount:      Number(s.task_count),
      submittedCount: Number(s.submitted_count),
      evaluatedCount: Number(s.evaluated_count),
      pendingCount:   Number(s.pending_count),
      avgScore:       s.avg_score !== null && s.avg_score !== undefined
                        ? Number(Number(s.avg_score).toFixed(2))
                        : null,
    })),
  };
}
