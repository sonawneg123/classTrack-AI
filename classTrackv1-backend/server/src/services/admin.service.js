/**
 * server/src/services/admin.service.js
 */
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const { ApiError } = require('../utils/response.util');
const { generateClassCode } = require('../utils/generateCode.util');
const { generateTempPassword } = require('../utils/password.util');
const { hashToken, hoursFromNow } = require('../utils/token.util');
const logger   = require('../utils/logger.util');
const authService = require('./auth.service');

const adminRepo    = require('../repositories/admin.repository');
const teacherRepo  = require('../repositories/teacher.repository');
const classroomRepo = require('../repositories/classroom.repository');
const auditRepo    = require('../repositories/audit.repository');
const teacherRegCodeRepo = require('../repositories/teacherRegistrationCode.repository');

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

/**
 * Full admin dashboard data.
 * Aggregates counts, classroom list, recent audit activity, and alerts.
 * Never exposes passwords, hashes, or tokens.
 */
async function getDashboard() {
  const { counts, classroomRows, activityRows } = await adminRepo.getDashboardData();

  const n = (v) => Number(v ?? 0);

  // ── Overview KPIs ──────────────────────────────────────────────────────────
  const overview = {
    students:    n(counts.student_total),
    teachers:    n(counts.teacher_total),
    classrooms:  n(counts.classroom_total),
    assignments: n(counts.task_total),
    submissions: n(counts.submission_total),
  };

  // ── Teacher breakdown ──────────────────────────────────────────────────────
  const teachers = {
    total:      n(counts.teacher_total),
    active:     n(counts.teacher_active),
    inactive:   n(counts.teacher_inactive),
    unassigned: n(counts.teacher_unassigned),
  };

  // ── Student breakdown ──────────────────────────────────────────────────────
  const students = {
    total:    n(counts.student_total),
    active:   n(counts.student_active),
    inactive: n(counts.student_inactive),
  };

  // ── Classroom breakdown ────────────────────────────────────────────────────
  const classrooms = {
    total:    n(counts.classroom_total),
    active:   n(counts.classroom_active),
    inactive: n(counts.classroom_inactive),
  };

  // ── Evaluation breakdown (uses real submission statuses) ───────────────────
  const evaluations = {
    pending:   n(counts.submission_pending),
    analyzing: n(counts.submission_analyzing),
    completed: n(counts.submission_analyzed),
    failed:    n(counts.submission_failed),
  };

  // ── Classroom list (safe — no hashes or tokens) ────────────────────────────
  const classroomList = classroomRows.map((c) => ({
    id:              c.id,
    name:            c.name,
    subject:         c.subject,
    section:         c.section,
    classCode:       c.class_code,
    isActive:        c.is_active,
    createdAt:       c.created_at,
    teacherId:       c.teacher_id,
    teacherName:     c.teacher_name,
    teacherActive:   c.teacher_is_active,
    studentCount:    n(c.student_count),
    taskCount:       n(c.task_count),
  }));

  // ── Recent activity feed (safe — details JSONB filtered) ──────────────────
  const activity = activityRows.map((row) => {
    // Strip any sensitive keys that might have leaked into details JSONB
    let safeDetails = null;
    if (row.details) {
      const BLOCKED = ['password', 'hash', 'token', 'secret', 'code_hash'];
      safeDetails = Object.fromEntries(
        Object.entries(row.details).filter(([k]) =>
          !BLOCKED.some((b) => k.toLowerCase().includes(b))
        )
      );
    }
    return {
      id:         row.id,
      actorType:  row.actor_type,
      actorId:    row.actor_id,
      actorName:  row.actor_name,
      action:     row.action,
      targetType: row.target_type,
      targetId:   row.target_id,
      details:    safeDetails,
      createdAt:  row.created_at,
    };
  });

  // ── Alerts (derived from counts — no raw data) ────────────────────────────
  const alerts = [];
  if (n(counts.submission_pending) > 0) {
    alerts.push({
      type:    'pending_evaluations',
      message: `${n(counts.submission_pending)} submission(s) waiting for AI evaluation.`,
      count:   n(counts.submission_pending),
    });
  }
  if (n(counts.submission_failed) > 0) {
    alerts.push({
      type:    'failed_evaluations',
      message: `${n(counts.submission_failed)} evaluation(s) failed and may need attention.`,
      count:   n(counts.submission_failed),
    });
  }
  if (n(counts.teacher_unassigned) > 0) {
    alerts.push({
      type:    'unassigned_teachers',
      message: `${n(counts.teacher_unassigned)} teacher(s) not assigned to any classroom.`,
      count:   n(counts.teacher_unassigned),
    });
  }
  if (n(counts.reg_codes_expired) > 0) {
    alerts.push({
      type:    'expired_registration_codes',
      message: `${n(counts.reg_codes_expired)} teacher registration code(s) have expired.`,
      count:   n(counts.reg_codes_expired),
    });
  }

  return { overview, teachers, students, classrooms, evaluations, classroomList, activity, alerts };
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
  const { rows, total } = await teacherRepo.listWithClassroomCount({ limit, offset });
  // Strip sensitive fields from every row
  const safe = rows.map(({ password_hash, failed_login_attempts, locked_until, ...rest }) => rest);
  return { rows: safe, total };
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

// ============================================================================
// Teacher Registration Code management
// ============================================================================

/**
 * Generate a new teacher registration code.
 * Returns the raw code ONCE — it is NEVER stored in plaintext or returned again.
 * The raw code is 8 characters in the format: XXXX-XXXX (readable without ambiguous chars).
 *
 * @param {number} adminId
 * @param {number} [expiresInHours=24]
 */
async function createTeacherRegistrationCode(adminId, { expiresInHours = 24 } = {}) {
  // Generate a cryptographically random 8-char alphanumeric code (unambiguous charset)
  const CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let rawCode = '';
  for (let i = 0; i < 8; i++) {
    rawCode += CHARSET[crypto.randomInt(CHARSET.length)];
  }
  // Human-readable display format: ABCD-1234
  const displayCode = `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`;

  // The stored value is ONLY the SHA-256 hash of the raw 8-char code (without dash)
  const codeHash = hashToken(rawCode);
  const expiresAt = hoursFromNow(expiresInHours);

  const id = await teacherRegCodeRepo.create({
    code_hash:  codeHash,
    created_by: adminId,
    expires_at: expiresAt,
  });

  await auditRepo.insert({
    actorType: 'admin', actorId: adminId,
    action: 'teacher_registration_code_created',
    targetType: 'teacher_registration_code', targetId: id,
    details: { expiresAt: expiresAt.toISOString() },
    // NEVER log rawCode or codeHash
  });

  logger.info('Teacher registration code created', { codeId: id, adminId, expiresAt });

  // Return the display code ONCE — the admin must share this with the teacher
  return {
    id,
    code: displayCode,          // shown once: "ABCD-1234"
    expiresAt: expiresAt.toISOString(),
    status: 'active',
  };
}

/**
 * List all teacher registration codes (admin view).
 * NEVER returns code_hash values.
 */
async function listTeacherRegistrationCodes(query) {
  const { limit, offset } = _pagination(query);
  const { rows, total } = await teacherRegCodeRepo.listAll({ limit, offset });

  const now = new Date();
  const codes = rows.map((row) => ({
    id:            row.id,
    createdBy:     row.created_by,
    createdByName: row.created_by_name,
    expiresAt:     row.expires_at,
    usedAt:        row.used_at,
    usedBy:        row.used_by,
    isRevoked:     row.is_revoked,
    createdAt:     row.created_at,
    status: _codeStatus(row, now),
  }));

  return { codes, total };
}

function _codeStatus(row, now) {
  if (row.is_revoked) return 'revoked';
  if (row.used_at)    return 'used';
  if (new Date(row.expires_at) <= now) return 'expired';
  return 'active';
}

/**
 * Revoke a teacher registration code.
 */
async function revokeTeacherRegistrationCode(codeId, adminId) {
  const code = await teacherRegCodeRepo.findByIdForAdmin(codeId);
  if (!code) throw ApiError.notFound('Registration code not found.');
  if (code.is_revoked) throw ApiError.badRequest('This code has already been revoked.');
  if (code.used_at)    throw ApiError.badRequest('This code has already been used and cannot be revoked.');

  await teacherRegCodeRepo.revoke(codeId);

  await auditRepo.insert({
    actorType: 'admin', actorId: adminId,
    action: 'teacher_registration_code_revoked',
    targetType: 'teacher_registration_code', targetId: codeId,
  });

  logger.info('Teacher registration code revoked', { codeId, adminId });
}

// ============================================================================
// Extended Teacher Management (admin CRUD)
// ============================================================================

async function getTeacher(teacherId) {
  const teacher = await teacherRepo.findWithClassrooms(teacherId);
  if (!teacher) throw ApiError.notFound('Teacher not found.');
  const { password_hash, failed_login_attempts, locked_until, ...safe } = teacher;
  return safe;
}

async function updateTeacher(teacherId, { name, email, mobile }, adminId) {
  const teacher = await teacherRepo.findById(teacherId);
  if (!teacher) throw ApiError.notFound('Teacher not found.');

  const updates = {};
  if (name  !== undefined) updates.name  = name.trim();
  if (email !== undefined) {
    const normalized = email.trim().toLowerCase();
    // Check for email conflict with another teacher
    const existing = await teacherRepo.findByEmail(normalized);
    if (existing && existing.id !== Number(teacherId)) {
      throw ApiError.conflict('A teacher with this email already exists.');
    }
    updates.email = normalized;
  }
  if (mobile !== undefined && mobile !== null && mobile !== '') {
    const { normalizeMobile } = require('../utils/mobile.util');
    const normalized = normalizeMobile(mobile);
    const existing = await teacherRepo.findByMobile(normalized);
    if (existing && existing.id !== Number(teacherId)) {
      throw ApiError.conflict('A teacher with this mobile number already exists.');
    }
    updates.mobile_number = normalized;
  }

  if (Object.keys(updates).length === 0) {
    return { message: 'No fields to update.' };
  }

  updates.updated_at = new Date();
  await teacherRepo.updateById(teacherId, updates);

  await auditRepo.insert({
    actorType: 'admin', actorId: adminId,
    action: 'teacher_updated', targetType: 'teacher', targetId: teacherId,
    details: { fields: Object.keys(updates).filter((k) => k !== 'updated_at') },
  });

  logger.info('Teacher updated', { teacherId, adminId });
  return { message: 'Teacher updated successfully.' };
}

async function setTeacherStatus(teacherId, isActive, adminId) {
  const teacher = await teacherRepo.findById(teacherId);
  if (!teacher) throw ApiError.notFound('Teacher not found.');
  if (teacher.is_active === isActive) {
    return { message: `Teacher is already ${isActive ? 'active' : 'inactive'}.` };
  }

  await teacherRepo.setActive(teacherId, isActive);

  await auditRepo.insert({
    actorType: 'admin', actorId: adminId,
    action: isActive ? 'teacher_activated' : 'teacher_deactivated',
    targetType: 'teacher', targetId: teacherId,
  });

  logger.info(`Teacher ${isActive ? 'activated' : 'deactivated'}`, { teacherId, adminId });
  return { message: `Teacher ${isActive ? 'activated' : 'deactivated'} successfully.` };
}

async function assignTeacherClassroom(teacherId, classroomId, adminId) {
  const teacher  = await teacherRepo.findById(teacherId);
  if (!teacher) throw ApiError.notFound('Teacher not found.');

  const classroom = await classroomRepo.findById(classroomId);
  if (!classroom) throw ApiError.notFound('Classroom not found.');
  if (classroom.deleted_at) throw ApiError.badRequest('That classroom has been deleted.');

  await teacherRepo.assignClassroom(teacherId, classroomId);

  await auditRepo.insert({
    actorType: 'admin', actorId: adminId,
    action: 'teacher_assigned_classroom',
    targetType: 'teacher', targetId: teacherId,
    details: { classroomId },
  });

  logger.info('Teacher assigned to classroom', { teacherId, classroomId, adminId });
  return { message: 'Teacher assigned to classroom successfully.' };
}

async function removeTeacherFromClassroom(teacherId, classroomId, adminId) {
  const teacher  = await teacherRepo.findById(teacherId);
  if (!teacher) throw ApiError.notFound('Teacher not found.');

  const classroom = await classroomRepo.findById(classroomId);
  if (!classroom) throw ApiError.notFound('Classroom not found.');
  if (classroom.teacher_id !== Number(teacherId)) {
    throw ApiError.badRequest('That classroom does not belong to this teacher.');
  }

  await teacherRepo.removeFromClassroom(classroomId);

  await auditRepo.insert({
    actorType: 'admin', actorId: adminId,
    action: 'teacher_removed_from_classroom',
    targetType: 'teacher', targetId: teacherId,
    details: { classroomId },
  });

  logger.info('Teacher removed from classroom', { teacherId, classroomId, adminId });
  return { message: 'Teacher removed from classroom successfully.' };
}

module.exports = {
  getStats, getDashboard,
  createTeacher, listTeachers, getTeacher, updateTeacher,
  toggleTeacherActive, setTeacherStatus,
  resetTeacherPassword, createClassroom, listClassrooms, getAuditLogs,
  createTeacherRegistrationCode, listTeacherRegistrationCodes, revokeTeacherRegistrationCode,
  assignTeacherClassroom, removeTeacherFromClassroom,
};
