/**
 * server/src/services/knowledge/retrieval.fuse.js
 *
 * Sprint 2 — Reciprocal Rank Fusion (RRF) for Hybrid Retrieval
 *
 * Fuses ranked lists from vector search and keyword search into a single
 * combined ranking.  Designed to be isolated, stateless, and easily testable.
 *
 * RRF formula (Cormack, Clarke & Buettcher 2009):
 *
 *   score(d) = Σ  1 / (k + rank_i(d))
 *              i
 *
 * Where:
 *   k          = smoothing constant (default 60) — reduces the impact of high
 *                rank differences; a chunk ranked #1 in one system but absent
 *                from the other will not completely dominate.
 *   rank_i(d)  = 1-based rank of document d in source i
 *                (or N+1 if not present in that source, where N = list length)
 *
 * Why NOT (vectorScore + keywordScore)?
 *   Cosine similarity (0–1) and ts_rank_cd (0–1, often < 0.1 for typical queries)
 *   operate on completely different scales.  Summing them would give vector
 *   results an overwhelming advantage.  RRF is rank-based, so it is scale-invariant.
 */

/**
 * Fuse vector and keyword result lists using Reciprocal Rank Fusion.
 *
 * @param {object}   opts
 * @param {object[]} opts.vectorResults   Rows from similaritySearch (already mapped by _mapRow)
 * @param {object[]} opts.keywordResults  Rows from keywordSearch (already mapped by _mapRowKeyword)
 * @param {number}   [opts.rrfK=60]       RRF smoothing constant
 *
 * @returns {object[]}  Deduplicated, RRF-ordered candidates.
 *   Each result carries:
 *     - all fields from its highest-scoring source
 *     - rrfScore: combined RRF score
 *     - retrievalMethod: 'vector' | 'keyword' | 'hybrid'
 *     - similarity: preserved from vector result (or null for keyword-only)
 */
function fuseCandidates({ vectorResults, keywordResults, rrfK = 60 }) {
  // ── Build chunkId → rank maps ─────────────────────────────────────────────
  const vectorRankMap  = new Map(); // chunkId → 1-based rank in vectorResults
  const keywordRankMap = new Map(); // chunkId → 1-based rank in keywordResults

  for (let i = 0; i < vectorResults.length; i++) {
    vectorRankMap.set(vectorResults[i].chunkId, i + 1);
  }
  for (let i = 0; i < keywordResults.length; i++) {
    keywordRankMap.set(keywordResults[i].chunkId, i + 1);
  }

  // ── Determine the full set of candidate chunk IDs ─────────────────────────
  const allChunkIds = new Set([
    ...vectorResults.map((r) => r.chunkId),
    ...keywordResults.map((r) => r.chunkId),
  ]);

  // N+1 rank penalty for chunks absent from one of the lists
  const vectorPenaltyRank  = vectorResults.length  + 1;
  const keywordPenaltyRank = keywordResults.length + 1;

  // ── Build a lookup map from chunk objects ─────────────────────────────────
  const vectorById  = new Map(vectorResults.map((r) => [r.chunkId, r]));
  const keywordById = new Map(keywordResults.map((r) => [r.chunkId, r]));

  // ── Compute RRF scores + annotate retrieval method ────────────────────────
  const fused = [];

  for (const chunkId of allChunkIds) {
    const vRank = vectorRankMap.get(chunkId)  ?? vectorPenaltyRank;
    const kRank = keywordRankMap.get(chunkId) ?? keywordPenaltyRank;

    const rrfScore = (1 / (rrfK + vRank)) + (1 / (rrfK + kRank));

    // Prefer the vector result object (has similarity); fall back to keyword
    const baseObj = vectorById.get(chunkId) || keywordById.get(chunkId);

    let retrievalMethod;
    const inVector  = vectorRankMap.has(chunkId);
    const inKeyword = keywordRankMap.has(chunkId);

    if (inVector && inKeyword) {
      retrievalMethod = 'hybrid';
    } else if (inVector) {
      retrievalMethod = 'vector';
    } else {
      retrievalMethod = 'keyword';
    }

    fused.push({
      ...baseObj,
      retrievalMethod,
      rrfScore,
      // Preserve vector similarity (may be null for keyword-only chunks)
      similarity: baseObj.similarity ?? null,
    });
  }

  // ── Sort descending by RRF score ──────────────────────────────────────────
  fused.sort((a, b) => b.rrfScore - a.rrfScore);

  return fused;
}

module.exports = { fuseCandidates };
