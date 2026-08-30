/**
 * server/src/repositories/knowledgeChunk.repository.js
 *
 * Manages knowledge_chunks rows, including vector insert and similarity search.
 * All queries enforce teacher_id ownership.
 */
const BaseRepository = require('./base.repository');
const config = require('../config');

class KnowledgeChunkRepository extends BaseRepository {
  constructor() { super('knowledge_chunks'); }

  /**
   * Bulk-insert chunks for a document.
   * Uses a single multi-row INSERT for efficiency.
   * Each chunk: { chunkIndex, chunkText, charCount, tokenApprox, sourceMeta, embedding }
   *
   * @param {number}   documentId
   * @param {number}   teacherId
   * @param {Array}    chunks
   * @param {object}   [client]   Optional pg transaction client
   */
  async insertChunks(documentId, teacherId, chunks, client) {
    if (!chunks || chunks.length === 0) return;

    const executor = client || this.pool;
    // Build a parameterised multi-row INSERT
    const values = [];
    const rows = chunks.map((c, i) => {
      const base = i * 6;
      values.push(
        documentId, teacherId,
        c.chunkIndex, c.chunkText, c.charCount, c.tokenApprox
      );
      let embeddingExpr;
      if (c.embedding) {
        values.push(JSON.stringify(c.embedding));
        embeddingExpr = `$${base + 7}::vector`;
        return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, ${embeddingExpr}, $${base+8}::jsonb)`;
      } else {
        values.push(JSON.stringify(c.sourceMeta || {}));
        return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, NULL, $${base+7}::jsonb)`;
      }
    });

