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

const studentRegister = {
  body: Joi.object({
    username:  Joi.string().alphanum().min(3).max(30).pattern(/^[a-zA-Z0-9_.]+$/).required().label('Username'),
    name:      Joi.string().min(2).max(100).required().label('Name'),
    classCode: Joi.string().alphanum().min(4).max(12).required().label('Classroom code'),
    password:  Joi.string().min(6).max(128).required().label('Password'),
  }),
};

const studentLogin = {
  body: Joi.object({
    username: Joi.string().min(3).max(30).required().label('Username'),
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
