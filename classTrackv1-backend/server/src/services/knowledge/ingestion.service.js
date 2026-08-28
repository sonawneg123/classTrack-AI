/**
 * server/src/services/knowledge/ingestion.service.js
 *
 * Document Ingestion Pipeline
 *
 * Flow:
 *   1. Receive uploaded file metadata
 *   2. Compute SHA-256 content hash (deduplication)
 *   3. Create knowledge_documents record (status: uploaded)
 *   4. Trigger async processing (non-blocking HTTP response)
 *   5. processDocument():
 *      a. Set status → processing
 *      b. Extract text (PDF / DOCX / TXT)
 *      c. Normalise text
 *      d. Chunk text (ChunkingService)
 *      e. Generate embeddings (EmbeddingProvider)
 *      f. Store chunks in knowledge_chunks
 *      g. Set status → ready
 *      h. On error: set status → failed, record failure_message
 *
 * The HTTP handler returns immediately after creating the DB record.
 * processDocument() runs asynchronously and is NEVER awaited in the
 * request lifecycle — this creates the clean service boundary required
 * to introduce a real job queue (BullMQ, pg-boss, etc.) later without
 * rewriting the pipeline.
 *
 * RETRY SAFETY:
 *   - processDocument() sets status → processing atomically before doing work.
 *   - If the process crashes mid-flight, the document remains in 'processing'.
 *   - knowledgeDocument.repository.findStuckProcessing() detects these and
 *     allows external recovery (e.g. a startup check or a cron job).
 *   - max_retries is enforced: after config.rag.maxRetries failures the
 *     document stays in 'failed' permanently.
 */
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const pdfParse = require('pdf-parse');
const mammoth  = require('mammoth');

const config  = require('../../config');
const logger  = require('../../utils/logger.util');
const { pool } = require('../../database/connection');
const { chunkText } = require('./chunking.service');
const { getEmbeddingProvider } = require('../ai/providers');
const docRepo   = require('../../repositories/knowledgeDocument.repository');
const chunkRepo = require('../../repositories/knowledgeChunk.repository');

// ─────────────────────────────────────────────────────────────────────────────
// Text extraction
// ─────────────────────────────────────────────────────────────────────────────

