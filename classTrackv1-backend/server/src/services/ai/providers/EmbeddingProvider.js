/**
 * server/src/services/ai/providers/EmbeddingProvider.js
 *
 * Abstract interface for embedding providers.
 * Every concrete provider MUST implement:
 *   generateEmbedding(text)   → Promise<number[]>
 *   generateEmbeddings(texts) → Promise<number[][]>
 *
 * The dimension property MUST match config.embedding.dimension.
 * Business logic depends ONLY on this interface — never on a concrete class.
 */
class EmbeddingProvider {
  /**
   * Generate a single embedding vector for the given text.
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async generateEmbedding(text) {
    throw new Error('EmbeddingProvider.generateEmbedding() must be implemented');
  }

  /**
   * Generate embedding vectors for multiple texts.
   * Default: sequential calls to generateEmbedding().
   * Providers with batch APIs should override this for efficiency.
   * @param {string[]} texts
   * @returns {Promise<number[][]>}
   */
  async generateEmbeddings(texts) {
    const results = [];
    for (const text of texts) {
      results.push(await this.generateEmbedding(text));
    }
    return results;
  }
}

module.exports = EmbeddingProvider;
