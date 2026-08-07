/**
 * server/src/services/auth.service.js
 *
 * Business logic for authentication.
 * Controllers call these methods and return the results — they do not
 * contain any auth logic themselves.
 *
 * BACKWARD COMPATIBILITY NOTE: adminLogin / teacherLogin / studentLogin /
 * studentRegister / changeOwnPassword all keep their original parameter
 * shapes and their original return fields (`token`, `user`). This version
 * adds new fields to the returned object (`accessToken`, `refreshToken`,
 * `permissions`) and new optional input fields (`ipAddress`, `userAgent`)
 * — nothing existing was removed or renamed, so the pre-v1 /api/auth
 * routes and their controller (which just forwards the whole result
 * object as `data`) continue to work completely unchanged. `token` is now
 * simply an alias for `accessToken`, kept so any code reading `result.token`
 * (including the legacy frontend) still works.
 */
const bcrypt  = require('bcryptjs');
const config  = require('../config');
const { ApiError } = require('../utils/response.util');
const jwt     = require('../utils/jwt.util');
const tokenService = require('./token.service');
const emailService = require('./email.service');
const { generateRawToken, hashToken, minutesFromNow, hoursFromNow } = require('../utils/token.util');
const { isValidUsername } = require('../utils/username.util');
const logger  = require('../utils/logger.util');

// Repositories
const adminRepo    = require('../repositories/admin.repository');
const teacherRepo  = require('../repositories/teacher.repository');
const studentRepo  = require('../repositories/student.repository');
const classroomRepo = require('../repositories/classroom.repository');
const auditRepo    = require('../repositories/audit.repository');
const loginHistoryRepo = require('../repositories/loginHistory.repository');
const emailVerificationRepo = require('../repositories/emailVerificationToken.repository');
const passwordResetRepo = require('../repositories/passwordResetToken.repository');

const REPO_BY_ROLE = { admin: adminRepo, teacher: teacherRepo, student: studentRepo };

// --------------------------------------------------------------------------
// Internal helpers
// --------------------------------------------------------------------------
async function _hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

async function _comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

async function _recordFailedAttempt({ repo, account, role, identifier, failureReason, ipAddress, userAgent }) {
  await loginHistoryRepo.record({
    userId: account?.id, userRole: role, identifier, success: false,
    failureReason, ipAddress, userAgent,
  });

  if (!account) return; // unknown identifier — nothing to lock

  const attempts = await repo.incrementFailedAttempts(account.id);
  if (attempts >= config.auth.maxFailedLoginAttempts) {
    const until = minutesFromNow(config.auth.lockoutDurationMinutes);
    await repo.lockUntil(account.id, until);
    await auditRepo.insert({
      actorType: 'system', actorId: account.id,
      action: 'account_locked', targetType: role, targetId: account.id,
      details: { attempts, lockedUntil: until.toISOString() },
    });
    logger.warn('Account locked after repeated failed logins', { role, accountId: account.id, attempts });
  }
}

async function _recordSuccessfulAttempt({ repo, account, role, identifier, ipAddress, userAgent }) {
  await repo.resetFailedAttempts(account.id);
  await repo.updateLastLogin(account.id);
  await loginHistoryRepo.record({
    userId: account.id, userRole: role, identifier, success: true, ipAddress, userAgent,
  });
  await auditRepo.insert({ actorType: role, actorId: account.id, action: 'login_success' });
}

/**
 * Shared login flow for admin & teacher (both authenticate by email and
 * carry email_verified_at / lockout columns). Student login has its own
 * function below since it authenticates by username with no email column.
 */
