/**
 * server/src/repositories/knowledgeDocument.repository.js
 *
 * Manages knowledge_documents rows.
 * Every query enforces teacher_id ownership.
 */
const BaseRepository = require('./base.repository');

class KnowledgeDocumentRepository extends BaseRepository {
  constructor() { super('knowledge_documents'); }

  async listByTopic(topicId, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT id, topic_id, title, original_filename, file_type, file_size_bytes,
              version, parent_document_id, status, failure_message, retry_count,
              processed_at, total_chunks, created_at, updated_at
       FROM knowledge_documents
       WHERE topic_id = $1 AND teacher_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [topicId, teacherId]
    );
    return rows;
  }

  async findOwnedById(id, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT * FROM knowledge_documents
       WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL`,
      [id, teacherId]
    );
    return rows[0] || null;
  }

  /**
   * Find a document by its SHA-256 content hash (deduplication check).
   * Only looks within the same teacher's documents.
   */
  async findByHash(contentHash, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT id, title, status, version FROM knowledge_documents
       WHERE content_hash = $1 AND teacher_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [contentHash, teacherId]
    );
    return rows[0] || null;
  }

  async create({ topicId, teacherId, title, originalFilename, filePath, fileType, fileSizeBytes, contentHash, parentDocumentId, version }) {
    const [rows] = await this.pool.query(
      `INSERT INTO knowledge_documents
         (topic_id, teacher_id, title, original_filename, file_path, file_type,
          file_size_bytes, content_hash, parent_document_id, version, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'uploaded')
       RETURNING id, title, status, created_at`,
      [topicId, teacherId, title, originalFilename, filePath, fileType,
       fileSizeBytes || null, contentHash || null,
       parentDocumentId || null, version || 1]
    );
    return rows[0];
  }

  async setStatus(id, status, extra = {}) {
    const { failureMessage, totalChunks, retryCount } = extra;
    const [rows] = await this.pool.query(
      `UPDATE knowledge_documents
       SET status = $1,
           failure_message  = COALESCE($2, failure_message),
           total_chunks     = COALESCE($3, total_chunks),
           retry_count      = COALESCE($4, retry_count),
           processed_at     = CASE WHEN $1 = 'ready' THEN NOW() ELSE processed_at END,
           last_attempted_at = CASE WHEN $1 = 'processing' THEN NOW() ELSE last_attempted_at END,
           updated_at       = NOW()
       WHERE id = $5
       RETURNING id, status`,
      [status, failureMessage ?? null, totalChunks ?? null, retryCount ?? null, id]
    );
    return rows[0] || null;
  }

  /** Reset a failed document for re-processing. */
  async resetForRetry(id, teacherId) {
    const [rows] = await this.pool.query(
      `UPDATE knowledge_documents
       SET status = 'uploaded', failure_message = NULL, retry_count = retry_count + 1, updated_at = NOW()
       WHERE id = $1 AND teacher_id = $2 AND status = 'failed'
       RETURNING id, retry_count`,
      [id, teacherId]
    );
    return rows[0] || null;
  }

  async softDeleteOwned(id, teacherId) {
    const [rows] = await this.pool.query(
      `UPDATE knowledge_documents
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, teacherId]
    );
    return rows.length > 0;
  }

  /** Fetch documents stuck in 'processing' for longer than a threshold (crash recovery). */
  async findStuckProcessing(thresholdMinutes = 30) {
    const [rows] = await this.pool.query(
      `SELECT id, teacher_id, retry_count FROM knowledge_documents
       WHERE status = 'processing'
         AND last_attempted_at < NOW() - ($1 * interval '1 minute')`,
      [thresholdMinutes]
    );
    return rows;
  }
}

module.exports = new KnowledgeDocumentRepository();
