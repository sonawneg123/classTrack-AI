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
const { normalizeMobile } = require('../utils/mobile.util');
const logger  = require('../utils/logger.util');

const { buildAvatarUrl } = require('./avatar.service');

// Repositories
const adminRepo    = require('../repositories/admin.repository');
const teacherRepo  = require('../repositories/teacher.repository');
const studentRepo  = require('../repositories/student.repository');
const classroomRepo = require('../repositories/classroom.repository');
const auditRepo    = require('../repositories/audit.repository');
const loginHistoryRepo = require('../repositories/loginHistory.repository');
const emailVerificationRepo = require('../repositories/emailVerificationToken.repository');
const passwordResetRepo = require('../repositories/passwordResetToken.repository');
const teacherRegCodeRepo = require('../repositories/teacherRegistrationCode.repository');

const REPO_BY_ROLE = { admin: adminRepo, teacher: teacherRepo, student: studentRepo };

// ---------------------------------------------------------------------------
// Password policy (shared)
// ---------------------------------------------------------------------------
/**
 * Minimum password rules for self-registration.
 * Min 8 chars enforced by Joi validator (auth.validator.js).
 * This helper provides the service-layer enforcement as defense-in-depth and
 * returns a user-friendly message so callers can throw it directly.
 */
function _assertPasswordStrength(password) {
  if (!password || password.length < 8) {
    throw ApiError.badRequest('Password must be at least 8 characters.');
  }
}

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
// Student register (classroom code required — links student to classroom)
// --------------------------------------------------------------------------
async function studentRegister({ name, email, mobile, classCode, password }) {
  _assertPasswordStrength(password);

  // --- Classroom code validation (mandatory for new registrations) ----------
  // The classCode field is always required.  The backend must validate it
  // exists and that the classroom is active/usable before creating the account.
  if (!classCode || !classCode.trim()) {
    throw ApiError.badRequest('A classroom code is required to register as a student.');
  }

  const classroom = await classroomRepo.findByCode(classCode.trim().toUpperCase());
  if (!classroom) {
    throw ApiError.notFound('Invalid classroom code. Please check with your teacher.');
  }
  if (classroom.deleted_at) {
    throw ApiError.badRequest('That classroom is no longer available. Please check with your teacher.');
  }
  if (!classroom.is_active) {
    throw ApiError.badRequest('That classroom is currently inactive. Please check with your teacher.');
  }

  const normalizedEmail  = email.trim().toLowerCase();
  const normalizedMobile = normalizeMobile(mobile);

  // Duplicate checks — return a safe, non-enumerable message for both cases
  if (await studentRepo.existsByEmail(normalizedEmail)) {
    throw ApiError.conflict('User already exists.');
  }

  if (await studentRepo.existsByMobile(normalizedMobile)) {
    throw ApiError.conflict('User already exists.');
  }

  const passwordHash = await _hashPassword(password);

  // Auto-derive a unique username from the email local-part for backward compat
  // with any code that still queries students by username.  Append a suffix if
  // taken to guarantee uniqueness without exposing the conflict to the caller.
  let username = normalizedEmail.split('@')[0].replace(/[^a-z0-9_.]/gi, '').slice(0, 28) || 'student';
  if (await studentRepo.existsByUsername(username)) {
    username = username.slice(0, 24) + Math.floor(1000 + Math.random() * 9000);
  }

  const id = await studentRepo.create({
    username,
    name:          name.trim(),
    email:         normalizedEmail,
    mobile_number: normalizedMobile,
    classroom_id:  classroom.id,
    password_hash: passwordHash,
  });

  await auditRepo.insert({
    actorType: 'student', actorId: id,
    action: 'student_registered',
    details: { classroomId: classroom.id },
  });

  const { accessToken, refreshToken, permissions } = await tokenService.issueTokenPair(
    { id, role: 'student', name: name.trim() }
  );

  logger.info('Student registered', { studentId: id, classroomId: classroom.id });
  return {
    token: accessToken, accessToken, refreshToken, permissions,
    user: { id, email: normalizedEmail, name: name.trim(), role: 'student' },
  };
}

