/**
 * server/src/utils/tokenEstimate.util.js
 *
 * Conservative deterministic token estimator.
 *
 * EMPIRICAL CALIBRATION — READ THIS BEFORE CHANGING THE RATIO
 * ─────────────────────────────────────────────────────────────
 * On 2025-01-xx the Groq provider (openai/gpt-oss-120b / llama3-70b-8192)
 * reported an HTTP 413 with:
 *
 *   TPM Limit:  8,000
 *   Requested: 8,341
 *
 * At that point the retrieved context was 10,361 characters.
 * Groq reported the total request token count (input + max_completion_tokens)
 * as 8,341.  With max_completion_tokens = 4,096 that means the input was
 * approximately 4,245 tokens.
 *
 * 10,361 chars / 4,245 input tokens ≈ 2.44 chars/token for the full request
 * payload (system + user + context).  The raw context text alone would be
 * denser (less structural overhead), so the real ratio is approximately
 * 1.5–2.0 chars/token for educational text with structured metadata headers.
 *
 * The previous value of 3.5 chars/token underestimated by ~1.8×, causing
 * the budget guard to pass 10,361 chars as if it were only ~2,960 tokens.
 *
 * NEW CONSERVATIVE RATIO: 2.0 chars/token
 *   • Still slightly optimistic vs. the empirically observed ~1.5–2.44
 *   • Combined with QG_SAFETY_MARGIN_TOKENS this keeps us well below the
 *     provider limit
 *   • Any remaining approximation error is handled by the hard char cap
 *     (QG_MAX_CONTEXT_CHARS) which is set conservatively at 3,500 chars
 *
 * We deliberately do NOT pull in tiktoken or a HuggingFace tokenizer here;
 * adding a large dependency for one utility would be disproportionate.
 * Instead we rely on the dual-guard pattern (token budget + char cap) where
 * both bounds must pass independently.
 *
 * Usage:
 *   const { estimateTokens } = require('../utils/tokenEstimate.util');
 *   const tokens = estimateTokens('some text');  // → integer ≥ 1
 */

// 2.0 chars/token — conservative empirical calibration (see module-level comment)
const CHARS_PER_TOKEN = 2.0;

/**
 * Estimate the token count of a text string.
 *
 * @param {string} text
 * @returns {number}  Integer ≥ 0
 */
function estimateTokens(text) {
  if (!text || text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Compute how many tokens the RAG context body may use, given a full
 * request budget decomposition.
 *
 * Budget equation:
 *   contextTokenBudget = windowTokens
 *                        − systemPromptReserve
 *                        − userPromptOverhead
 *                        − outputReserve
 *                        − safetyMargin
 *
 * @param {object} params
 * @param {number} params.windowTokens          Effective request ceiling (NOT model max)
 * @param {number} params.systemPromptReserve   Reserved for system prompt
 * @param {number} params.userPromptOverhead    Reserved for user prompt scaffolding (ex context body)
 * @param {number} params.outputReserve         Reserved for generated output tokens
 * @param {number} params.safetyMargin          Extra safety buffer
 * @returns {number}  Max tokens available for the RAG context body (≥ 0)
 */
function computeContextTokenBudget({
  windowTokens,
  systemPromptReserve,
  userPromptOverhead,
  outputReserve,
  safetyMargin,
}) {
  const budget = windowTokens
    - systemPromptReserve
    - userPromptOverhead
    - outputReserve
    - safetyMargin;
  return Math.max(0, budget);
}

module.exports = { estimateTokens, computeContextTokenBudget, CHARS_PER_TOKEN };