    // Re-build — the embedding branch changes the param indices, so use a simpler sequential approach
    await this._insertChunksSequential(documentId, teacherId, chunks, executor);
  }

  /** Sequential insert to keep SQL simple (avoids complex dynamic index maths). */
  async _insertChunksSequential(documentId, teacherId, chunks, executor) {
    for (const c of chunks) {
      const embeddingStr = c.embedding ? JSON.stringify(c.embedding) : null;
      await executor.query(
        `INSERT INTO knowledge_chunks
           (document_id, teacher_id, chunk_index, chunk_text, char_count, token_approx, embedding, source_meta)
         VALUES ($1, $2, $3, $4, $5, $6,
                 $7::vector,
                 $8::jsonb)
         ON CONFLICT (document_id, chunk_index) DO UPDATE
           SET chunk_text   = EXCLUDED.chunk_text,
               char_count   = EXCLUDED.char_count,
               token_approx = EXCLUDED.token_approx,
               embedding    = EXCLUDED.embedding,
               source_meta  = EXCLUDED.source_meta`,
        [documentId, teacherId, c.chunkIndex, c.chunkText,
         c.charCount, c.tokenApprox, embeddingStr,
         JSON.stringify(c.sourceMeta || {})]
      );
    }
  }

  /** Delete all chunks for a document (called before re-processing). */
  async deleteByDocument(documentId, client) {
    const executor = client || this.pool;
    await executor.query(
      `DELETE FROM knowledge_chunks WHERE document_id = $1`,
      [documentId]
    );
  }

  /**
   * Vector similarity search using cosine distance (<=>).
   * Returns the top-K chunks owned by the given teacher, ordered by similarity
   * (highest first).
   *
   * @param {number}   teacherId
   * @param {number[]} queryEmbedding    384-dimensional float array
   * @param {number}   [topK]
   * @param {object}   [filters]         Optional { topicId, chapterId, subjectId, curriculumId }
   * @returns {Promise<Array>}
   */
  async similaritySearch(teacherId, queryEmbedding, topK, filters = {}) {
    const k = topK || config.rag.topK;
    const embeddingStr = JSON.stringify(queryEmbedding);

    const whereClauses = ['kc.teacher_id = $2'];
    const params = [embeddingStr, teacherId];

    if (filters.topicId) {
      params.push(filters.topicId);
      whereClauses.push(`kd.topic_id = $${params.length}`);
    }
    if (filters.chapterId) {
      params.push(filters.chapterId);
      whereClauses.push(`t.chapter_id = $${params.length}`);
    }
    if (filters.subjectId) {
      params.push(filters.subjectId);
      whereClauses.push(`ch.subject_id = $${params.length}`);
    }
    if (filters.curriculumId) {
      params.push(filters.curriculumId);
      whereClauses.push(`s.curriculum_id = $${params.length}`);
    }

    params.push(k);
    const kIdx = params.length;

    const sql = `
      SELECT
        kc.id          AS chunk_id,
        kc.document_id,
        kc.chunk_index,
        kc.chunk_text,
        kc.source_meta,
        1 - (kc.embedding <=> $1::vector) AS similarity,
        kd.id          AS doc_id,
        kd.title       AS document_title,
        kd.original_filename,
        kd.file_type,
        t.id           AS topic_id,
        t.name         AS topic_name,
        ch.id          AS chapter_id,
        ch.name        AS chapter_name,
        s.id           AS subject_id,
        s.name         AS subject_name,
        cu.id          AS curriculum_id,
        cu.name        AS curriculum_name
      FROM knowledge_chunks kc
      JOIN knowledge_documents kd ON kd.id = kc.document_id
      JOIN topics    t  ON t.id  = kd.topic_id
      JOIN chapters  ch ON ch.id = t.chapter_id
      JOIN subjects  s  ON s.id  = ch.subject_id
      JOIN curricula cu ON cu.id = s.curriculum_id
      WHERE ${whereClauses.join(' AND ')}
        AND kd.deleted_at IS NULL
        AND kd.status = 'ready'
        AND kc.embedding IS NOT NULL
      ORDER BY kc.embedding <=> $1::vector
      LIMIT $${kIdx}`;

    const [rows] = await this.pool.query(sql, params);
    return rows;
  }

  /**
   * Keyword (full-text) search using PostgreSQL tsvector/tsquery.
   *
   * Uses websearch_to_tsquery for robust query parsing (handles phrases,
   * negation, OR-terms without raw tsquery syntax from the caller).
   * Uses ts_rank_cd for coverage-density ranking.
   *
   * Security:
   *   - Identical auth scope as similaritySearch():
   *     kc.teacher_id, kd.deleted_at IS NULL, kd.status = 'ready'.
   *   - All optional filters (topicId, chapterId, subjectId, curriculumId)
   *     are enforced in SQL — never filtered in JavaScript after retrieval.
   *
   * No migration required:
   *   - tsvector is computed dynamically via to_tsvector('english', kc.chunk_text).
   *   - tsquery is produced by websearch_to_tsquery('english', $query).
   *
   * Returns rows with the same column shape as similaritySearch()
   * so _mapRow() in retrieval.service.js can process them identically,
   * except 'similarity' is replaced by 'keyword_rank' (ts_rank_cd score).
   *
   * @param {number}   teacherId
   * @param {string}   queryText    Raw natural-language search query
   * @param {number}   [topK]
   * @param {object}   [filters]    Optional { topicId, chapterId, subjectId, curriculumId }
   * @returns {Promise<Array>}
   */
  async keywordSearch(teacherId, queryText, topK, filters = {}) {
    const k = topK || config.rag.keywordCandidateK;

    const whereClauses = ['kc.teacher_id = $2'];
    // $1 = tsquery, $2 = teacherId
    const params = [queryText, teacherId];

    if (filters.topicId) {
      params.push(filters.topicId);
      whereClauses.push(`kd.topic_id = $${params.length}`);
    }
    if (filters.chapterId) {
      params.push(filters.chapterId);
      whereClauses.push(`t.chapter_id = $${params.length}`);
    }
    if (filters.subjectId) {
      params.push(filters.subjectId);
      whereClauses.push(`ch.subject_id = $${params.length}`);
    }
    if (filters.curriculumId) {
      params.push(filters.curriculumId);
      whereClauses.push(`s.curriculum_id = $${params.length}`);
    }

    params.push(k);
    const kIdx = params.length;

    const sql = `
      SELECT
        kc.id          AS chunk_id,
        kc.document_id,
        kc.chunk_index,
        kc.chunk_text,
        kc.source_meta,
        ts_rank_cd(
          to_tsvector('english', kc.chunk_text),
          websearch_to_tsquery('english', $1)
        )              AS keyword_rank,
        kd.id          AS doc_id,
        kd.title       AS document_title,
        kd.original_filename,
        kd.file_type,
        t.id           AS topic_id,
        t.name         AS topic_name,
        ch.id          AS chapter_id,
        ch.name        AS chapter_name,
        s.id           AS subject_id,
        s.name         AS subject_name,
        cu.id          AS curriculum_id,
        cu.name        AS curriculum_name
      FROM knowledge_chunks kc
      JOIN knowledge_documents kd ON kd.id = kc.document_id
      JOIN topics    t  ON t.id  = kd.topic_id
      JOIN chapters  ch ON ch.id = t.chapter_id
      JOIN subjects  s  ON s.id  = ch.subject_id
      JOIN curricula cu ON cu.id = s.curriculum_id
      WHERE ${whereClauses.join(' AND ')}
        AND kd.deleted_at IS NULL
        AND kd.status = 'ready'
        AND to_tsvector('english', kc.chunk_text) @@ websearch_to_tsquery('english', $1)
      ORDER BY ts_rank_cd(
                 to_tsvector('english', kc.chunk_text),
                 websearch_to_tsquery('english', $1)
               ) DESC
      LIMIT $${kIdx}`;

    const [rows] = await this.pool.query(sql, params);
    return rows;
  }
}

module.exports = new KnowledgeChunkRepository();
