/**
 * server/src/services/knowledge/retrieval.service.js
 *
 * Production-grade RAG Retrieval Service — Sprint 8 Hardening
 *
 * Two-stage retrieval strategy:
 *   Stage 1 (candidateK):  Fetch up to RAG_CANDIDATE_K chunks from pgvector.
 *   Stage 2 (finalK):      Filter by minSimilarity → diversity → take top RAG_FINAL_K.
 *
 * Security:
 *   - All queries enforce teacher_id (never trusts request body).
 *   - topic_id filter applied whenever provided (prevents cross-topic contamination).
 *   - Only retrieves from documents with status='ready' AND deleted_at IS NULL.
 *
 * Embedding dimension guard:
 *   - Every generated query embedding is validated against config.embedding.dimension.
 *   - Dimension mismatch throws BEFORE reaching PostgreSQL, not silently.
 *
 * Source metadata:
 *   - Returns structured { chunkId, documentId, topicId, similarity, content,
 *     chunkIndex, pageNumber, sectionHeading, documentTitle } per chunk.
 *
 * Observability:
 *   - Structured [RAG] logs with requestId, timing, counts, similarity.
 *   - Never logs JWT, passwords, API keys, or full document contents.
 */
const config    = require('../../config');
const logger    = require('../../utils/logger.util');
const { getEmbeddingProvider } = require('../ai/providers');
const chunkRepo = require('../../repositories/knowledgeChunk.repository');

// ── Constants ─────────────────────────────────────────────────────────────────

const EXPECTED_DIM = config.embedding.dimension;  // 384 for all-MiniLM-L6-v2

// Maximum number of chunks from the same document window (consecutive indices)
// that can appear in the final context (diversity rule).
const MAX_CONSECUTIVE_FROM_SAME_DOC = 3;

// ── Dimension guard ───────────────────────────────────────────────────────────

/**
 * Throw immediately if the embedding vector has the wrong dimensionality.
 * Prevents a silent wrong-dimension vector from reaching PostgreSQL, which
 * would either error opaquely or (worse) silently cast and return garbage results.
 *
 * @param {number[]} embedding
 * @param {string}   [context]  Label for error message (e.g. 'query')
 */
function _assertDimension(embedding, context = 'embedding') {
  if (!Array.isArray(embedding) || embedding.length !== EXPECTED_DIM) {
    throw new Error(
      `[RAG] Dimension mismatch: expected ${EXPECTED_DIM}-dimensional ${context} vector, ` +
      `got ${Array.isArray(embedding) ? embedding.length : typeof embedding}. ` +
      `Verify EMBEDDING_MODEL and EMBEDDING_DIMENSION match the stored vectors.`
    );
  }
}

// ── Diversity / deduplication filter ─────────────────────────────────────────

/**
 * Apply simple diversity rules to the similarity-filtered candidates.
 *
 * Rules applied in order:
 *   1. Already filtered by minSimilarity before this function.
 *   2. Reject near-identical content (text prefix match, first 120 chars).
 *   3. Allow at most MAX_CONSECUTIVE_FROM_SAME_DOC chunks with consecutive
 *      chunk_index values from the same document (reduces overlapping content).
 *   4. Return up to finalK chunks.
 *
 * @param {object[]} candidates  Already sorted descending by similarity.
 * @param {number}   finalK
 * @returns {object[]}
 */
function _applyDiversity(candidates, finalK) {
  const selected = [];
  // Track text prefixes to reject near-duplicates
  const seenPrefixes = new Set();
  // Track consecutive-chunk runs per document:  docId → { lastIndex, count }
  const docWindowState = new Map();

  for (const chunk of candidates) {
    if (selected.length >= finalK) break;

    // ── Near-duplicate detection (first 120 chars) ──────────────────────────
    const prefix = (chunk.content || '').slice(0, 120).trim();
    if (prefix.length >= 40 && seenPrefixes.has(prefix)) continue;

    // ── Consecutive-window limit per document ───────────────────────────────
    const docId = chunk.documentId;
    const ci    = chunk.chunkIndex;
    const state = docWindowState.get(docId);

    if (state) {
      if (ci === state.lastIndex + 1) {
        // Consecutive chunk from the same document
        if (state.count >= MAX_CONSECUTIVE_FROM_SAME_DOC) {
          // Skip to avoid filling context with heavily overlapping chunks
          continue;
        }
        state.count++;
        state.lastIndex = ci;
      } else {
        // Non-consecutive — reset the run counter
        docWindowState.set(docId, { lastIndex: ci, count: 1 });
      }
    } else {
      docWindowState.set(docId, { lastIndex: ci, count: 1 });
    }

    if (prefix.length >= 40) seenPrefixes.add(prefix);
    selected.push(chunk);
  }

  return selected;
}

// ── Result mapper ─────────────────────────────────────────────────────────────

/**
 * Map a raw DB row returned by chunkRepo.similaritySearch into the structured
 * retrieval result shape used by the rest of the application.
 *
 * source_meta JSONB shape (from ingestion pipeline): { page, section }
 */
