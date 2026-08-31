/**
 * server/src/validators/auth.validator.js
 */
const Joi = require('joi');

const adminLogin = {
  body: Joi.object({
    email:    Joi.string().email().required().label('Email'),
    password: Joi.string().min(1).required().label('Password'),
  }),
};

const teacherLogin = {
  body: Joi.object({
    email:    Joi.string().email().required().label('Email'),
    password: Joi.string().min(1).required().label('Password'),
  }),
};

/**
 * Mobile number validation: accepts any string that, after stripping spaces
 * and dashes, is a valid E.164 number with an optional leading +.
 * Examples accepted: +919876543210, +91 9876543210, 09876543210, 9876543210
 * The service layer normalises to E.164 before storage.
 */
const mobileSchema = Joi.string()
  .pattern(/^\+?[\d\s\-]{7,15}$/)
  .required()
  .label('Mobile number');

const studentRegister = {
  body: Joi.object({
    name:            Joi.string().min(2).max(100).required().label('Full name'),
    email:           Joi.string().email().max(150).required().label('Email'),
    mobile:          mobileSchema,
    password:        Joi.string().min(8).max(128).required().label('Password'),
    confirmPassword: Joi.string().required().label('Confirm password').valid(Joi.ref('password'))
                       .messages({ 'any.only': 'Passwords do not match.' }),
  }),
};

const studentLogin = {
  body: Joi.object({
    email:    Joi.string().email().required().label('Email'),
    password: Joi.string().min(1).required().label('Password'),
  }),
};

const changePassword = {
  body: Joi.object({
    currentPassword: Joi.string().min(1).required().label('Current password'),
    newPassword:     Joi.string().min(6).max(128).required().label('New password'),
  }),
};

// ---------------------------------------------------------------------------
// New — enterprise IAM (v1)
// ---------------------------------------------------------------------------
const refreshToken = {
  body: Joi.object({
    refreshToken: Joi.string().min(20).required().label('Refresh token'),
  }),
};

const logout = {
  body: Joi.object({
    // Optional — omit to log out only the current access token's session
    // state (client should discard it locally); include it to revoke that
    // specific refresh token server-side too.
    refreshToken: Joi.string().min(20).optional().label('Refresh token'),
  }),
};

const forgotPassword = {
  body: Joi.object({
    email: Joi.string().email().required().label('Email'),
  }),
};

const resetPassword = {
  body: Joi.object({
    token:       Joi.string().min(20).required().label('Reset token'),
    newPassword: Joi.string().min(6).max(128).required().label('New password'),
  }),
};

const verifyEmail = {
  body: Joi.object({
    token: Joi.string().min(20).required().label('Verification token'),
  }),
};

const resendVerification = {
  body: Joi.object({
    email: Joi.string().email().required().label('Email'),
    role:  Joi.string().valid('admin', 'teacher').required().label('Role'),
  }),
};

module.exports = {
  adminLogin, teacherLogin, studentRegister, studentLogin, changePassword,
  refreshToken, logout, forgotPassword, resetPassword, verifyEmail, resendVerification,
};