async function _extractText(filePath, fileType) {
  switch (fileType) {
    case 'txt': {
      return fs.readFileSync(filePath, 'utf-8');
    }
    case 'pdf': {
      const buffer = fs.readFileSync(filePath);
      const data   = await pdfParse(buffer);
      return data.text || '';
    }
    case 'docx': {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || '';
    }
    default:
      throw new Error(`Unsupported file type for text extraction: ${fileType}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Text normalisation
// ─────────────────────────────────────────────────────────────────────────────

function _normaliseText(raw) {
  return raw
    // Replace Windows/Mac line endings with Unix
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Collapse more-than-two consecutive blank lines
    .replace(/\n{3,}/g, '\n\n')
    // Strip null bytes and non-printable control chars (except tab/newline)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Trim overall
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// SHA-256 hash of file contents
// ─────────────────────────────────────────────────────────────────────────────

function _hashFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// Core pipeline (runs asynchronously, never awaited in the HTTP layer)
// ─────────────────────────────────────────────────────────────────────────────

async function _processDocumentAsync(documentId) {
  let docRecord;
  try {
    // Fetch the full document row (needs filePath, fileType, teacherId)
    const client = await pool.connect();
    try {
      docRecord = await _fetchDocumentForProcessing(documentId, client);
    } finally {
      client.release();
    }

    if (!docRecord) {
      logger.warn('[Ingestion] Document not found for processing', { documentId });
      return;
    }

    // Idempotency guard: if it was already successfully processed, skip.
    if (docRecord.status === 'ready') {
      logger.info('[Ingestion] Document already ready, skipping.', { documentId });
      return;
    }

    // Check retry limit
    if (docRecord.retry_count >= config.rag.maxRetries) {
      logger.warn('[Ingestion] Document exceeded max retries, not processing.', { documentId, retries: docRecord.retry_count });
      return;
    }

    // Set status → processing
    await docRepo.setStatus(documentId, 'processing');
    logger.info('[Ingestion] Processing started', { documentId, fileType: docRecord.file_type });

    // 1. Extract text
    let rawText;
    try {
      rawText = await _extractText(docRecord.file_path, docRecord.file_type);
    } catch (err) {
      throw new Error(`Text extraction failed: ${err.message}`);
    }

    // 2. Normalise
    const cleanText = _normaliseText(rawText);

    if (!cleanText || cleanText.length < 10) {
      throw new Error('Document appears to be empty or contains no extractable text.');
    }

    // 3. Enforce max document size
    if (cleanText.length > config.rag.maxDocChars) {
      throw new Error(
        `Document text exceeds the maximum allowed size (${config.rag.maxDocChars.toLocaleString()} characters).`
      );
    }

    // 4. Chunk
    const chunks = chunkText(cleanText, { page: null, section: null });
    if (chunks.length === 0) {
      throw new Error('Chunking produced zero chunks.');
    }

    // 5. Generate embeddings
    const embeddingProvider = getEmbeddingProvider();
    const texts = chunks.map((c) => c.chunkText);
    logger.debug('[Ingestion] Generating embeddings…', { documentId, chunkCount: chunks.length });
    const embeddings = await embeddingProvider.generateEmbeddings(texts);
    logger.debug('[Ingestion] Embeddings generated.', { documentId, chunkCount: chunks.length });

    const chunksWithEmbeddings = chunks.map((c, i) => ({
      ...c,
      embedding: embeddings[i],
    }));

    // 6. Persist chunks in a transaction
    const txClient = await pool.connect();
    try {
      await txClient.query('BEGIN');

      // Delete any pre-existing chunks (retry case)
      await chunkRepo.deleteByDocument(documentId, txClient);

      // Insert new chunks
      await chunkRepo._insertChunksSequential(
        documentId, docRecord.teacher_id, chunksWithEmbeddings, txClient
      );

      // Mark document ready
      await txClient.query(
        `UPDATE knowledge_documents
         SET status = 'ready', total_chunks = $1, processed_at = NOW(), failure_message = NULL, updated_at = NOW()
         WHERE id = $2`,
        [chunks.length, documentId]
      );

      await txClient.query('COMMIT');
    } catch (err) {
      await txClient.query('ROLLBACK');
      throw err;
    } finally {
      txClient.release();
    }

    logger.info('[Ingestion] Document processed successfully.', {
      documentId,
      chunkCount: chunks.length,
    });
  } catch (err) {
    logger.error('[Ingestion] Processing failed', { documentId, error: err.message });
    try {
      await docRepo.setStatus(documentId, 'failed', {
        failureMessage: err.message.slice(0, 500),
      });
    } catch (updateErr) {
      logger.error('[Ingestion] Could not update failure status', { documentId, error: updateErr.message });
    }
  }
}

async function _fetchDocumentForProcessing(documentId, client) {
  const [rows] = await client.query(
    `SELECT id, teacher_id, file_path, file_type, status, retry_count
     FROM knowledge_documents WHERE id = $1`,
    [documentId]
  );
  return rows[0] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the initial knowledge_documents record and kick off async processing.
 * Returns the new document row immediately (status: 'uploaded').
 *
 * @param {object} params
 * @param {number} params.topicId
 * @param {number} params.teacherId
 * @param {string} params.title           Human-readable title
 * @param {string} params.originalFilename
 * @param {string} params.filePath        Absolute path to the saved file
 * @param {string} params.fileType        'pdf' | 'docx' | 'txt'
 * @param {number} params.fileSizeBytes
 * @returns {Promise<object>}             The created document row
 */
async function registerAndProcess({ topicId, teacherId, title, originalFilename, filePath, fileType, fileSizeBytes }) {
  // Content hash for deduplication
  const contentHash = _hashFile(filePath);

  // Check for duplicate (same hash, same teacher)
  const existing = await docRepo.findByHash(contentHash, teacherId);
  if (existing && existing.status === 'ready') {
    // Clean up the duplicate uploaded file
    fs.unlink(filePath, () => {});
    const err = new Error(
      `Duplicate document: identical content already exists as "${existing.title}" (ID ${existing.id}).`
    );
    err.code = 'DUPLICATE';
    err.existingId = existing.id;
    throw err;
  }

  // Create the document record
  const doc = await docRepo.create({
    topicId, teacherId, title, originalFilename, filePath, fileType, fileSizeBytes, contentHash,
  });

  // Kick off async processing — intentionally NOT awaited
  setImmediate(() => _processDocumentAsync(doc.id));

  return doc;
}

/**
 * Retry a failed document.  Resets status to 'uploaded' and re-triggers
 * the processing pipeline.
 *
 * @param {number} documentId
 * @param {number} teacherId
 * @returns {Promise<object>} Updated document row
 */
async function retryDocument(documentId, teacherId) {
  const reset = await docRepo.resetForRetry(documentId, teacherId);
  if (!reset) return null;

  // Re-trigger async processing
  setImmediate(() => _processDocumentAsync(documentId));

  return reset;
}

module.exports = { registerAndProcess, retryDocument };
