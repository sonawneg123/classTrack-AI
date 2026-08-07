/**
 * server/src/services/admin.service.js
 */
const bcrypt   = require('bcryptjs');
const { ApiError } = require('../utils/response.util');
const { generateClassCode } = require('../utils/generateCode.util');
const { generateTempPassword } = require('../utils/password.util');
const logger   = require('../utils/logger.util');
const authService = require('./auth.service');

const adminRepo    = require('../repositories/admin.repository');
const teacherRepo  = require('../repositories/teacher.repository');
const classroomRepo = require('../repositories/classroom.repository');
const auditRepo    = require('../repositories/audit.repository');

function _pagination(query) {
  const limit  = Math.min(Number(query.limit)  || 20, 100);
  const offset = Number(query.offset) || 0;
  return { limit, offset };
}

async function getStats() {
  const stats = await adminRepo.getPlatformStats();
  return {
    teacherCount:    Number(stats.teacherCount),
    classroomCount:  Number(stats.classroomCount),
    studentCount:    Number(stats.studentCount),
    taskCount:       Number(stats.taskCount),
    submissionCount: Number(stats.submissionCount),
    avgScore:        stats.avgScore ? Number(stats.avgScore).toFixed(1) : null,
  };
}

async function createTeacher({ name, email, password }, adminId) {
  const existing = await teacherRepo.findByEmail(email);
  if (existing) throw ApiError.conflict('A teacher with this email already exists.');

  const passwordHash = await bcrypt.hash(password, 10);
  const id = await teacherRepo.create({
    name:          name.trim(),
    email:         email.trim().toLowerCase(),
    password_hash: passwordHash,
    created_by:    adminId,
  });

  // Fire-and-forget: issues a verification token and emails it. Harmless
  // even when config.auth.requireEmailVerification is off — it just means
  // the teacher can log in immediately without clicking the link, but the
  // link is still there and works if they do.
  authService
    .issueEmailVerificationToken({ userId: id, role: 'teacher', email: email.trim().toLowerCase(), name: name.trim() })
    .catch((err) => logger.warn('Could not issue teacher verification email', { teacherId: id, error: err.message }));

  await auditRepo.insert({
    actorType: 'admin', actorId: adminId,
    action: 'teacher_created', targetType: 'teacher', targetId: id,
    details: { name: name.trim(), email: email.trim().toLowerCase() },
  });

  logger.info('Teacher created', { teacherId: id, createdBy: adminId });
  return { id, name: name.trim(), email: email.trim().toLowerCase() };
}

async function listTeachers(query) {
  const { limit, offset } = _pagination(query);
  return teacherRepo.listWithClassroomCount({ limit, offset });
}

async function toggleTeacherActive(teacherId, adminId) {
  const teacher = await teacherRepo.findById(teacherId);
  if (!teacher) throw ApiError.notFound('Teacher not found.');

  await teacherRepo.toggleActive(teacherId);
  await auditRepo.insert({
    actorType: 'admin', actorId: adminId,
    action: 'teacher_active_toggled', targetType: 'teacher', targetId: teacherId,
  });
  logger.info('Teacher active toggled', { teacherId, adminId });
}

async function resetTeacherPassword(teacherId, adminId) {
  const teacher = await teacherRepo.findById(teacherId);
  if (!teacher) throw ApiError.notFound('Teacher not found.');

  const tempPassword = generateTempPassword();
  const hash = await bcrypt.hash(tempPassword, 10);
  await teacherRepo.updatePassword(teacherId, hash);

  await auditRepo.insert({
    actorType: 'admin', actorId: adminId,
    action: 'teacher_password_reset', targetType: 'teacher', targetId: teacherId,
  });

  logger.info('Teacher password reset', { teacherId, adminId });
  return { message: `Password reset for ${teacher.name}.`, tempPassword };
}

async function createClassroom({ name, subject, section, teacherId }, adminId) {
  const teacher = await teacherRepo.findById(teacherId);
  if (!teacher) throw ApiError.notFound('Selected teacher does not exist.');

  const classCode = await generateClassCode(classroomRepo);
  const id = await classroomRepo.create({
    name:       name.trim(),
    subject:    subject || null,
    section:    section || null,
    class_code: classCode,
    teacher_id: teacherId,
    created_by: adminId,
  });

  await auditRepo.insert({
    actorType: 'admin', actorId: adminId,
    action: 'classroom_created', targetType: 'classroom', targetId: id,
    details: { name: name.trim(), classCode, teacherId },
  });

  logger.info('Classroom created', { classroomId: id, classCode, adminId });
  return { id, name: name.trim(), subject, section, classCode, teacherId };
}

async function listClassrooms(query) {
  const { limit, offset } = _pagination(query);
  return classroomRepo.listWithTeacher({ limit, offset });
}

async function getAuditLogs(query) {
  const { limit, offset } = _pagination(query);
  return auditRepo.list({ limit, offset });
}

module.exports = {
  getStats, createTeacher, listTeachers, toggleTeacherActive,
  resetTeacherPassword, createClassroom, listClassrooms, getAuditLogs,
};
