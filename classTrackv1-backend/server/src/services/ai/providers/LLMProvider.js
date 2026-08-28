/**
 * server/src/services/ai/providers/LLMProvider.js
 *
 * Abstract interface for LLM providers.
 * Every concrete provider MUST implement:
 *   generateText(prompt, options)            → Promise<string>
 *   generateStructuredOutput(prompt, schema) → Promise<object>
 */
class LLMProvider {
  /**
   * Generate a text response given a system + user prompt.
   * @param {{ system: string, user: string }} messages
   * @param {{ temperature?: number, maxTokens?: number }} [options]
   * @returns {Promise<string>}
   */
  // eslint-disable-next-line no-unused-vars
  async generateText(messages, options = {}) {
    throw new Error('LLMProvider.generateText() must be implemented');
  }

  /**
   * Generate a structured (JSON) response.
   * @param {{ system: string, user: string }} messages
   * @param {{ temperature?: number, maxTokens?: number }} [options]
   * @returns {Promise<object>}
   */
  // eslint-disable-next-line no-unused-vars
  async generateStructuredOutput(messages, options = {}) {
    throw new Error('LLMProvider.generateStructuredOutput() must be implemented');
  }
}

module.exports = LLMProvider;
