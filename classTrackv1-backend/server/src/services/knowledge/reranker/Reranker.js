/**
 * server/src/services/knowledge/reranker/Reranker.js
 *
 * Abstract base interface for reranker implementations.
 *
 * All concrete rerankers MUST implement:
 *   rerank(query, candidates) → Promise<object[]>
 *
 * Contract:
 *   Input:
 *     query      - string: the search query
 *     candidates - object[]: retrieval result objects, each containing at
 *                  minimum { chunkId, content, ... }
 *
 *   Output:
 *     Same objects as input with an additional `rerankScore` field (number).
 *     Sorted descending by rerankScore.
 *     All original metadata must be preserved (chunkId, similarity, rrfScore,
 *     retrievalMethod, source, etc.).
 *
 * This abstraction allows future reranker implementations to be swapped in
 * without touching retrieval.service.js (e.g. API-based rerankers, BM25+CE
 * hybrids, curriculum-specific rerankers).
 */
class Reranker {
  /**
   * Rerank candidates by scoring each (query, candidate.content) pair.
   *
   * @param {string}   query       - The search query
   * @param {object[]} candidates  - Fused retrieval candidates
   * @returns {Promise<object[]>}  - Candidates with rerankScore, sorted desc
   */
  // eslint-disable-next-line no-unused-vars
  async rerank(query, candidates) {
    throw new Error('Reranker.rerank() must be implemented');
  }
}

module.exports = Reranker;
