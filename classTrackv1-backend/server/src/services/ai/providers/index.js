/**
 * server/src/services/ai/providers/index.js
 *
 * Provider factory.  Returns singleton instances of the configured providers.
 * Import from here — never instantiate providers directly in services/controllers.
 */
const config = require('../../../config');
const LocalEmbeddingProvider = require('./LocalEmbeddingProvider');
const GroqLLMProvider = require('./GroqLLMProvider');

// ── Embedding provider ────────────────────────────────────────────────────────
// Currently only 'local' is supported.  To add a new provider:
//   1. Create a class that extends EmbeddingProvider
//   2. Register it below
//   3. Set EMBEDDING_PROVIDER in the environment
let _embeddingProvider = null;

function getEmbeddingProvider() {
  if (_embeddingProvider) return _embeddingProvider;
  const type = config.embedding.provider;
  if (type === 'local') {
    _embeddingProvider = new LocalEmbeddingProvider();
  } else {
    throw new Error(`[EmbeddingProvider] Unknown provider "${type}". Supported: local`);
  }
  return _embeddingProvider;
}

// ── LLM provider ──────────────────────────────────────────────────────────────
let _llmProvider = null;

function getLLMProvider() {
  if (_llmProvider) return _llmProvider;
  _llmProvider = new GroqLLMProvider();
  return _llmProvider;
}

module.exports = { getEmbeddingProvider, getLLMProvider };
