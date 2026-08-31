/**
 * server/src/controllers/auth.controller.js
 *
 * Controllers are intentionally thin:
 *   1. Extract validated inputs from req
 *   2. Call the service
 *   3. Send the response
 * No business logic, no SQL, no bcrypt here.
 *
 * These same handlers are mounted under BOTH the legacy `/api/auth/*`
 * routes (login/register/change-password only — unchanged surface) and the
 * new `/api/v1/auth/*` routes (full IAM surface, including refresh/logout/
 * forgot-password/reset-password/verify-email).
 */
const authService  = require('../services/auth.service');
const { ApiResponse, asyncHandler } = require('../utils/response.util');

/** Pulls client IP + user agent for login history / refresh-token auditing. */
function _requestMeta(req) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

// ---------------------------------------------------------------------------
// Existing endpoints — response shape unchanged, now also record IP/UA
// ---------------------------------------------------------------------------
const adminLogin = asyncHandler(async (req, res) => {
  const result = await authService.adminLogin({ ...req.body, ..._requestMeta(req) });
  new ApiResponse(200, 'Login successful.', result).send(res);
});

const teacherLogin = asyncHandler(async (req, res) => {
  const result = await authService.teacherLogin({ ...req.body, ..._requestMeta(req) });
  new ApiResponse(200, 'Login successful.', result).send(res);
});

const teacherRegister = asyncHandler(async (req, res) => {
  const result = await authService.teacherRegister(req.body);
  new ApiResponse(201, 'Teacher account created successfully.', result).send(res);
});

const studentRegister = asyncHandler(async (req, res) => {
  const result = await authService.studentRegister(req.body);
  new ApiResponse(201, 'Account created successfully.', result).send(res);
});

const studentLogin = asyncHandler(async (req, res) => {
  // req.body.identifier is the email-or-mobile field from the new validator.
  // Pass it through directly — the service resolves which field to query.
  const result = await authService.studentLogin({ ...req.body, ..._requestMeta(req) });
  new ApiResponse(200, 'Login successful.', result).send(res);
});

const changeOwnPassword = asyncHandler(async (req, res) => {
  const result = await authService.changeOwnPassword({
    userId:          req.user.id,
    role:            req.user.role,
    currentPassword: req.body.currentPassword,
    newPassword:     req.body.newPassword,
  });
  new ApiResponse(200, result.message).send(res);
});

// ---------------------------------------------------------------------------
// New — enterprise IAM endpoints (v1)
// ---------------------------------------------------------------------------
const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refreshSession({ refreshToken: req.body.refreshToken, ..._requestMeta(req) });
  new ApiResponse(200, 'Token refreshed.', result).send(res);
});

const logout = asyncHandler(async (req, res) => {
  const result = await authService.logout({
    refreshToken: req.body.refreshToken,
    userId: req.user.id,
    role:   req.user.role,
  });
  new ApiResponse(200, result.message).send(res);
});

const logoutAll = asyncHandler(async (req, res) => {
  const result = await authService.logoutAllSessions({ userId: req.user.id, role: req.user.role });
  new ApiResponse(200, result.message).send(res);
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword({ email: req.body.email });
  new ApiResponse(200, result.message).send(res);
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword({ token: req.body.token, newPassword: req.body.newPassword });
  new ApiResponse(200, result.message).send(res);
});

/**
 * GET /v1/auth/validate-reset-token?token=<rawToken>
 *
 * Validates the token and returns the account's name + email so the
 * reset-password page can display who is resetting their password.
 * Returns a generic 400 for any invalid/expired/used token.
 * Never exposes: role, ID, password hash, or the token itself.
 */
const validateResetToken = asyncHandler(async (req, res) => {
  const result = await authService.validateResetToken({ token: req.query.token });
  new ApiResponse(200, 'Token is valid.', result).send(res);
});

const verifyEmail = asyncHandler(async (req, res) => {
  const result = await authService.verifyEmail({ token: req.body.token || req.query.token });
  new ApiResponse(200, result.message).send(res);
});

const resendVerification = asyncHandler(async (req, res) => {
  const result = await authService.resendVerificationEmail({ email: req.body.email, role: req.body.role });
  new ApiResponse(200, result.message).send(res);
});

const getMe = asyncHandler(async (req, res) => {
  const result = authService.getMe(req.user);
  new ApiResponse(200, 'Current user retrieved successfully.', result).send(res);
});

module.exports = {
  adminLogin, teacherLogin, teacherRegister, studentRegister, studentLogin, changeOwnPassword,
  refresh, logout, logoutAll, forgotPassword, resetPassword, validateResetToken, verifyEmail, resendVerification,
  getMe,
};
