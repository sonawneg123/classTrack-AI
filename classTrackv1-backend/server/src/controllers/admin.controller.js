/**
 * server/src/controllers/admin.controller.js
 */
const adminService = require('../services/admin.service');
const { ApiResponse, asyncHandler } = require('../utils/response.util');

const getStats = asyncHandler(async (req, res) => {
  const data = await adminService.getStats();
  new ApiResponse(200, 'Stats retrieved.', data).send(res);
});

const getDashboard = asyncHandler(async (req, res) => {
  const data = await adminService.getDashboard();
  new ApiResponse(200, 'Dashboard data retrieved.', data).send(res);
});

// ── Teacher management ────────────────────────────────────────────────────────

const createTeacher = asyncHandler(async (req, res) => {
  const data = await adminService.createTeacher(req.body, req.user.id);
  new ApiResponse(201, 'Teacher account created.', data).send(res);
});

const listTeachers = asyncHandler(async (req, res) => {
  const data = await adminService.listTeachers(req.query);
  new ApiResponse(200, 'Teachers retrieved.', data).send(res);
});

const getTeacher = asyncHandler(async (req, res) => {
  const data = await adminService.getTeacher(req.params.id);
  new ApiResponse(200, 'Teacher retrieved.', data).send(res);
});

const updateTeacher = asyncHandler(async (req, res) => {
  const data = await adminService.updateTeacher(req.params.id, req.body, req.user.id);
  new ApiResponse(200, data.message).send(res);
});

const setTeacherStatus = asyncHandler(async (req, res) => {
  const isActive = req.body.isActive;
  const data = await adminService.setTeacherStatus(req.params.id, isActive, req.user.id);
  new ApiResponse(200, data.message).send(res);
});

const toggleTeacherActive = asyncHandler(async (req, res) => {
  await adminService.toggleTeacherActive(req.params.id, req.user.id);
  new ApiResponse(200, 'Teacher status updated.').send(res);
});

const resetTeacherPassword = asyncHandler(async (req, res) => {
  const data = await adminService.resetTeacherPassword(req.params.id, req.user.id);
  new ApiResponse(200, data.message, { tempPassword: data.tempPassword }).send(res);
});

const assignTeacherClassroom = asyncHandler(async (req, res) => {
  const { classroomId } = req.body;
  const data = await adminService.assignTeacherClassroom(req.params.id, classroomId, req.user.id);
  new ApiResponse(200, data.message).send(res);
});

const removeTeacherFromClassroom = asyncHandler(async (req, res) => {
  const data = await adminService.removeTeacherFromClassroom(req.params.id, req.params.classroomId, req.user.id);
  new ApiResponse(200, data.message).send(res);
});

// ── Classroom management ─────────────────────────────────────────────────────

const createClassroom = asyncHandler(async (req, res) => {
  const data = await adminService.createClassroom(req.body, req.user.id);
  new ApiResponse(201, 'Classroom created.', data).send(res);
});

const listClassrooms = asyncHandler(async (req, res) => {
  const data = await adminService.listClassrooms(req.query);
  new ApiResponse(200, 'Classrooms retrieved.', data).send(res);
});

// ── Teacher Registration Codes ─────────────────────────────────────────────

const createTeacherRegistrationCode = asyncHandler(async (req, res) => {
  const { expiresInHours } = req.body;
  const data = await adminService.createTeacherRegistrationCode(req.user.id, { expiresInHours });
  new ApiResponse(201, 'Teacher registration code created. This code will not be shown again.', data).send(res);
});

const listTeacherRegistrationCodes = asyncHandler(async (req, res) => {
  const data = await adminService.listTeacherRegistrationCodes(req.query);
  new ApiResponse(200, 'Registration codes retrieved.', data).send(res);
});

const revokeTeacherRegistrationCode = asyncHandler(async (req, res) => {
  await adminService.revokeTeacherRegistrationCode(req.params.id, req.user.id);
  new ApiResponse(200, 'Registration code revoked.').send(res);
});

// ── Audit logs ────────────────────────────────────────────────────────────────

const getAuditLogs = asyncHandler(async (req, res) => {
  const data = await adminService.getAuditLogs(req.query);
  new ApiResponse(200, 'Audit logs retrieved.', data).send(res);
});

module.exports = {
  getStats, getDashboard,
  createTeacher, listTeachers, getTeacher, updateTeacher,
  setTeacherStatus, toggleTeacherActive, resetTeacherPassword,
  assignTeacherClassroom, removeTeacherFromClassroom,
  createClassroom, listClassrooms,
  createTeacherRegistrationCode, listTeacherRegistrationCodes, revokeTeacherRegistrationCode,
  getAuditLogs,
};
