/**
 * server/src/services/knowledge/retrieval.service.js
 *
 * Production-grade RAG Retrieval Service — Sprint 8 Hardening + Sprint 2 Hybrid
 *
 * Sprint 1 — Vector-only retrieval (PRESERVED, BACKWARD COMPATIBLE):
 *   Stage 1 (candidateK):  Fetch up to RAG_CANDIDATE_K chunks from pgvector.
 *   Stage 2 (finalK):      Filter by minSimilarity → diversity → take top RAG_FINAL_K.
 *
 * Sprint 2 Phase 1 — Hybrid Retrieval upgrade:
 *   Stage 1a: Vector search   → up to RAG_CANDIDATE_K chunks
 *   Stage 1b: Keyword search  → up to RAG_KEYWORD_CANDIDATE_K chunks (FTS)
 *   Stage 2:  RRF fusion      → deduplicated, rank-fused candidates
 *   Stage 3:  Quality gates   → similarity threshold (vector-only candidates),
 *                               diversity filter, final K cap
 *
 * Sprint 2 Phase 2 — Cross-Encoder Reranking:
 *   Stage 2b: Select top RAG_RERANKER_CANDIDATE_K after RRF
 *   Stage 2c: Cross-encoder reranker scores each (query, chunk) pair
 *   Stage 3:  Quality gates applied to reranked ordering
 *   Fallback: If reranker fails, logs error and continues with RRF ordering.
 *
 * Security (unchanged from Sprint 1):
 *   - All queries enforce teacher_id (never trusts request body).
 *   - topic_id filter applied whenever provided (prevents cross-topic contamination).
 *   - Only retrieves from documents with status='ready' AND deleted_at IS NULL.
 *   - Keyword search enforces identical authorization scope as vector search.
 *   - Reranker scores are never used for security/authorization decisions.
 *
 * Embedding dimension guard:
 *   - Every generated query embedding is validated against config.embedding.dimension.
 *   - Dimension mismatch throws BEFORE reaching PostgreSQL, not silently.
 *
 * Source metadata:
 *   - Returns structured { chunkId, documentId, topicId, similarity, content,
 *     chunkIndex, pageNumber, sectionHeading, documentTitle, retrievalMethod,
 *     rrfScore, rerankScore } per chunk.
 *
 * Observability:
 *   - Structured [RAG]/[Retrieval] logs with requestId, timing, counts, similarity.
 *   - retrievalMethod distribution logged for monitoring hybrid effectiveness.
 *   - Timing: vectorMs, keywordMs, fusionMs, rerankMs, totalMs.
 *   - Never logs JWT, passwords, API keys, or full document contents.
 */
const config    = require('../../config');
const logger    = require('../../utils/logger.util');
const { getEmbeddingProvider } = require('../ai/providers');
const chunkRepo = require('../../repositories/knowledgeChunk.repository');
const { fuseCandidates } = require('./retrieval.fuse');
const { getReranker }   = require('./reranker');
const { estimateTokens } = require('../../utils/tokenEstimate.util');

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
 * Compute the longest run of consecutive integers in a sorted array.
 * Returns 0 for an empty array.
 *
 * @param {number[]} sortedIndices  Must be sorted ascending.
 * @returns {number}
 */
function _maxConsecutiveRun(sortedIndices) {
  if (sortedIndices.length === 0) return 0;
  let maxRun = 1;
  let run    = 1;
  for (let i = 1; i < sortedIndices.length; i++) {
    if (sortedIndices[i] === sortedIndices[i - 1] + 1) {
      run++;
      if (run > maxRun) maxRun = run;
    } else {
      run = 1;
    }
  }
  return maxRun;
}

/**
 * Apply diversity rules to relevance-ordered candidates.
 *
 * Rules applied in order:
 *   1. Already filtered by minSimilarity before this function.
 *   2. Reject near-identical content (text prefix match, first 120 chars).
 *   3. Allow at most MAX_CONSECUTIVE_FROM_SAME_DOC chunks with consecutive
 *      chunk_index values from the same document — evaluated over the full
 *      set of already-selected chunks for that document (not just the last
 *      output-adjacent chunk).  This ensures the constraint holds regardless
 *      of how reranking reorders candidates before calling this function.
 *   4. Return up to finalK chunks.
 *
 * @param {object[]} candidates  Already sorted descending by relevance (rerankScore
 *                               or rrfScore).  The ordering is preserved as much as
 *                               possible; a chunk is only deferred when accepting it
 *                               would violate the consecutive-index constraint.
 * @param {number}   finalK
 * @returns {object[]}
 */
