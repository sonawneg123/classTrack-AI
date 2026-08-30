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
const crypto   = require('crypto');
const fs       = require('fs');
const fsPromises = require('fs').promises;
const path     = require('path');
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
// Text extraction — uses async fs so large files don't block the event loop
// ─────────────────────────────────────────────────────────────────────────────

async function _extractText(filePath, fileType) {
  switch (fileType) {
    case 'txt': {
      return fsPromises.readFile(filePath, 'utf-8');
    }
    case 'pdf': {
      const buffer = await fsPromises.readFile(filePath);
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
// SHA-256 hash of file contents — async to avoid blocking the event loop
// ─────────────────────────────────────────────────────────────────────────────

async function _hashFile(filePath) {
  const buffer = await fsPromises.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// Processing timeout helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps a promise with a hard timeout.
 * If the promise does not resolve/reject within `ms` milliseconds,
 * the returned promise rejects with a timeout error.
 * @param {Promise}  promise
 * @param {number}   ms
 * @param {string}   label   - included in the error message for context
 * @returns {Promise}
 */
function _withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[Ingestion] Stage "${label}" exceeded timeout of ${ms} ms.`));
    }, ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// Per-stage timeouts (ms).  Large values prevent false positives on slow
// machines while still guaranteeing no document hangs indefinitely.
const TIMEOUT = {
  extraction:        60_000,   //  1 min — PDF parse + disk read
  embedding:        300_000,   //  5 min — 200+ chunks × ~300ms each
  dbInsert:          30_000,   // 30 sec — batch DB writes
};

// ─────────────────────────────────────────────────────────────────────────────
// Core pipeline (runs asynchronously, never awaited in the HTTP layer)
// ─────────────────────────────────────────────────────────────────────────────

async function _processDocumentAsync(documentId) {
  logger.info('[Ingestion] >>> BACKGROUND PROCESSING INVOKED <<<', { documentId });

  const pipelineStart = Date.now();
  let docRecord;
  try {
    // ── 1. Fetch document record ─────────────────────────────────────────────
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
    logger.info('[Ingestion] Document fetched', {
      documentId,
      topicId: docRecord.topic_id,
      teacherId: docRecord.teacher_id,
      status: docRecord.status,
      fileType: docRecord.file_type,
      filePath: docRecord.file_path,
    });

    // Idempotency guard: if it was already successfully processed, skip.
    if (docRecord.status === 'ready') {
      logger.info('[Ingestion] Document already ready, skipping.', { documentId });
      return;
    }

    // Check retry limit
    if (docRecord.retry_count >= config.rag.maxRetries) {
      logger.warn('[Ingestion] Document exceeded max retries, not processing.', {
        documentId,
        retries: docRecord.retry_count,
        maxRetries: config.rag.maxRetries,
      });
      return;
    }

    // ── 2. Verify the file exists on disk ────────────────────────────────────
    const filePath = docRecord.file_path;
    const fileExists = filePath && fs.existsSync(filePath);
    const fileSize = fileExists ? fs.statSync(filePath).size : 0;
    logger.info('[Ingestion] File located', {
      documentId,
      filePath,
      fileExists,
      fileSize,
    });
    if (!fileExists) {
      throw new Error(`Physical file not found on disk: ${filePath}`);
    }
    if (fileSize === 0) {
      throw new Error(`Physical file is empty (0 bytes): ${filePath}`);
    }

    // ── 3. Set status → processing ───────────────────────────────────────────
    await docRepo.setStatus(documentId, 'processing');
    logger.info('[Ingestion] Status → processing', { documentId });

    // ── 4. Extract text ──────────────────────────────────────────────────────
    logger.info('[Ingestion] Text extraction started', {
      documentId,
      fileType: docRecord.file_type,
      fileSize,
    });
    const extractStart = Date.now();
    let rawText;
    try {
      rawText = await _withTimeout(
        _extractText(filePath, docRecord.file_type),
        TIMEOUT.extraction,
        'text-extraction'
      );
    } catch (err) {
      throw new Error(`Text extraction failed: ${err.message}`);
    }
    const extractDurationMs = Date.now() - extractStart;
    logger.info('[Ingestion] Text extraction completed', {
      documentId,
      durationMs: extractDurationMs,
      rawTextLength: rawText.length,
    });

    // ── 5. Normalise ─────────────────────────────────────────────────────────
    const normStart = Date.now();
    const cleanText = _normaliseText(rawText);
    const normDurationMs = Date.now() - normStart;
    logger.info('[Ingestion] Text normalised', {
      documentId,
      cleanTextLength: cleanText.length,
      durationMs: normDurationMs,
    });

    if (!cleanText || cleanText.length < 10) {
      throw new Error('Document appears to be empty or contains no extractable text.');
    }

    // ── 6. Enforce max document size ─────────────────────────────────────────
    if (cleanText.length > config.rag.maxDocChars) {
      throw new Error(
        `Document text exceeds the maximum allowed size (${config.rag.maxDocChars.toLocaleString()} characters).`
      );
    }

    // ── 7. Chunk ─────────────────────────────────────────────────────────────
    logger.info('[Ingestion] Chunking started', {
      documentId,
      textLength: cleanText.length,
      chunkTokens: config.rag.chunkTokens,
      overlapTokens: config.rag.overlapTokens,
    });
    const chunkStart = Date.now();
    const chunks = chunkText(cleanText, { page: null, section: null });
    const chunkDurationMs = Date.now() - chunkStart;
    logger.info('[Ingestion] Chunking completed', {
      documentId,
      chunkCount: chunks.length,
      durationMs: chunkDurationMs,
    });

    if (chunks.length === 0) {
      throw new Error('Chunking produced zero chunks.');
    }

    // Max chunk guard — protects against pathological documents
    const MAX_CHUNKS = 1000;
    if (chunks.length > MAX_CHUNKS) {
      throw new Error(
        `Document produced ${chunks.length} chunks, which exceeds the maximum allowed (${MAX_CHUNKS}).`
      );
    }

    // ── 8. Generate embeddings ───────────────────────────────────────────────
    const embeddingProvider = getEmbeddingProvider();
    const texts = chunks.map((c) => c.chunkText);
    logger.info('[Ingestion] Embedding started', {
      documentId,
      chunkCount: texts.length,
    });
    const embedStart = Date.now();
    const embeddings = await _withTimeout(
      embeddingProvider.generateEmbeddings(texts),
      TIMEOUT.embedding,
      'embedding-generation'
    );
    const embedDurationMs = Date.now() - embedStart;
    logger.info('[Ingestion] Embedding completed', {
      documentId,
      chunkCount: embeddings.length,
      durationMs: embedDurationMs,
    });

    const chunksWithEmbeddings = chunks.map((c, i) => ({
      ...c,
      embedding: embeddings[i],
    }));

    // ── 9. Persist chunks in a transaction ───────────────────────────────────
    logger.info('[Ingestion] Storing chunks', { documentId, chunkCount: chunksWithEmbeddings.length });
    const dbStart = Date.now();
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
    const dbDurationMs = Date.now() - dbStart;

    const totalDurationMs = Date.now() - pipelineStart;
    logger.info('[Ingestion] Document status changed to ready', {
      documentId,
      topicId: docRecord.topic_id,
      teacherId: docRecord.teacher_id,
      chunkCount: chunks.length,
      extractionMs: extractDurationMs,
      normalizationMs: normDurationMs,
      chunkingMs: chunkDurationMs,
      embeddingGenerationMs: embedDurationMs,
      databaseInsertMs: dbDurationMs,
      totalDurationMs,
    });

  } catch (err) {
    const totalDurationMs = Date.now() - pipelineStart;
    logger.error('[Ingestion] Processing failed', {
      documentId,
      topicId: docRecord?.topic_id,
      teacherId: docRecord?.teacher_id,
      stage: err.message.includes('extraction') ? 'extraction'
           : err.message.includes('embedding') ? 'embedding'
           : err.message.includes('chunk') ? 'chunking'
           : err.message.includes('timeout') ? 'timeout'
           : 'unknown',
      durationMs: totalDurationMs,
      error: err.message,
      stack: err.stack,
    });
    try {
      await docRepo.setStatus(documentId, 'failed', {
        failureMessage: err.message.slice(0, 500),
      });
    } catch (updateErr) {
      logger.error('[Ingestion] Could not update failure status', {
        documentId,
        error: updateErr.message,
      });
    }
  }
}

async function _fetchDocumentForProcessing(documentId, client) {
  // client.query returns [rows, fields] via the connection.js shim —
  // destructure the same way every repository does.
  const [rows] = await client.query(
    `SELECT id, topic_id, teacher_id, file_path, file_type, status, retry_count
     FROM knowledge_documents WHERE id = $1`,
    [documentId]
  );
  return rows[0] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Startup crash recovery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called once at server startup.
 *
 * Any document left in 'processing' state means the server crashed or was
 * restarted mid-pipeline.  We reset those documents back to 'uploaded' so
 * they are re-queued and eventually reach 'ready' or 'failed'.
 *
 * Safe to call multiple times — only rows stuck in 'processing' are affected.
 */
async function recoverStuckDocuments() {
  try {
    const [rows] = await pool.query(
      `UPDATE knowledge_documents
       SET status = 'uploaded', updated_at = NOW()
       WHERE status = 'processing'
       RETURNING id, topic_id, teacher_id`
    );
    if (rows.length > 0) {
      logger.warn('[Ingestion] Startup recovery: reset stuck processing documents', {
        count: rows.length,
        ids: rows.map((r) => r.id),
      });
      // Re-queue all recovered documents
      for (const row of rows) {
        setImmediate(() => {
          _processDocumentAsync(row.id).catch((err) => {
            logger.error('[Ingestion] Unhandled error during recovery processing', {
              documentId: row.id,
              error: err.message,
              stack: err.stack,
            });
          });
        });
      }
    } else {
      logger.info('[Ingestion] Startup recovery: no stuck documents found.');
    }
  } catch (err) {
    logger.error('[Ingestion] Startup recovery failed', { error: err.message, stack: err.stack });
  }
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
  logger.info('[Ingestion] Upload accepted', {
    topicId,
    teacherId,
    originalFilename,
    fileType,
    fileSizeBytes,
  });

  // Content hash for deduplication (async — does not block the event loop)
  const contentHash = await _hashFile(filePath);

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
  logger.info('[Ingestion] Document record created', {
    documentId: doc.id,
    topicId,
    teacherId,
    status: doc.status,
  });

  // Kick off async processing — intentionally NOT awaited.
  // Any unhandled error inside _processDocumentAsync is caught internally
  // and written to the DB as status='failed'. The .catch() here is a final
  // safety net to guarantee no silent crash escapes the async context.
  setImmediate(() => {
    _processDocumentAsync(doc.id).catch((err) => {
      logger.error('[Ingestion] Unhandled error in background processing', {
        documentId: doc.id,
        error: err.message,
        stack: err.stack,
      });
    });
  });
  logger.info('[Ingestion] Background processing started', { documentId: doc.id });

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

  logger.info('[Ingestion] Document queued for retry', { documentId, retryCount: reset.retry_count });

  // Re-trigger async processing
  setImmediate(() => {
    _processDocumentAsync(documentId).catch((err) => {
      logger.error('[Ingestion] Unhandled error in background retry processing', {
        documentId,
        error: err.message,
        stack: err.stack,
      });
    });
  });

  return reset;
}

module.exports = { registerAndProcess, retryDocument, recoverStuckDocuments };