async function _emailBasedLogin({ role, repo, email, password, ipAddress, userAgent }) {
  const identifier = email.trim().toLowerCase();
  const account = await repo.findByEmail(email);

  if (account && repo.isCurrentlyLocked(account)) {
    await loginHistoryRepo.record({ userId: account.id, userRole: role, identifier, success: false, failureReason: 'account_locked', ipAddress, userAgent });
    throw ApiError.forbidden(`Too many failed login attempts. Try again after ${new Date(account.locked_until).toLocaleTimeString()}.`);
  }

  if (!account || ('is_active' in account && !account.is_active) || !(await _comparePassword(password, account.password_hash))) {
    await _recordFailedAttempt({
      repo, account, role, identifier,
      failureReason: !account ? 'invalid_credentials' : (!account.is_active ? 'account_disabled' : 'invalid_credentials'),
      ipAddress, userAgent,
    });
    throw ApiError.unauthorized('Invalid email or password.');
  }

  if (config.auth.requireEmailVerification && !account.email_verified_at) {
    await loginHistoryRepo.record({ userId: account.id, userRole: role, identifier, success: false, failureReason: 'email_not_verified', ipAddress, userAgent });
    throw ApiError.forbidden('Please verify your email address before logging in. Check your inbox for the verification link.');
  }

  await _recordSuccessfulAttempt({ repo, account, role, identifier, ipAddress, userAgent });

  const { accessToken, refreshToken, permissions } = await tokenService.issueTokenPair(
    { id: account.id, role, name: account.name }, { ipAddress, userAgent }
  );

  logger.info(`${role} login`, { accountId: account.id });
  return {
    token: accessToken, accessToken, refreshToken, permissions,
    user: { id: account.id, name: account.name, email: account.email, role },
  };
}

// --------------------------------------------------------------------------
// Admin login
// --------------------------------------------------------------------------
async function adminLogin({ email, password, ipAddress, userAgent }) {
  return _emailBasedLogin({ role: 'admin', repo: adminRepo, email, password, ipAddress, userAgent });
}

// --------------------------------------------------------------------------
// Teacher login
// --------------------------------------------------------------------------
async function teacherLogin({ email, password, ipAddress, userAgent }) {
  return _emailBasedLogin({ role: 'teacher', repo: teacherRepo, email, password, ipAddress, userAgent });
}

// --------------------------------------------------------------------------
// Student register
// --------------------------------------------------------------------------
async function studentRegister({ username, name, classCode, password }) {
  if (!isValidUsername(username)) {
    throw ApiError.badRequest(
      'Username must be 3-30 characters and can only contain letters, numbers, underscores, and periods.'
    );
  }

  const classroom = await classroomRepo.findByCode(classCode);
  if (!classroom || !classroom.is_active) {
    throw ApiError.notFound('No classroom found with that code. Double-check it with your teacher.');
  }

  if (await studentRepo.existsByUsername(username)) {
    throw ApiError.conflict('That username is already taken. Please choose another.');
  }

  const passwordHash = await _hashPassword(password);
  const id = await studentRepo.create({
    username:      username.trim().toLowerCase(),
    name:          name.trim(),
    password_hash: passwordHash,
    classroom_id:  classroom.id,
  });

  await auditRepo.insert({
    actorType: 'student', actorId: id,
    action: 'student_registered', targetType: 'classroom', targetId: classroom.id,
  });

  const { accessToken, refreshToken, permissions } = await tokenService.issueTokenPair(
    { id, role: 'student', name: name.trim(), classroomId: classroom.id }
  );

  logger.info('Student registered', { studentId: id, classroomId: classroom.id });
  return {
    token: accessToken, accessToken, refreshToken, permissions,
    user: { id, username: username.trim().toLowerCase(), name: name.trim(), role: 'student',
            classroomId: classroom.id, classroomName: classroom.name },
  };
}

// --------------------------------------------------------------------------
// Student login (username + password — no email column on this role)
// --------------------------------------------------------------------------
async function studentLogin({ username, password, ipAddress, userAgent }) {
  const identifier = username.trim().toLowerCase();
  const student = await studentRepo.findByUsername(username);

  if (student && studentRepo.isCurrentlyLocked(student)) {
    await loginHistoryRepo.record({ userId: student.id, userRole: 'student', identifier, success: false, failureReason: 'account_locked', ipAddress, userAgent });
    throw ApiError.forbidden(`Too many failed login attempts. Try again after ${new Date(student.locked_until).toLocaleTimeString()}.`);
  }

  if (!student || !student.is_active || !(await _comparePassword(password, student.password_hash))) {
    await _recordFailedAttempt({
      repo: studentRepo, account: student, role: 'student', identifier,
      failureReason: !student ? 'invalid_credentials' : (!student.is_active ? 'account_disabled' : 'invalid_credentials'),
      ipAddress, userAgent,
    });
    throw ApiError.unauthorized('Invalid username or password.');
  }

  await _recordSuccessfulAttempt({ repo: studentRepo, account: student, role: 'student', identifier, ipAddress, userAgent });

  const { accessToken, refreshToken, permissions } = await tokenService.issueTokenPair(
    { id: student.id, role: 'student', name: student.name, classroomId: student.classroom_id },
    { ipAddress, userAgent }
  );

  logger.info('Student login', { studentId: student.id });
  return {
    token: accessToken, accessToken, refreshToken, permissions,
    user: {
      id: student.id, username: student.username, name: student.name, role: 'student',
      classroomId: student.classroom_id, classroomName: student.classroom_name,
    },
  };
}