function _applyDiversity(candidates, finalK) {
  const selected = [];
  // Track text prefixes to reject near-duplicates
  const seenPrefixes = new Set();
  // Track ALL selected chunk indices per document (sorted ascending) so that
  // we can compute the true max-consecutive-run across the entire result set.
  // docId → number[]  (kept sorted)
  const docSelectedIndices = new Map();

  for (const chunk of candidates) {
    if (selected.length >= finalK) break;

    // ── Near-duplicate detection (first 120 chars) ──────────────────────────
    const prefix = (chunk.content || '').slice(0, 120).trim();
    if (prefix.length >= 40 && seenPrefixes.has(prefix)) continue;

    // ── Consecutive-window limit per document ───────────────────────────────
    // Determine whether adding this chunk would push the max consecutive run
    // for this document beyond the allowed limit.
    const docId = chunk.documentId;
    const ci    = chunk.chunkIndex;

    const existingIndices = docSelectedIndices.get(docId) || [];

    // Build hypothetical sorted index list with the new candidate
    const hypothetical = [...existingIndices, ci].sort((a, b) => a - b);
    if (_maxConsecutiveRun(hypothetical) > MAX_CONSECUTIVE_FROM_SAME_DOC) {
      // Adding this chunk would violate the consecutive limit — skip it
      continue;
    }

    // Accept the chunk
    if (prefix.length >= 40) seenPrefixes.add(prefix);
    docSelectedIndices.set(docId, hypothetical);
    selected.push(chunk);
  }

  return selected;
}

// ── Result mappers ────────────────────────────────────────────────────────────

/**
 * Map a raw DB row returned by chunkRepo.similaritySearch into the structured
 * retrieval result shape used by the rest of the application.
 *
 * source_meta JSONB shape (from ingestion pipeline): { page, section }
 *
 * Sprint 2: adds retrievalMethod = 'vector'
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
    retrievalMethod: 'vector',
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

/**
 * Map a raw DB row returned by chunkRepo.keywordSearch into the same structured
 * retrieval result shape.  keyword_rank replaces similarity.
 *
 * Sprint 2: retrievalMethod = 'keyword', similarity = null (no vector score)
 */
function _mapRowKeyword(row) {
  const meta = row.source_meta || {};
  return {
    chunkId:        row.chunk_id,
    documentId:     row.doc_id,
    topicId:        row.topic_id,
    // keyword-only chunks have no vector similarity score
    similarity:     null,
    keywordRank:    parseFloat(Number(row.keyword_rank).toFixed(6)),
    content:        row.chunk_text,
    // Legacy alias used by questionGeneration.service.js
    text:           row.chunk_text,
    chunkIndex:     row.chunk_index,
    pageNumber:     meta.page    ?? null,
    sectionHeading: meta.section ?? null,
    documentTitle:  row.document_title,
    retrievalMethod: 'keyword',
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
 * Search the knowledge base using hybrid retrieval:
 *   vector search (pgvector) + keyword search (PostgreSQL FTS) + RRF fusion.
 *
 * Applies security filtering, similarity threshold (for vector candidates),
 * diversity rules, and final K cap.
 *
 * Sprint 1 callers (questionGeneration.service.js, studentPractice.service.js,
 * knowledge.service.js) require no changes — return shape is backward-compatible.
 * The only new field is `retrievalMethod` per chunk.
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
 *   candidates: number,         Vector candidate count before diversity filter
 *   vectorCandidateCount: number,
 *   keywordCandidateCount: number,
 *   fusedCandidateCount: number,
 *   bestSimilarity: number|null,
 *   belowThreshold: boolean     True when best vector similarity < minSimilarity AND no keyword results
 * }>}
 */