// --------------------------------------------------------------------------
// Student login (email OR mobile + password)
// --------------------------------------------------------------------------
async function studentLogin({ identifier: rawIdentifier, password, ipAddress, userAgent }) {
  const raw = rawIdentifier.trim();

  // Determine whether the identifier looks like an email or a mobile number.
  // Email detection: contains '@'.
  // Mobile: everything else — normalize to E.164 before lookup.
  const isEmail = raw.includes('@');
  let identifier;
  let student;

  if (isEmail) {
    identifier = raw.toLowerCase();
    student = await studentRepo.findByEmail(identifier);
  } else {
    // Normalize the mobile number to E.164 before lookup so formats like
    // "09876543210" and "+919876543210" both match the stored value.
    identifier = normalizeMobile(raw);
    student = await studentRepo.findByMobile(identifier);
  }

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
    throw ApiError.unauthorized('Invalid email/mobile or password.');
  }

  await _recordSuccessfulAttempt({ repo: studentRepo, account: student, role: 'student', identifier, ipAddress, userAgent });

  const { accessToken, refreshToken, permissions } = await tokenService.issueTokenPair(
    { id: student.id, role: 'student', name: student.name },
    { ipAddress, userAgent }
  );

  logger.info('Student login', { studentId: student.id });
  return {
    token: accessToken, accessToken, refreshToken, permissions,
    user: {
      id: student.id, email: student.email, name: student.name, role: 'student',
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
  if (role === 'student') return; // students do not go through email-verification flow (P1)

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
    throw ApiError.badRequest('Email verification resend is not available for students.');
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

  logger.debug('[forgotPassword] lookup started', { emailDomain: email.split('@')[1] || null });

  let account = null;
  let role = null;
  for (const [candidateRole, repo] of Object.entries({ admin: adminRepo, teacher: teacherRepo, student: studentRepo })) {
    const found = await repo.findByEmail(email);
    if (found) { account = found; role = candidateRole; break; }
  }

  if (!account) {
    logger.debug('[forgotPassword] no account found — returning generic response (non-enumerable)');
    return genericResult; // don't leak whether the email exists
  }

  // NEVER log account.email or account.name directly — log safe fields only.
  logger.debug('[forgotPassword] account located', { role, accountId: account.id, hasEmail: Boolean(account.email) });

  const rawToken = generateRawToken(32);
  // NEVER log rawToken.
  const tokenHash = hashToken(rawToken);
  const expiresAt = minutesFromNow(config.auth.passwordResetExpiresInMinutes);

  logger.debug('[forgotPassword] invalidating prior tokens', { role, accountId: account.id });
  await passwordResetRepo.invalidateAllForUser(account.id, role);

  logger.debug('[forgotPassword] inserting new reset token', {
    role,
    accountId: account.id,
    expiresAt: expiresAt.toISOString(),
    tokenHashPrefix: tokenHash.slice(0, 8), // first 8 hex chars only — safe for correlation
  });
  const tokenId = await passwordResetRepo.insert({
    userId: account.id, userRole: role, tokenHash,
    expiresAt,
  });
  logger.debug('[forgotPassword] token row inserted', { role, accountId: account.id, tokenId });

  logger.debug('[forgotPassword] calling sendPasswordResetEmail', {
    role,
    accountId: account.id,
    clientUrl: config.server.clientUrl,
    // NEVER log toEmail (account.email) at debug level in production — it stays in audit log only
  });
  try {
    await emailService.sendPasswordResetEmail(account.email, account.name, rawToken);
    logger.debug('[forgotPassword] sendPasswordResetEmail returned', { role, accountId: account.id });
  } catch (emailErr) {
    // Email delivery failures must never propagate to the caller — the token
    // is already persisted, and the user can request a new link. Log loudly
    // so the failure is observable in the application logs.
    logger.error('[forgotPassword] sendPasswordResetEmail threw unexpectedly', {
      role, accountId: account.id,
      errorCode:    emailErr.code    || null,
      errorMessage: emailErr.message || String(emailErr),
    });
  }

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

/**
 * Validates a raw reset token and returns safe account information so the
 * frontend can display "who is resetting their password" without putting
 * identity information in the URL.
 *
 * Returns ONLY name and email — never password_hash, role, internal IDs,
 * or the token itself.
 *
 * A generic 400 is thrown for any invalid/expired/used token so the
 * response is indistinguishable between the three cases (no enumeration).
 */
async function validateResetToken({ token }) {
  const record = await passwordResetRepo.findValidByHash(hashToken(token));
  if (!record) throw ApiError.badRequest('This password reset link is invalid or has expired.');

  const repo = REPO_BY_ROLE[record.user_role];
  const account = await repo.findById(record.user_id);
  if (!account || !account.is_active) {
    // Account was deleted or disabled after the token was issued — treat as invalid.
    throw ApiError.badRequest('This password reset link is invalid or has expired.');
  }

  // Return only the safe display fields — never role, ID, hash, or token.
  return {
    name:  account.name  || null,
    email: account.email || null,
  };
}

// --------------------------------------------------------------------------
// Teacher self-registration (requires a valid teacher registration code)
// --------------------------------------------------------------------------
async function teacherRegister({ name, email, mobile, password, teacherCode }) {
  _assertPasswordStrength(password);

  if (!teacherCode || !teacherCode.trim()) {
    throw ApiError.badRequest('A teacher registration code is required.');
  }

  // Validate the teacher registration code FIRST (before any DB writes)
  // to avoid wasted work if the code is invalid.
  // Strip the display-format dash (ABCD-1234 → ABCD1234) before hashing —
  // the stored hash was computed from the raw 8-char code without the dash.
  const rawCodeInput = teacherCode.trim().replace(/-/g, '').toUpperCase();
  const codeHash = hashToken(rawCodeInput);
  const codeRecord = await teacherRegCodeRepo.findValidByHash(codeHash);
  if (!codeRecord) {
    // Generic message — does not reveal whether the code was expired, revoked, used, or never existed.
    throw ApiError.badRequest('Unable to create the teacher account. Please verify your registration details and teacher code.');
  }

  const normalizedEmail  = email.trim().toLowerCase();
  const normalizedMobile = mobile ? normalizeMobile(mobile) : null;

  // Duplicate email/mobile detection — same generic message to prevent enumeration
  if (await teacherRepo.existsByEmail(normalizedEmail)) {
    throw ApiError.conflict('Unable to create the teacher account. Please verify your registration details and teacher code.');
  }
  if (normalizedMobile && await teacherRepo.existsByMobile(normalizedMobile)) {
    throw ApiError.conflict('Unable to create the teacher account. Please verify your registration details and teacher code.');
  }

  const passwordHash = await _hashPassword(password);

  // Role is ALWAYS 'teacher' — never trusted from client input
  const id = await teacherRepo.create({
    name:          name.trim(),
    email:         normalizedEmail,
    mobile_number: normalizedMobile,
    password_hash: passwordHash,
    created_by:    null, // self-registered, no admin created_by
  });

  // Consume the code atomically after account creation
  await teacherRegCodeRepo.markUsed(codeRecord.id, id);

  // Audit log — NEVER log raw password, code, or hash
  await auditRepo.insert({
    actorType: 'teacher', actorId: id,
    action: 'teacher_self_registered',
    details: { name: name.trim() },
  });

  // Fire-and-forget email verification (if REQUIRE_EMAIL_VERIFICATION is set,
  // the teacher must verify before logging in — same as admin-created teachers)
  issueEmailVerificationToken({ userId: id, role: 'teacher', email: normalizedEmail, name: name.trim() })
    .catch((err) => logger.warn('Could not send teacher registration verification email', { teacherId: id, error: err.message }));

  const { accessToken, refreshToken, permissions } = await tokenService.issueTokenPair(
    { id, role: 'teacher', name: name.trim() }
  );

  logger.info('Teacher self-registered', { teacherId: id });
  return {
    token: accessToken, accessToken, refreshToken, permissions,
    user: { id, email: normalizedEmail, name: name.trim(), role: 'teacher' },
  };
}

module.exports = {
  adminLogin, teacherLogin, teacherRegister, studentRegister, studentLogin, changeOwnPassword,
  refreshSession, logout, logoutAllSessions,
  issueEmailVerificationToken, verifyEmail, resendVerificationEmail,
  forgotPassword, resetPassword, validateResetToken,
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
    isActive:    Boolean(account.is_active),
    createdAt:   account.created_at ?? null,
    lastLoginAt: account.last_login_at ?? null,
    avatarUrl:   buildAvatarUrl(account.avatar_path ?? null),
  };

  if (role === 'student') {
    return {
      ...base,
      username:    account.username ?? null,
      email:       account.email ?? null,
      classroomId: account.classroom_id ?? null,
    };
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
