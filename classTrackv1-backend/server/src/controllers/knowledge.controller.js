/**
 * server/src/controllers/knowledge.controller.js
 *
 * HTTP handler layer for the Knowledge Base API.
 * All business logic delegated to knowledge.service.js.
 */
const knowledgeService = require('../services/knowledge/knowledge.service');
const { ApiResponse, asyncHandler } = require('../utils/response.util');
const { mimeToKnowledgeFileType } = require('../middleware/knowledgeUpload.middleware');

// ─── Curricula ────────────────────────────────────────────────────────────────

const listCurricula = asyncHandler(async (req, res) => {
  const data = await knowledgeService.listCurricula(req.user.id);
  new ApiResponse(200, 'Curricula retrieved.', { curricula: data }).send(res);
});

const createCurriculum = asyncHandler(async (req, res) => {
  const data = await knowledgeService.createCurriculum(req.user.id, req.body);
  new ApiResponse(201, 'Curriculum created.', data).send(res);
});

const getCurriculum = asyncHandler(async (req, res) => {
  const data = await knowledgeService.getCurriculum(req.params.curriculumId, req.user.id);
  new ApiResponse(200, 'Curriculum retrieved.', data).send(res);
});

const deleteCurriculum = asyncHandler(async (req, res) => {
  await knowledgeService.deleteCurriculum(req.params.curriculumId, req.user.id);
  new ApiResponse(200, 'Curriculum deleted.').send(res);
});

// ─── Subjects ─────────────────────────────────────────────────────────────────

const listSubjects = asyncHandler(async (req, res) => {
  const data = await knowledgeService.listSubjects(req.params.curriculumId, req.user.id);
  new ApiResponse(200, 'Subjects retrieved.', { subjects: data }).send(res);
});

const createSubject = asyncHandler(async (req, res) => {
  const data = await knowledgeService.createSubject(req.params.curriculumId, req.user.id, req.body);
  new ApiResponse(201, 'Subject created.', data).send(res);
});

const deleteSubject = asyncHandler(async (req, res) => {
  await knowledgeService.deleteSubject(req.params.subjectId, req.user.id);
  new ApiResponse(200, 'Subject deleted.').send(res);
});

// ─── Chapters ─────────────────────────────────────────────────────────────────

const listChapters = asyncHandler(async (req, res) => {
  const data = await knowledgeService.listChapters(req.params.subjectId, req.user.id);
  new ApiResponse(200, 'Chapters retrieved.', { chapters: data }).send(res);
});

const createChapter = asyncHandler(async (req, res) => {
  const data = await knowledgeService.createChapter(req.params.subjectId, req.user.id, req.body);
  new ApiResponse(201, 'Chapter created.', data).send(res);
});

const deleteChapter = asyncHandler(async (req, res) => {
  await knowledgeService.deleteChapter(req.params.chapterId, req.user.id);
  new ApiResponse(200, 'Chapter deleted.').send(res);
});

// ─── Topics ───────────────────────────────────────────────────────────────────

const listTopics = asyncHandler(async (req, res) => {
  const data = await knowledgeService.listTopics(req.params.chapterId, req.user.id);
  new ApiResponse(200, 'Topics retrieved.', { topics: data }).send(res);
});

const createTopic = asyncHandler(async (req, res) => {
  const data = await knowledgeService.createTopic(req.params.chapterId, req.user.id, req.body);
  new ApiResponse(201, 'Topic created.', data).send(res);
});

const deleteTopic = asyncHandler(async (req, res) => {
  await knowledgeService.deleteTopic(req.params.topicId, req.user.id);
  new ApiResponse(200, 'Topic deleted.').send(res);
});

// ─── Documents ────────────────────────────────────────────────────────────────

const listDocuments = asyncHandler(async (req, res) => {
  const data = await knowledgeService.listDocuments(req.params.topicId, req.user.id);
  new ApiResponse(200, 'Documents retrieved.', { documents: data }).send(res);
});

const uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }

  const fileType = mimeToKnowledgeFileType(req.file.mimetype);
  const data = await knowledgeService.uploadDocument(
    req.params.topicId,
    req.user.id,
    {
      title:            req.body.title,
      originalFilename: req.file.originalname,
      filePath:         req.file.path,
      fileType,
      fileSizeBytes:    req.file.size,
    }
  );
  new ApiResponse(202, 'Document received and queued for processing.', data).send(res);
});

const getDocumentStatus = asyncHandler(async (req, res) => {
  const data = await knowledgeService.getDocumentStatus(req.params.documentId, req.user.id);
  new ApiResponse(200, 'Document status retrieved.', data).send(res);
});

const retryDocument = asyncHandler(async (req, res) => {
  const data = await knowledgeService.retryFailedDocument(req.params.documentId, req.user.id);
  new ApiResponse(200, 'Document queued for retry.', data).send(res);
});

const archiveDocument = asyncHandler(async (req, res) => {
  await knowledgeService.archiveDocument(req.params.documentId, req.user.id);
  new ApiResponse(200, 'Document archived.').send(res);
});

// ─── Search ───────────────────────────────────────────────────────────────────

const search = asyncHandler(async (req, res) => {
  const { query, topK, curriculumId, subjectId, chapterId, topicId } = req.body;
  const filters = {};
  if (curriculumId) filters.curriculumId = Number(curriculumId);
  if (subjectId)   filters.subjectId   = Number(subjectId);
  if (chapterId)   filters.chapterId   = Number(chapterId);
  if (topicId)     filters.topicId     = Number(topicId);

  const data = await knowledgeService.searchKnowledgeBase({
    query,
    teacherId: req.user.id,
    topK: topK ? Number(topK) : undefined,
    filters,
  });
  new ApiResponse(200, 'Search complete.', data).send(res);
});

module.exports = {
  listCurricula, createCurriculum, getCurriculum, deleteCurriculum,
  listSubjects,  createSubject,  deleteSubject,
  listChapters,  createChapter,  deleteChapter,
  listTopics,    createTopic,    deleteTopic,
  listDocuments, uploadDocument, getDocumentStatus, retryDocument, archiveDocument,
  search,
};
