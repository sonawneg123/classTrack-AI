/**
 * server/src/services/knowledge/reranker/index.js
 *
 * Reranker factory — returns a singleton CrossEncoderReranker instance.
 *
 * Import from here in retrieval.service.js; never instantiate directly.
 * This mirrors the pattern in src/services/ai/providers/index.js.
 *
 * Lazy instantiation: the reranker object is created on first call.
 * The underlying worker is started on the first rerank() call.
 */
const config = require('../../../config');
const logger = require('../../../utils/logger.util');
const CrossEncoderReranker = require('./CrossEncoderReranker');

let _rerankerInstance = null;

/**
 * Return the singleton reranker.
 * Returns null if reranking is disabled in config (RAG_RERANKER_ENABLED=false).
 *
 * @returns {CrossEncoderReranker|null}
 */
function getReranker() {
  if (!config.rag.reranker.enabled) {
    return null;
  }

  if (!_rerankerInstance) {
    logger.info('[Reranker] Initialising CrossEncoderReranker', {
      model: config.rag.reranker.model,
      candidateK: config.rag.reranker.candidateK,
    });
    _rerankerInstance = new CrossEncoderReranker();
  }

  return _rerankerInstance;
}

/**
 * Reset the singleton (for testing only).
 * @private
 */
function _resetReranker() {
  _rerankerInstance = null;
}

/**
 * Dispose the singleton reranker, terminating its worker thread.
 *
 * Intended for test teardown (`afterAll`) to prevent open-handle warnings.
 * Safe to call even when the reranker was never instantiated or is disabled.
 * Clears the singleton so a subsequent `getReranker()` call creates a fresh one.
 *
 * @returns {Promise<void>}
 */
async function disposeReranker() {
  if (_rerankerInstance) {
    await _rerankerInstance.dispose();
    _rerankerInstance = null;
  }
}

module.exports = { getReranker, _resetReranker, disposeReranker };