// --------------------------------------------------------------------------
// Self-service change password (any role) — unchanged signature/behavior,
// now also revokes every refresh token for the account (forces re-login on
// all other devices once the password changes, standard security practice).
// --------------------------------------------------------------------------
async function changeOwnPassword({ userId, role, currentPassword, newPassword }) {
  const repo = REPO_BY_ROLE[role];
  const account = await repo.findById(userId);

  if (!account || !(await _comparePassword(currentPassword, account.password_hash))) {
    throw ApiError.unauthorized('Current password is incorrect.');
  }

  const newHash = await _hashPassword(newPassword);
  await repo.updateById(userId, { password_hash: newHash });
  await tokenService.revokeAllSessions(userId, role);

  await auditRepo.insert({ actorType: role, actorId: userId, action: 'password_changed_self' });
  logger.info('Password changed', { userId, role });
  return { message: 'Password updated. You have been logged out of all other devices.' };
}

// ============================================================================
// NEW: Refresh token flow
// ============================================================================
async function refreshSession({ refreshToken, ipAddress, userAgent }) {
  if (!refreshToken) throw ApiError.badRequest('Refresh token is required.');

  const accountLookup = async (id, role) => REPO_BY_ROLE[role].findById(id);
  return tokenService.refreshTokenPair(refreshToken, { ipAddress, userAgent, accountLookup });
}

async function logout({ refreshToken, userId, role }) {
  if (refreshToken) await tokenService.revokeRefreshToken(refreshToken);
  await auditRepo.insert({ actorType: role, actorId: userId, action: 'logout' });
  return { message: 'Logged out.' };
}

async function logoutAllSessions({ userId, role }) {
  await tokenService.revokeAllSessions(userId, role);
  await auditRepo.insert({ actorType: role, actorId: userId, action: 'logout_all' });
  return { message: 'Logged out of all devices.' };
}

// ============================================================================
// NEW: Email verification (admin & teacher only — students have no email)
// ============================================================================
async function issueEmailVerificationToken({ userId, role, email, name }) {
  if (role === 'student') return; // no-op — students have no email on file

  const rawToken = generateRawToken(32);
  await emailVerificationRepo.invalidateAllForUser(userId, role);
  await emailVerificationRepo.insert({
    userId, userRole: role, tokenHash: hashToken(rawToken),
    expiresAt: hoursFromNow(config.auth.emailVerificationExpiresInHours),
  });
  await emailService.sendVerificationEmail(email, name, rawToken);
  logger.info('Email verification token issued', { userId, role });
}

async function verifyEmail({ token }) {
  const record = await emailVerificationRepo.findValidByHash(hashToken(token));
  if (!record) throw ApiError.badRequest('This verification link is invalid or has expired.');

  await emailVerificationRepo.markUsed(record.id);
  await REPO_BY_ROLE[record.user_role].markEmailVerified(record.user_id);
  await auditRepo.insert({ actorType: record.user_role, actorId: record.user_id, action: 'email_verified' });

  logger.info('Email verified', { userId: record.user_id, role: record.user_role });
  return { message: 'Email verified successfully. You can now log in.' };
}