async function search({ query, teacherId, topK, filters = {}, requestId }) {
  if (!query || query.trim().length === 0) {
    throw new Error('Search query cannot be empty.');
  }
  if (!teacherId) {
    throw new Error('[RAG] teacherId is required for security filtering.');
  }

  const candidateK         = topK || config.rag.candidateK;
  const keywordCandidateK  = config.rag.keywordCandidateK;
  const finalK             = config.rag.finalK;
  const minSimilarity      = config.rag.minSimilarity;
  const rrfK               = config.rag.rrfK;
  const rerankerCandidateK = config.rag.reranker.candidateK;

  const logCtx = {
    requestId,
    teacherId,
    topicId: filters.topicId,
    candidateK,
    keywordCandidateK,
    finalK,
    minSimilarity,
    rrfK,
    rerankerEnabled: config.rag.reranker.enabled,
  };

  logger.debug('[RAG] Query received', { ...logCtx, queryLength: query.length });

  const retrievalStart = Date.now();

  // ── Stage 1a: Generate query embedding ────────────────────────────────────
  const vectorStart = Date.now();
  const embeddingProvider = getEmbeddingProvider();
  const queryEmbedding = await embeddingProvider.generateEmbedding(query.trim());

  logger.debug('[RAG] Query embedding generated', {
    ...logCtx,
    dimensions: Array.isArray(queryEmbedding) ? queryEmbedding.length : null,
    embeddingMs: Date.now() - vectorStart,
  });

  // ── Dimension hard validation ──────────────────────────────────────────────
  _assertDimension(queryEmbedding, 'query');

  // ── Stage 1a+1b: Vector and keyword retrieval in parallel ─────────────────
  const [vectorRows, keywordRows] = await Promise.all([
    chunkRepo.similaritySearch(teacherId, queryEmbedding, candidateK, filters),
    chunkRepo.keywordSearch(teacherId, query.trim(), keywordCandidateK, filters),
  ]);

  const vectorMs             = Date.now() - vectorStart;
  const vectorCandidateCount  = vectorRows.length;
  const keywordCandidateCount = keywordRows.length;

  logger.debug('[RAG] Dual retrieval complete', {
    ...logCtx,
    vectorCandidateCount,
    keywordCandidateCount,
    vectorMs,
  });

  // ── Map rows to structured results ────────────────────────────────────────
  const mappedVector  = vectorRows.map(_mapRow);
  const mappedKeyword = keywordRows.map(_mapRowKeyword);

  // ── Stage 2: RRF fusion + deduplication ──────────────────────────────────
  const fusionStart = Date.now();
  const fused = fuseCandidates({
    vectorResults:  mappedVector,
    keywordResults: mappedKeyword,
    rrfK,
  });
  const fusionMs = Date.now() - fusionStart;

  const fusedCandidateCount = fused.length;

  logger.debug('[RAG] RRF fusion complete', {
    ...logCtx,
    fusedCandidateCount,
    fusionMs,
  });

  // ── Stage 2b+2c: Cross-encoder reranking (optional) ──────────────────────
  // Select top rerankerCandidateK from RRF, rerank them, then apply quality gates.
  // If reranking is disabled OR the reranker fails, fall back to RRF ordering.
  let rerankMs = 0;
  let rerankedCandidateCount = 0;
  let rerankerUsed = false;

  let orderedCandidates = fused; // default: RRF ordering

  const reranker = getReranker();
  if (reranker !== null && fused.length > 0) {
    // Slice top-N before sending to cross-encoder (performance guard)
    const toRerank = fused.slice(0, rerankerCandidateK);
    const rerankStart = Date.now();

    try {
      logger.debug('[Reranker] Reranking started', {
        requestId,
        candidateCount: toRerank.length,
        model: config.rag.reranker.model,
      });

      const rerankedSlice = await reranker.rerank(query.trim(), toRerank);
      rerankMs = Date.now() - rerankStart;
      rerankedCandidateCount = rerankedSlice.length;
      rerankerUsed = true;

      // Reranked slice replaces the head of the fused list.
      // Any candidates beyond rerankerCandidateK keep their RRF order appended.
      const tail = fused.slice(rerankerCandidateK);
      orderedCandidates = [...rerankedSlice, ...tail];

      logger.debug('[Reranker] Reranking completed', {
        requestId,
        rerankedCandidateCount,
        rerankMs,
      });
    } catch (rerankErr) {
      // OBSERVABLE fallback — never silently swallow
      rerankMs = Date.now() - rerankStart;
      logger.error('[Reranker] Reranking failed — falling back to RRF ordering', {
        requestId,
        model: config.rag.reranker.model,
        error: rerankErr.message,
        stack: rerankErr.stack,
        rerankMs,
      });
      // orderedCandidates already set to fused (RRF order) — deterministic fallback
    }
  }

  // ── Stage 3a: Similarity threshold for vector candidates ─────────────────
  // Quality gate design (unchanged from Phase 1):
  //   - Vector-containing chunks (retrievalMethod 'vector' or 'hybrid'):
  //     must pass similarity >= minSimilarity.
  //   - Keyword-only chunks (retrievalMethod 'keyword'):
  //     bypass the similarity threshold because they have no vector score.
  //     Their relevance is established by lexical match.
  // NOTE: rerankScore does NOT replace this security/quality gate.
  const afterThreshold = orderedCandidates.filter((c) => {
    if (c.retrievalMethod === 'keyword') {
      return true;
    }
    return c.similarity !== null && c.similarity >= minSimilarity;
  });

  // bestSimilarity from vector results (first vector/hybrid candidate in RRF order)
  const bestVectorChunk = fused.find((c) => c.similarity !== null);
  const bestSimilarity  = bestVectorChunk ? bestVectorChunk.similarity : null;

  // belowThreshold: true only when there are NO usable results at all
  const belowThreshold = afterThreshold.length === 0;

  logger.debug('[RAG] Similarity filtering completed', {
    ...logCtx,
    beforeFilter: orderedCandidates.length,
    afterFilter: afterThreshold.length,
    bestSimilarity,
    minSimilarity,
  });

  // ── Stage 3b: Diversity / deduplication ──────────────────────────────────
  const finalChunks = _applyDiversity(afterThreshold, finalK);

  // ── Compute retrievalMethod distribution for observability ────────────────
  const methodDist = finalChunks.reduce((acc, c) => {
    acc[c.retrievalMethod] = (acc[c.retrievalMethod] || 0) + 1;
    return acc;
  }, {});

  const totalMs = Date.now() - retrievalStart;

  // ── Structured [Retrieval] log ────────────────────────────────────────────
  logger.info('[Retrieval]', {
    requestId,
    query: query.slice(0, 60), // truncated, never logs full content
    topicId:               filters.topicId,
    vectorCandidateCount,
    keywordCandidateCount,
    fusedCandidateCount,
    rerankedCandidateCount,
    finalCandidateCount:   finalChunks.length,
    retrievalMethodDist:   methodDist,
    bestSimilarity,
    belowThreshold,
    rerankerUsed,
    vectorMs,
    fusionMs,
    rerankMs,
    totalMs,
  });

  logger.debug('[RAG] Final context selected', {
    ...logCtx,
    finalChunkCount: finalChunks.length,
    documentIds: [...new Set(finalChunks.map((c) => c.documentId))],
    methodDist,
  });

  return {
    results:              finalChunks,
    candidates:           vectorRows.length,   // backward compat: vector candidate count
    vectorCandidateCount,
    keywordCandidateCount,
    fusedCandidateCount,
    rerankedCandidateCount,
    bestSimilarity,
    belowThreshold,
    rerankerUsed,
  };
}

