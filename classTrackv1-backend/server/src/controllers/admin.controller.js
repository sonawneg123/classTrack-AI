/**
 * server/src/controllers/admin.controller.js
 */
const adminService = require('../services/admin.service');
const { ApiResponse, asyncHandler } = require('../utils/response.util');

const getStats = asyncHandler(async (req, res) => {
  const data = await adminService.getStats();
  new ApiResponse(200, 'Stats retrieved.', data).send(res);
});

const createTeacher = asyncHandler(async (req, res) => {
  const data = await adminService.createTeacher(req.body, req.user.id);
  new ApiResponse(201, 'Teacher account created.', data).send(res);
});

const listTeachers = asyncHandler(async (req, res) => {
  const data = await adminService.listTeachers(req.query);
  new ApiResponse(200, 'Teachers retrieved.', data).send(res);
});

const toggleTeacherActive = asyncHandler(async (req, res) => {
  await adminService.toggleTeacherActive(req.params.id, req.user.id);
  new ApiResponse(200, 'Teacher status updated.').send(res);
});

const resetTeacherPassword = asyncHandler(async (req, res) => {
  const data = await adminService.resetTeacherPassword(req.params.id, req.user.id);
  new ApiResponse(200, data.message, { tempPassword: data.tempPassword }).send(res);
});

const createClassroom = asyncHandler(async (req, res) => {
  const data = await adminService.createClassroom(req.body, req.user.id);
  new ApiResponse(201, 'Classroom created.', data).send(res);
});

const listClassrooms = asyncHandler(async (req, res) => {
  const data = await adminService.listClassrooms(req.query);
  new ApiResponse(200, 'Classrooms retrieved.', data).send(res);
});

const getAuditLogs = asyncHandler(async (req, res) => {
  const data = await adminService.getAuditLogs(req.query);
  new ApiResponse(200, 'Audit logs retrieved.', data).send(res);
});

module.exports = { getStats, createTeacher, listTeachers, toggleTeacherActive, resetTeacherPassword, createClassroom, listClassrooms, getAuditLogs };
