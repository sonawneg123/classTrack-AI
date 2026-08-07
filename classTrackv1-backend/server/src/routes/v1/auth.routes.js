/**
 * server/src/routes/v1/auth.routes.js
 *
 * The full enterprise IAM surface, versioned under /api/v1/auth.
 * The legacy /api/auth/* routes (routes/auth.routes.js) remain mounted
 * unchanged for existing frontend compatibility — this is the new,
 * additive surface with refresh tokens, logout, forgot/reset password,
 * and email verification.
 */
const { Router } = require('express');
const controller = require('../../controllers/auth.controller');
const validator   = require('../../validators/auth.validator');
const validate     = require('../../middleware/validate.middleware');
const { authenticate } = require('../../middleware/auth.middleware');
const { loginLimiter, registerLimiter, refreshLimiter, forgotPasswordLimiter } = require('../../middleware/rateLimiter.middleware');

const router = Router();

/**
 * @openapi
 * /v1/auth/admin/login:
 *   post:
 *     tags: [Auth]
 *     summary: Admin login
 *     description: Authenticates an admin with email + password. Returns a short-lived access token and a rotating refresh token. Subject to account lockout after repeated failed attempts.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmailLoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSuccessResponse'
 *       401:
 *         description: Invalid credentials
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       403:
 *         description: Account locked or disabled
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       429:
 *         description: Too many login attempts
 */
router.post('/admin/login', loginLimiter, validate(validator.adminLogin), controller.adminLogin);

/**
 * @openapi
 * /v1/auth/teacher/login:
 *   post:
 *     tags: [Auth]
 *     summary: Teacher login
 *     description: Authenticates a teacher with email + password. Same token/lockout semantics as admin login.
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/EmailLoginRequest' } } }
 *     responses:
 *       200: { description: Login successful, content: { application/json: { schema: { $ref: '#/components/schemas/AuthSuccessResponse' } } } }
 *       401: { description: Invalid credentials }
 *       403: { description: Account locked, disabled, or email unverified }
 *       429: { description: Too many login attempts }
 */
router.post('/teacher/login', loginLimiter, validate(validator.teacherLogin), controller.teacherLogin);

/**
 * @openapi
 * /v1/auth/student/register:
 *   post:
 *     tags: [Auth]
 *     summary: Student self-registration
 *     description: One-time registration using a classroom join code. Students authenticate by username thereafter — the classroom code is never required again.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, name, classCode, password]
 *             properties:
 *               username:  { type: string, minLength: 3, maxLength: 30, example: riya_patel }
 *               name:      { type: string, example: "Riya Patel" }
 *               classCode: { type: string, example: "DEMO1234" }
 *               password:  { type: string, minLength: 6, format: password }
 *     responses:
 *       201: { description: Account created, content: { application/json: { schema: { $ref: '#/components/schemas/AuthSuccessResponse' } } } }
 *       404: { description: Classroom code not found }
 *       409: { description: Username already taken }
 *       429: { description: Too many registration attempts }
 */
router.post('/student/register', registerLimiter, validate(validator.studentRegister), controller.studentRegister);

/**
 * @openapi
 * /v1/auth/student/login:
 *   post:
 *     tags: [Auth]
 *     summary: Student login
 *     description: Username + password only — no classroom code required after registration.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string }
 *               password: { type: string, format: password }
 *     responses:
 *       200: { description: Login successful, content: { application/json: { schema: { $ref: '#/components/schemas/AuthSuccessResponse' } } } }
 *       401: { description: Invalid credentials }
 *       403: { description: Account locked or disabled }
 *       429: { description: Too many login attempts }
 */
router.post('/student/login', loginLimiter, validate(validator.studentLogin), controller.studentLogin);

/**
 * @openapi
 * /v1/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the current authenticated user
 *     description: |
 *       Returns the authenticated user's id, role, name, permissions, and
 *       role-appropriate profile fields. Used by the frontend to restore a
 *       session after a page refresh. Reuses the account row the
 *       `authenticate` middleware already fetched (to check is_active /
 *       lockout) — this does not perform any additional database query.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Current user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Current user retrieved successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:          { type: integer, example: 1 }
 *                     role:        { type: string, enum: [admin, teacher, student] }
 *                     name:        { type: string, example: "Super Admin" }
 *                     permissions: { type: array, items: { type: string }, example: ["platform:manage"] }
 *                     profile:
 *                       type: object
 *                       description: "admin/teacher → email, isActive, createdAt, lastLoginAt. student → username, classroomId, isActive, createdAt, lastLoginAt."
 *       401: { description: Missing, invalid, or expired access token }
 */
