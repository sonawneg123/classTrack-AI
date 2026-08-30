/**
 * server/src/services/knowledge/knowledge.service.js
 *
 * Business logic for the Knowledge Base.
 * Controllers call these — no SQL in controllers.
 *
 * DELETION LIFECYCLE
 * ──────────────────
 * Soft-delete is used only for individual document archival (where we want
 * the record to remain in audit history).
 *
 * Structural deletions (curriculum / subject / chapter / topic) are now
 * HARD DELETEs inside a transaction.  The FK ON DELETE CASCADE constraints
 * defined in V3__rag_knowledge_base.sql propagate the deletion automatically:
 *
 *   DELETE curricula
 *     → subjects (CASCADE)
 *       → chapters (CASCADE)
 *         → topics (CASCADE)
 *           → knowledge_documents (CASCADE)
 *             → knowledge_chunks (CASCADE, incl. vector embeddings)
 *
 * Physical files (PDFs etc.) stored on disk are collected BEFORE the DB
 * delete and removed AFTER a successful commit.  File removal failures are
 * logged but never cause the transaction to roll back — a missing file is
 * less harmful than leaving orphaned DB records.
 */
const fs     = require('fs');
const { pool } = require('../../database/connection');
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

// ─── Physical-file cleanup helper ────────────────────────────────────────────

/**
 * Delete physical files from disk.  Never throws — errors are logged only.
 * Called AFTER a successful DB commit so the DB is the source of truth.
 *
 * @param {string[]} filePaths
 */
function _deletePhysicalFiles(filePaths) {
  for (const fp of filePaths) {
    if (!fp) continue;
    fs.unlink(fp, (err) => {
      if (err && err.code !== 'ENOENT') {
        logger.warn('[KnowledgeService] Physical file deletion failed', { path: fp, error: err.message });
      }
    });
  }
}

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

/**
 * Permanently delete a curriculum and ALL its owned knowledge data.
 *
 * Transaction boundary:
 *   1. Verify ownership (outside tx — cheap read, avoids holding a lock early).
 *   2. BEGIN
 *   3. Collect file paths of every document under this curriculum.
 *   4. Hard-delete the curricula row  → FK CASCADE removes subjects / chapters /
 *      topics / knowledge_documents / knowledge_chunks automatically.
 *   5. COMMIT
 *   6. Delete physical files (best-effort, after commit).
 *
 * If the DB delete fails the transaction rolls back and no physical files
 * are removed.
 *
 * @param {number} id
 * @param {number} teacherId
 */
async function deleteCurriculum(id, teacherId) {
  // Ownership guard (fast path, outside transaction)
  await _requireCurriculum(id, teacherId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Collect physical file paths before the cascade removes the rows
    const filePaths = await docRepo.listFilePathsByCurriculum(id, teacherId, client);

    // Hard-delete; FK CASCADE handles the entire hierarchy
    const deleted = await curriculumRepo.hardDeleteOwned(id, teacherId, client);
    if (!deleted) {
      await client.query('ROLLBACK');
      throw ApiError.notFound('Curriculum not found.');
    }

    await client.query('COMMIT');

    // Best-effort physical file removal (after successful commit)
    _deletePhysicalFiles(filePaths);

    logger.info('[KnowledgeService] Curriculum hard-deleted with cascade', {
      curriculumId: id, teacherId, filesRemoved: filePaths.length,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
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

/**
 * Permanently delete a subject and all its owned knowledge data.
 * Same transaction + file-cleanup pattern as deleteCurriculum.
 */
async function deleteSubject(id, teacherId) {
  await _requireSubject(id, teacherId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const filePaths = await docRepo.listFilePathsBySubject(id, teacherId, client);

    const deleted = await subjectRepo.hardDeleteOwned(id, teacherId, client);
    if (!deleted) {
      await client.query('ROLLBACK');
      throw ApiError.notFound('Subject not found.');
    }

    await client.query('COMMIT');
    _deletePhysicalFiles(filePaths);

    logger.info('[KnowledgeService] Subject hard-deleted with cascade', {
      subjectId: id, teacherId, filesRemoved: filePaths.length,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
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

/**
 * Permanently delete a chapter and all its owned knowledge data.
 */
async function deleteChapter(id, teacherId) {
  await _requireChapter(id, teacherId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const filePaths = await docRepo.listFilePathsByChapter(id, teacherId, client);

    const deleted = await chapterRepo.hardDeleteOwned(id, teacherId, client);
    if (!deleted) {
      await client.query('ROLLBACK');
      throw ApiError.notFound('Chapter not found.');
    }

    await client.query('COMMIT');
    _deletePhysicalFiles(filePaths);

    logger.info('[KnowledgeService] Chapter hard-deleted with cascade', {
      chapterId: id, teacherId, filesRemoved: filePaths.length,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
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

/**
 * Permanently delete a topic and all its owned knowledge data.
 */
async function deleteTopic(id, teacherId) {
  await _requireTopic(id, teacherId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const filePaths = await docRepo.listFilePathsByTopic(id, teacherId, client);

    const deleted = await topicRepo.hardDeleteOwned(id, teacherId, client);
    if (!deleted) {
      await client.query('ROLLBACK');
      throw ApiError.notFound('Topic not found.');
    }

    await client.query('COMMIT');
    _deletePhysicalFiles(filePaths);

    logger.info('[KnowledgeService] Topic hard-deleted with cascade', {
      topicId: id, teacherId, filesRemoved: filePaths.length,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
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

/**
 * Archive (soft-delete) a single document.
 * Soft-delete is intentional here — we want to preserve the record for audit.
 * The content_hash check in ingestion.service considers deleted_at, so an
 * archived document does NOT block re-uploads of the same file.
 */
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
