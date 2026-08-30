/**
 * server/src/services/ai/providers/GroqLLMProvider.js
 *
 * Groq-hosted LLM provider implementing the LLMProvider interface.
 *
 * Uses the same groq-sdk already installed for grading (groq.service.js)
 * but through the clean provider abstraction so the RAG pipeline is
 * not coupled to Groq's SDK specifics.
 *
 * Configuration:
 *   GROQ_API_KEY  — required
 *   GROQ_RAG_MODEL — defaults to llama3-70b-8192
 */
const Groq        = require('groq-sdk');
const LLMProvider = require('./LLMProvider');
const config      = require('../../../config');
const logger      = require('../../../utils/logger.util');
const { estimateTokens } = require('../../../utils/tokenEstimate.util');

class GroqLLMProvider extends LLMProvider {
  constructor() {
    super();
    this._groq = new Groq({ apiKey: config.groq.apiKey });
    this._model = config.groq.ragModel;
  }

  /**
   * Generate a text response.
   * @param {{ system: string, user: string }} messages
   * @param {{ temperature?: number, maxTokens?: number }} [options]
   * @returns {Promise<string>}
   */
  async generateText({ system, user }, options = {}) {
    const completion = await this._groq.chat.completions.create({
      model:                 this._model,
      temperature:           options.temperature   ?? 0.3,
      max_completion_tokens: options.maxTokens     ?? 1024,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user },
      ],
    });
    const content = completion.choices?.[0]?.message?.content;
    if (!content) throw new Error('GroqLLMProvider: empty response from model');
    logger.debug('[GroqLLMProvider] generateText complete', { model: this._model });
    return content;
  }

  /**
   * Generate a structured (JSON) response.
   * @param {{ system: string, user: string }} messages
   * @param {{ temperature?: number, maxTokens?: number }} [options]
   * @returns {Promise<object>}
   */
  async generateStructuredOutput({ system, user }, options = {}) {
    const maxTokens = options.maxTokens ?? 2048;

    // ── Diagnostic: log request size metadata immediately before the API call ──
    // Safe metadata only — content is never logged.
    const systemChars        = (system || '').length;
    const userChars          = (user   || '').length;
    const estimatedInputTokens = estimateTokens(system) + estimateTokens(user);
    logger.info('[GroqLLMProvider] Request size', {
      model:                 this._model,
      systemChars,
      userChars,
      estimatedInputTokens,
      maxTokens,
      estimatedTotalRequestTokens: estimatedInputTokens + maxTokens,
    });

    let completion;
    try {
      completion = await this._groq.chat.completions.create({
        model:                 this._model,
        temperature:           options.temperature   ?? 0.1,
        max_completion_tokens: maxTokens,
        response_format:       { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: user },
        ],
      });
    } catch (sdkErr) {
      // Normalise Groq SDK errors so callers can check err.status reliably.
      // The SDK throws objects with a .status property for HTTP errors.
      // Re-throw as-is; the message is opaque to end users — upper layers
      // (questionGeneration.service.js) map specific codes to safe messages.
      logger.error('[GroqLLMProvider] API error', {
        model:   this._model,
        status:  sdkErr.status ?? sdkErr.statusCode ?? null,
        message: sdkErr.message,
      });
      throw sdkErr;
    }
    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) throw new Error('GroqLLMProvider: empty structured response');
    // Strip any accidental markdown fences
    const cleaned = raw.trim().replace(/^```json|^```|```$/gm, '').trim();
    const start = cleaned.indexOf('{');
    const end   = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('GroqLLMProvider: response contained no JSON object');
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

module.exports = GroqLLMProvider;