router.get('/me', authenticate, controller.getMe);

/**
 * @openapi
 * /v1/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh an access token
 *     description: |
 *       Exchanges a valid, unused refresh token for a new access + refresh
 *       token pair (rotation). Presenting a refresh token that was already
 *       rotated (i.e. reused) revokes every session for that account as a
 *       theft-response measure.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: New token pair issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:  { type: string }
 *                     refreshToken: { type: string }
 *                     permissions:  { type: array, items: { type: string } }
 *       401: { description: Invalid, expired, or reused refresh token }
 *       429: { description: Too many refresh attempts }
 */
router.post('/refresh', refreshLimiter, validate(validator.refreshToken), controller.refresh);

/**
 * @openapi
 * /v1/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out (current device)
 *     description: Revokes the supplied refresh token, if any. Requires a valid access token.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: Logged out }
 *       401: { description: Missing or invalid access token }
 */
router.post('/logout', authenticate, validate(validator.logout), controller.logout);

/**
 * @openapi
 * /v1/auth/logout-all:
 *   post:
 *     tags: [Auth]
 *     summary: Log out of all devices
 *     description: Revokes every refresh token issued to the current account — every other logged-in session is forced to re-authenticate.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Logged out everywhere }
 *       401: { description: Missing or invalid access token }
 */
router.post('/logout-all', authenticate, controller.logoutAll);

/**
 * @openapi
 * /v1/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset link
 *     description: |
 *       Available for admin and teacher accounts (email-based login only —
 *       students authenticate by username and have no email on file; a
 *       student's password can only be reset by their teacher or an admin).
 *       Always returns a generic success message regardless of whether the
 *       email exists, to prevent account enumeration.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties: { email: { type: string, format: email } }
 *     responses:
 *       200: { description: Generic confirmation message (see description) }
 *       429: { description: Too many requests }
 */
router.post('/forgot-password', forgotPasswordLimiter, validate(validator.forgotPassword), controller.forgotPassword);

/**
 * @openapi
 * /v1/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Complete a password reset
 *     description: Consumes a time-limited reset token (from the emailed link) and sets a new password. Revokes all existing sessions for the account.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:       { type: string }
 *               newPassword: { type: string, minLength: 6, format: password }
 *     responses:
 *       200: { description: Password reset successfully }
 *       400: { description: Invalid or expired reset token }
 */
router.post('/reset-password', validate(validator.resetPassword), controller.resetPassword);

/**
 * @openapi
 * /v1/auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verify an email address
 *     description: Consumes a time-limited verification token (from the emailed link) sent when a teacher account is created.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties: { token: { type: string } }
 *     responses:
 *       200: { description: Email verified }
 *       400: { description: Invalid or expired verification token }
 */
router.post('/verify-email', validate(validator.verifyEmail), controller.verifyEmail);

/**
 * @openapi
 * /v1/auth/resend-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Resend the email verification link
 *     description: Available for admin/teacher accounts. Always returns a generic success message to prevent account enumeration.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, role]
 *             properties:
 *               email: { type: string, format: email }
 *               role:  { type: string, enum: [admin, teacher] }
 *     responses:
 *       200: { description: Generic confirmation message }
 */
router.post('/resend-verification', validate(validator.resendVerification), controller.resendVerification);

/**
 * @openapi
 * /v1/auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change your own password
 *     description: Requires the current password. Revokes all other sessions on success.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string, format: password }
 *               newPassword:     { type: string, minLength: 6, format: password }
 *     responses:
 *       200: { description: Password updated }
 *       401: { description: Current password incorrect, or missing/invalid access token }
 */
router.post('/change-password', authenticate, validate(validator.changePassword), controller.changeOwnPassword);

module.exports = router;
