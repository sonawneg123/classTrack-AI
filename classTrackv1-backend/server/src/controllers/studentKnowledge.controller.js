/**
 * server/src/controllers/studentKnowledge.controller.js
 *
 * Read-only knowledge hierarchy for students.
 * studentId always comes from req.user.id (JWT) — never from request body.
 */
const { ApiResponse, asyncHandler } = require('../utils/response.util');
const service = require('../services/knowledge/studentKnowledge.service');

const listCurricula = asyncHandler(async (req, res) => {
  const data = await service.listCurricula(req.user.id);
  new ApiResponse(200, 'Curricula retrieved.', { curricula: data }).send(res);
});

const listSubjects = asyncHandler(async (req, res) => {
  const data = await service.listSubjects(Number(req.params.curriculumId), req.user.id);
  new ApiResponse(200, 'Subjects retrieved.', { subjects: data }).send(res);
});

const listChapters = asyncHandler(async (req, res) => {
  const data = await service.listChapters(Number(req.params.subjectId), req.user.id);
  new ApiResponse(200, 'Chapters retrieved.', { chapters: data }).send(res);
});

const listTopics = asyncHandler(async (req, res) => {
  const data = await service.listTopics(Number(req.params.chapterId), req.user.id);
  new ApiResponse(200, 'Topics retrieved.', { topics: data }).send(res);
});

module.exports = { listCurricula, listSubjects, listChapters, listTopics };