/**
 * Build a structured context string from retrieved chunks, respecting both a
 * character cap and an optional token budget.
 *
 * Format per chunk:
 *   [Source N]
 *   Document: <title>
 *   Page: <n>    (omitted when null)
 *   Section: <s> (omitted when null)
 *   Chunk ID: <id>
 *
 *   <content>
 *
 * Chunk selection order respects the input array order (caller is responsible
 * for sorting by rerankScore / rrfScore / similarity before calling).
 * Whole chunks are always preferred — a chunk is only excluded, never split.
 *
 * @param {object[]} chunks        Final filtered chunks (from search().results)
 * @param {number}   [maxChars]    Hard character cap (default: config.questionGeneration.maxContextChars)
 * @param {number}   [maxTokens]   Optional token budget for the context body.
 *                                 When provided, chunks are included only while
 *                                 cumulative estimated tokens stay within budget.
 *                                 Takes precedence over maxChars as the tighter constraint.
 * @returns {{ context: string, selectedCount: number, droppedCount: number,
 *             estimatedTokens: number, budgetTokens: number|null }}
 *
 * For backward compatibility, callers that previously used the return value as
 * a string should switch to buildContextString() or access .context directly.
 * buildContext() now returns an object to enable budget logging.
 */
function buildContext(chunks, maxChars, maxTokens) {
  const charCap     = maxChars  || config.questionGeneration.maxContextChars;
  const tokenBudget = (maxTokens != null && maxTokens > 0) ? maxTokens : null;

  let context       = '';
  let tokensSoFar   = 0;
  let selectedCount = 0;
  let sourceNum     = 0;

  for (const chunk of chunks) {
    sourceNum++;
    const lines = [`[Source ${sourceNum}]`, `Document: ${chunk.documentTitle}`];
    if (chunk.pageNumber    != null)  lines.push(`Page: ${chunk.pageNumber}`);
    if (chunk.sectionHeading)         lines.push(`Section: ${chunk.sectionHeading}`);
    lines.push(`Chunk ID: ${chunk.chunkId}`);
    lines.push('');  // blank line before content
    lines.push(chunk.content);
    lines.push('');  // blank line after content

    const block       = lines.join('\n');
    const blockTokens = estimateTokens(block);

    // Character cap check (fast guard)
    if ((context + block).length > charCap) break;

    // Token budget check — prefer whole chunks; never split
    if (tokenBudget !== null && (tokensSoFar + blockTokens) > tokenBudget) break;

    context       += block;
    tokensSoFar   += blockTokens;
    selectedCount++;
  }

  const droppedCount = chunks.length - selectedCount;

  return {
    context:         context.trim(),
    selectedCount,
    droppedCount,
    estimatedTokens: tokensSoFar,
    budgetTokens:    tokenBudget,
  };
}

/**
 * Backward-compatible wrapper that returns the context string only.
 * Prefer this for any caller that only needs the context text and does not
 * need the budget metadata.
 *
 * @param {object[]} chunks
 * @param {number}   [maxChars]
 * @returns {string}
 */
function buildContextString(chunks, maxChars) {
  return buildContext(chunks, maxChars).context;
}

module.exports = { search, buildContext, buildContextString };