async function resendVerificationEmail({ email, role }) {
  if (role === 'student') {
    throw ApiError.badRequest('Students do not have an email on file — this is not applicable.');
  }
  const repo = REPO_BY_ROLE[role];
  const account = await repo.findByEmail(email);

  // Always return the same generic message whether or not the account
  // exists / is already verified — prevents email enumeration.
  if (account && !account.email_verified_at) {
    await issueEmailVerificationToken({ userId: account.id, role, email: account.email, name: account.name });
  }
  return { message: 'If an account with that email exists and is unverified, a new verification link has been sent.' };
}

// ============================================================================
// NEW: Forgot / reset password
// Self-service reset is only available for email-based roles (admin,
// teacher) since delivery requires an email address. Students continue to
// use the existing teacher/admin-initiated reset (see teacher.service.js /
// admin.service.js resetStudentPassword / resetTeacherPassword) — there is
// no email channel to deliver a student self-service reset link through.
// ============================================================================
async function forgotPassword({ email }) {
  const genericResult = { message: 'If an account with that email exists, a password reset link has been sent.' };

  let account = null;
  let role = null;
  for (const [candidateRole, repo] of Object.entries({ admin: adminRepo, teacher: teacherRepo })) {
    const found = await repo.findByEmail(email);
    if (found) { account = found; role = candidateRole; break; }
  }

  if (!account) return genericResult; // don't leak whether the email exists

  const rawToken = generateRawToken(32);
  await passwordResetRepo.invalidateAllForUser(account.id, role);
  await passwordResetRepo.insert({
    userId: account.id, userRole: role, tokenHash: hashToken(rawToken),
    expiresAt: minutesFromNow(config.auth.passwordResetExpiresInMinutes),
  });
  await emailService.sendPasswordResetEmail(account.email, account.name, rawToken);

  await auditRepo.insert({ actorType: role, actorId: account.id, action: 'password_reset_requested' });
  logger.info('Password reset requested', { role, accountId: account.id });
  return genericResult;
}

async function resetPassword({ token, newPassword }) {
  const record = await passwordResetRepo.findValidByHash(hashToken(token));
  if (!record) throw ApiError.badRequest('This password reset link is invalid or has expired.');

  const repo = REPO_BY_ROLE[record.user_role];
  const newHash = await _hashPassword(newPassword);
  await repo.updateById(record.user_id, { password_hash: newHash });
  await repo.resetFailedAttempts(record.user_id); // a successful reset also clears any lockout
  await passwordResetRepo.markUsed(record.id);

  // Force re-login everywhere — a password reset should invalidate every
  // outstanding session, not just the device that requested the reset.
  await tokenService.revokeAllSessions(record.user_id, record.user_role);

  await auditRepo.insert({ actorType: record.user_role, actorId: record.user_id, action: 'password_reset_completed' });
  logger.info('Password reset completed', { role: record.user_role, accountId: record.user_id });
  return { message: 'Password reset successfully. Please log in with your new password.' };
}

module.exports = {
  adminLogin, teacherLogin, studentRegister, studentLogin, changeOwnPassword,
  refreshSession, logout, logoutAllSessions,
  issueEmailVerificationToken, verifyEmail, resendVerificationEmail,
  forgotPassword, resetPassword,
  getMe,
};

// ---------------------------------------------------------------------------
// getMe — session restore (GET /v1/auth/me)
// ---------------------------------------------------------------------------

/**
 * Shapes the role-appropriate "safe" profile fields from a raw account row.
 * Never includes password_hash, failed_login_attempts, or locked_until.
 */
function _toProfile(role, account) {
  const base = {
    isActive:  Boolean(account.is_active),
    createdAt: account.created_at ?? null,
    lastLoginAt: account.last_login_at ?? null,
  };

  if (role === 'student') {
    return { ...base, username: account.username, classroomId: account.classroom_id ?? null };
  }
  return { ...base, email: account.email };
}

/**
 * Restores the current session from an already-authenticated request.
 * `user` is req.user, populated entirely by the authenticate middleware
 * (JWT payload + the account row it already fetched to check is_active/
 * lockout) — this performs NO additional database query.
 */
function getMe(user) {
  return {
    id:          user.id,
    role:        user.role,
    name:        user.account?.name ?? user.name,
    permissions: user.permissions,
    profile:     _toProfile(user.role, user.account),
  };
}
