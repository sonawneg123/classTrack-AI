/**
 * server/src/services/knowledge/knowledge.service.js
 *
 * Business logic for the Knowledge Base.
 * Controllers call these — no SQL in controllers.
 */
const { ApiError } = require('../../utils/response.util');
const logger = require('../../utils/logger.util');

const curriculumRepo = require('../../repositories/curriculum.repository');
const subjectRepo    = require('../../repositories/subject.repository');
const chapterRepo    = require('../../repositories/chapter.repository');
const topicRepo      = require('../../repositories/topic.repository');
const docRepo        = require('../../repositories/knowledgeDocument.repository');
const chunkRepo      = require('../../repositories/knowledgeChunk.repository');
const { registerAndProcess, retryDocument } = require('./ingestion.service');
const { search } = require('./retrieval.service');

// ─── Ownership guards ─────────────────────────────────────────────────────────

async function _requireCurriculum(id, teacherId) {
  const c = await curriculumRepo.findOwnedById(id, teacherId);
  if (!c) throw ApiError.notFound('Curriculum not found.');
  return c;
}

async function _requireSubject(id, teacherId) {
  const s = await subjectRepo.findOwnedById(id, teacherId);
  if (!s) throw ApiError.notFound('Subject not found.');
  return s;
}

async function _requireChapter(id, teacherId) {
  const c = await chapterRepo.findOwnedById(id, teacherId);
  if (!c) throw ApiError.notFound('Chapter not found.');
  return c;
}

async function _requireTopic(id, teacherId) {
  const t = await topicRepo.findOwnedById(id, teacherId);
  if (!t) throw ApiError.notFound('Topic not found.');
  return t;
}

async function _requireDocument(id, teacherId) {
  const d = await docRepo.findOwnedById(id, teacherId);
  if (!d) throw ApiError.notFound('Document not found.');
  return d;
}

// ─── Curricula ────────────────────────────────────────────────────────────────

async function listCurricula(teacherId) {
  return curriculumRepo.listByTeacher(teacherId);
}

async function createCurriculum(teacherId, { name, description }) {
  return curriculumRepo.createForTeacher(teacherId, { name, description });
}

async function getCurriculum(id, teacherId) {
  return _requireCurriculum(id, teacherId);
}

async function deleteCurriculum(id, teacherId) {
  const deleted = await curriculumRepo.softDeleteOwned(id, teacherId);
  if (!deleted) throw ApiError.notFound('Curriculum not found.');
}

// ─── Subjects ─────────────────────────────────────────────────────────────────

async function listSubjects(curriculumId, teacherId) {
  await _requireCurriculum(curriculumId, teacherId);
  return subjectRepo.listByCurriculum(curriculumId, teacherId);
}

async function createSubject(curriculumId, teacherId, { name, description }) {
  await _requireCurriculum(curriculumId, teacherId);
  return subjectRepo.createForTeacher(teacherId, curriculumId, { name, description });
}

async function deleteSubject(id, teacherId) {
  const deleted = await subjectRepo.softDeleteOwned(id, teacherId);
  if (!deleted) throw ApiError.notFound('Subject not found.');
}

// ─── Chapters ─────────────────────────────────────────────────────────────────

async function listChapters(subjectId, teacherId) {
  await _requireSubject(subjectId, teacherId);
  return chapterRepo.listBySubject(subjectId, teacherId);
}

async function createChapter(subjectId, teacherId, { name, description, orderIndex }) {
  await _requireSubject(subjectId, teacherId);
  return chapterRepo.createForTeacher(teacherId, subjectId, { name, description, orderIndex });
}

async function deleteChapter(id, teacherId) {
  const deleted = await chapterRepo.softDeleteOwned(id, teacherId);
  if (!deleted) throw ApiError.notFound('Chapter not found.');
}

// ─── Topics ───────────────────────────────────────────────────────────────────

async function listTopics(chapterId, teacherId) {
  await _requireChapter(chapterId, teacherId);
  return topicRepo.listByChapter(chapterId, teacherId);
}

async function createTopic(chapterId, teacherId, { name, description, orderIndex }) {
  await _requireChapter(chapterId, teacherId);
  return topicRepo.createForTeacher(teacherId, chapterId, { name, description, orderIndex });
}

async function deleteTopic(id, teacherId) {
  const deleted = await topicRepo.softDeleteOwned(id, teacherId);
  if (!deleted) throw ApiError.notFound('Topic not found.');
}

// ─── Documents ────────────────────────────────────────────────────────────────

async function listDocuments(topicId, teacherId) {
  await _requireTopic(topicId, teacherId);
  return docRepo.listByTopic(topicId, teacherId);
}

async function uploadDocument(topicId, teacherId, { title, originalFilename, filePath, fileType, fileSizeBytes }) {
  await _requireTopic(topicId, teacherId);

  // Derive title from filename if not provided
  const resolvedTitle = title?.trim()
    || originalFilename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

  try {
    return await registerAndProcess({
      topicId, teacherId,
      title: resolvedTitle,
      originalFilename, filePath, fileType, fileSizeBytes,
    });
  } catch (err) {
    if (err.code === 'DUPLICATE') {
      throw ApiError.conflict(err.message);
    }
    throw err;
  }
}

async function getDocumentStatus(documentId, teacherId) {
  return _requireDocument(documentId, teacherId);
}

async function retryFailedDocument(documentId, teacherId) {
  const doc = await _requireDocument(documentId, teacherId);
  if (doc.status !== 'failed') {
    throw ApiError.badRequest('Only failed documents can be retried.');
  }
  const reset = await retryDocument(documentId, teacherId);
  if (!reset) throw ApiError.badRequest('Document could not be queued for retry.');
  return reset;
}

async function archiveDocument(documentId, teacherId) {
  const deleted = await docRepo.softDeleteOwned(documentId, teacherId);
  if (!deleted) throw ApiError.notFound('Document not found.');
}

// ─── Search ───────────────────────────────────────────────────────────────────

async function searchKnowledgeBase({ query, teacherId, topK, filters }) {
  return search({ query, teacherId, topK, filters });
}

module.exports = {
  listCurricula, createCurriculum, getCurriculum, deleteCurriculum,
  listSubjects,  createSubject,  deleteSubject,
  listChapters,  createChapter,  deleteChapter,
  listTopics,    createTopic,    deleteTopic,
  listDocuments, uploadDocument, getDocumentStatus, retryFailedDocument, archiveDocument,
  searchKnowledgeBase,
};