function _mapRow(row) {
  const meta = row.source_meta || {};
  return {
    chunkId:        row.chunk_id,
    documentId:     row.doc_id,
    topicId:        row.topic_id,
    similarity:     parseFloat(Number(row.similarity).toFixed(4)),
    content:        row.chunk_text,
    // Legacy alias used by questionGeneration.service.js
    text:           row.chunk_text,
    chunkIndex:     row.chunk_index,
    pageNumber:     meta.page    ?? null,
    sectionHeading: meta.section ?? null,
    documentTitle:  row.document_title,
    source: {
      documentId:       row.doc_id,
      documentTitle:    row.document_title,
      originalFilename: row.original_filename,
      fileType:         row.file_type,
      sourceMeta:       row.source_meta,
      topic:      { id: row.topic_id,      name: row.topic_name },
      chapter:    { id: row.chapter_id,    name: row.chapter_name },
      subject:    { id: row.subject_id,    name: row.subject_name },
      curriculum: { id: row.curriculum_id, name: row.curriculum_name },
    },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Search the knowledge base for chunks semantically similar to the query.
 * Applies security filtering, similarity threshold, and diversity rules.
 *
 * @param {object}  params
 * @param {string}  params.query        Natural language search query
 * @param {number}  params.teacherId    Ownership filter (always required)
 * @param {number}  [params.topK]       Override candidateK (for backwards compat)
 * @param {object}  [params.filters]    Optional { topicId, chapterId, subjectId, curriculumId }
 * @param {string}  [params.requestId]  For structured logging
 *
 * @returns {Promise<{
 *   results: object[],          Diversity-filtered final chunks
 *   candidates: number,         Count before diversity filter
 *   bestSimilarity: number|null,
 *   belowThreshold: boolean     True when best similarity < minSimilarity
 * }>}
 */
async function search({ query, teacherId, topK, filters = {}, requestId }) {
  if (!query || query.trim().length === 0) {
    throw new Error('Search query cannot be empty.');
  }
  if (!teacherId) {
    throw new Error('[RAG] teacherId is required for security filtering.');
  }

  const candidateK    = topK || config.rag.candidateK;
  const finalK        = config.rag.finalK;
  const minSimilarity = config.rag.minSimilarity;

  const logCtx = { requestId, teacherId, topicId: filters.topicId, candidateK, finalK, minSimilarity };

  logger.debug('[RAG] Query received', { ...logCtx, queryLength: query.length });

  // ── Stage 1: Generate query embedding ─────────────────────────────────────
  const embeddingStart = Date.now();
  const embeddingProvider = getEmbeddingProvider();
  const queryEmbedding = await embeddingProvider.generateEmbedding(query.trim());
  const embeddingDurationMs = Date.now() - embeddingStart;

  logger.debug('[RAG] Query embedding generated', {
    ...logCtx,
    dimensions: Array.isArray(queryEmbedding) ? queryEmbedding.length : null,
    embeddingDurationMs,
  });

  // ── Dimension hard validation ──────────────────────────────────────────────
  _assertDimension(queryEmbedding, 'query');

  // ── Stage 1: Retrieve candidate chunks ────────────────────────────────────
  const retrievalStart = Date.now();
  logger.debug('[RAG] Retrieval started', logCtx);

  const rows = await chunkRepo.similaritySearch(teacherId, queryEmbedding, candidateK, filters);
  const retrievalDurationMs = Date.now() - retrievalStart;

  logger.debug('[RAG] Candidate chunks found', {
    ...logCtx,
    candidateCount: rows.length,
    retrievalDurationMs,
  });

  // ── Map rows to structured results ────────────────────────────────────────
  const mapped = rows.map(_mapRow);

  // ── Stage 2a: Similarity threshold filter ────────────────────────────────
  // The DB computes similarity = 1 - (embedding <=> queryVector).
  // We compare similarity (0-1), NOT distance.
  const aboveThreshold = mapped.filter((c) => c.similarity >= minSimilarity);

  const bestSimilarity = mapped.length > 0 ? mapped[0].similarity : null;
  const belowThreshold = aboveThreshold.length === 0;

  logger.debug('[RAG] Similarity filtering completed', {
    ...logCtx,
    beforeFilter: mapped.length,
    afterFilter: aboveThreshold.length,
    bestSimilarity,
    minSimilarity,
  });

  // ── Stage 2b: Diversity / deduplication ──────────────────────────────────
  const finalChunks = _applyDiversity(aboveThreshold, finalK);

  logger.debug('[RAG] Final context selected', {
    ...logCtx,
    finalChunkCount: finalChunks.length,
    documentIds: [...new Set(finalChunks.map((c) => c.documentId))],
  });

  return {
    results:       finalChunks,
    candidates:    rows.length,
    bestSimilarity,
    belowThreshold,
  };
}

/**
 * Build a structured context string for LLM consumption.
 *
 * Format:
 *   [Source 1]
 *   Document: <title>
 *   Page: <n>    (omitted when null)
 *   Section: <s> (omitted when null)
 *   Chunk ID: <id>
 *
 *   <content>
 *
 * Uses explicit source delimiters so the LLM can clearly distinguish
 * reference material from task instructions.
 *
 * @param {object[]} chunks   Final filtered chunks (from search().results)
 * @param {number}   [maxChars]  Hard character cap (default: config.questionGeneration.maxContextChars)
 * @returns {string}
 */
function buildContext(chunks, maxChars) {
  const cap = maxChars || config.questionGeneration.maxContextChars;
  let context = '';
  let sourceNum = 0;

  for (const chunk of chunks) {
    sourceNum++;
    const lines = [`[Source ${sourceNum}]`, `Document: ${chunk.documentTitle}`];
    if (chunk.pageNumber    != null)  lines.push(`Page: ${chunk.pageNumber}`);
    if (chunk.sectionHeading)         lines.push(`Section: ${chunk.sectionHeading}`);
    lines.push(`Chunk ID: ${chunk.chunkId}`);
    lines.push('');  // blank line before content
    lines.push(chunk.content);
    lines.push('');  // blank line after content

    const block = lines.join('\n');
    if ((context + block).length > cap) break;
    context += block;
  }

  return context.trim();
}

module.exports = { search, buildContext };
