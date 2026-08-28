/**
 * server/src/services/ai/providers/LocalEmbeddingProvider.js
 *
 * Embedding provider using @xenova/transformers (ONNX runtime, runs locally).
 * No external API key required.  The model weights are downloaded on first use
 * and cached in the local filesystem.
 *
 * Default model: Xenova/all-MiniLM-L6-v2  (384 dimensions, ~22M params)
 *   — fast, small, high quality for semantic similarity tasks.
 *   — fully open-source Apache-2.0 licence.
 *
 * APPROXIMATION NOTE:
 *   Token count is approximated as Math.ceil(charCount / 4) — a standard
 *   rule-of-thumb for English text.  This is used only for metadata storage
 *   and chunking heuristics, never for billing or hard limits.  If an exact
 *   token count is needed, replace the approximation with a proper tokenizer.
 */
const EmbeddingProvider = require('./EmbeddingProvider');
const config = require('../../../config');
const logger = require('../../../utils/logger.util');

class LocalEmbeddingProvider extends EmbeddingProvider {
  constructor() {
    super();
    this._pipeline = null;
    this._model = config.embedding.model;
  }

  /**
   * Lazily load the pipeline on first use.
   * @private
   */
  async _getPipeline() {
    if (this._pipeline) return this._pipeline;

    logger.info('[Embedding] Loading local model…', { model: this._model });
    // Dynamic import: @xenova/transformers is an ES module.
    const { pipeline } = await import('@xenova/transformers');
    this._pipeline = await pipeline('feature-extraction', this._model, {
      quantized: true,  // use int8-quantised weights for faster inference
    });
    logger.info('[Embedding] Local model ready.', { model: this._model });
    return this._pipeline;
  }

  /**
   * Generate a single embedding.
   * The output is a mean-pooled, normalised vector.
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async generateEmbedding(text) {
    const pipe = await this._getPipeline();
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  /**
   * Batch embedding (sequential under the hood — override if the model
   * supports true batch inference in a future version).
   * @param {string[]} texts
   * @returns {Promise<number[][]>}
   */
  async generateEmbeddings(texts) {
    const pipe = await this._getPipeline();
    const results = [];
    for (const text of texts) {
      const output = await pipe(text, { pooling: 'mean', normalize: true });
      results.push(Array.from(output.data));
    }
    return results;
  }
}

module.exports = LocalEmbeddingProvider;
