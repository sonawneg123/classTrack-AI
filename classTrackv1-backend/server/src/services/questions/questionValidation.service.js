/**
 * server/src/services/questions/questionValidation.service.js
 *
 * Validates raw LLM-generated question objects before database insertion.
 *
 * Rationale:
 *   The LLM is an untrusted external source. Every field is validated
 *   independently so a malformed response is rejected cleanly.
 *
 * Supported question types:
 *   mcq, true_false, fill_blank, one_word, short_answer,
 *   matching, scenario, descriptive
 */

const SUPPORTED_TYPES = [
  'mcq', 'true_false', 'fill_blank', 'one_word',
  'short_answer', 'matching', 'scenario', 'descriptive',
];
const SUPPORTED_DIFFICULTIES = ['easy', 'medium', 'hard'];
const MCQ_OPTION_COUNT_MIN = 2;
const MCQ_OPTION_COUNT_MAX = 6;
const MAX_QUESTION_TEXT_LENGTH = 2000;
const MAX_ANSWER_LENGTH = 1000;
const TRUE_FALSE_VALID = new Set(['true', 'false', 'True', 'False', 'TRUE', 'FALSE']);
const MATCHING_MIN_PAIRS = 2;

/**
 * Validate a single question object from the LLM response.
 *
 * @param {object}  raw   Raw question object (untrusted)
 * @param {object}  ctx   Context: { questionType, difficulty }
 * @returns {{ valid: boolean, errors: string[], data: object|null }}
 */
function validateQuestion(raw, ctx = {}) {
  const errors = [];

  // ── question_text ─────────────────────────────────────────────────────────
  const questionText = (raw.question || raw.question_text || '').toString().trim();
  if (!questionText) {
    errors.push('question_text is required');
  } else if (questionText.length > MAX_QUESTION_TEXT_LENGTH) {
    errors.push(`question_text exceeds ${MAX_QUESTION_TEXT_LENGTH} characters`);
  }

  // ── question_type ─────────────────────────────────────────────────────────
  // Prefer the LLM-returned type, fall back to the requested type from ctx.
  const rawType = (raw.type || raw.question_type || ctx.questionType || '').toLowerCase().trim();
  // Normalise common aliases
  const typeAliases = { 'multiple_choice': 'mcq', 'multiple-choice': 'mcq', 'true/false': 'true_false' };
  const questionType = typeAliases[rawType] || rawType;

  if (!questionType || !SUPPORTED_TYPES.includes(questionType)) {
    errors.push(`question_type "${questionType}" is not supported. Must be one of: ${SUPPORTED_TYPES.join(', ')}`);
  }

  // ── difficulty ────────────────────────────────────────────────────────────
  const rawDiff = (raw.difficulty || ctx.difficulty || 'medium').toLowerCase().trim();
  if (!SUPPORTED_DIFFICULTIES.includes(rawDiff)) {
    errors.push(`difficulty "${rawDiff}" is invalid. Must be one of: ${SUPPORTED_DIFFICULTIES.join(', ')}`);
  }

  // ── correct_answer ────────────────────────────────────────────────────────
  const correctAnswer = (raw.correct_answer || raw.answer || '').toString().trim();
  if (!correctAnswer) {
    errors.push('correct_answer is required');
  } else if (correctAnswer.length > MAX_ANSWER_LENGTH) {
    errors.push(`correct_answer exceeds ${MAX_ANSWER_LENGTH} characters`);
  }

  // ── Type-specific validation ──────────────────────────────────────────────
  if (errors.length === 0) {
    switch (questionType) {
      case 'mcq': {
        const options = raw.options;
        if (!Array.isArray(options)) {
          errors.push('mcq requires options array');
        } else if (options.length < MCQ_OPTION_COUNT_MIN || options.length > MCQ_OPTION_COUNT_MAX) {
          errors.push(`mcq requires ${MCQ_OPTION_COUNT_MIN}–${MCQ_OPTION_COUNT_MAX} options, got ${options.length}`);
        } else {
          const normalizedOptions = options.map((o) => String(o).trim());
          const normalizedAnswer  = correctAnswer.trim();
          if (!normalizedOptions.includes(normalizedAnswer)) {
            // Try letter-based matching (A, B, C, D → option index)
            const letterMatch = /^[A-Da-d]$/.test(normalizedAnswer);
            if (letterMatch) {
              const idx = normalizedAnswer.toUpperCase().charCodeAt(0) - 65;
              if (idx >= normalizedOptions.length) {
                errors.push(`mcq correct_answer letter "${normalizedAnswer}" is out of range`);
              }
              // Replace letter with actual option text
              // (handled below when building the data object)
            } else {
              errors.push(`mcq correct_answer "${normalizedAnswer}" does not match any option`);
            }
          }
        }
        break;
      }
      case 'true_false': {
        if (!TRUE_FALSE_VALID.has(correctAnswer)) {
          errors.push(`true_false correct_answer must be "true" or "false", got "${correctAnswer}"`);
        }
        break;
      }
      case 'matching': {
        const pairs = raw.options || raw.pairs;
        if (!Array.isArray(pairs) || pairs.length < MATCHING_MIN_PAIRS) {
          errors.push(`matching requires at least ${MATCHING_MIN_PAIRS} pairs in options/pairs array`);
        } else {
          for (const [i, pair] of pairs.entries()) {
            if (!pair || typeof pair !== 'object' || !pair.left || !pair.right) {
              errors.push(`matching pair at index ${i} must have "left" and "right" keys`);
            }
          }
        }
        break;
      }
      case 'fill_blank':
      case 'one_word':
        // correct_answer already validated above — no extra constraints
        break;
      case 'short_answer':
      case 'scenario':
      case 'descriptive':
        // Free-form answers — only length is checked
        break;
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, data: null };
  }

  // ── Build normalised data object ─────────────────────────────────────────
  let resolvedOptions = null;
  let resolvedAnswer = correctAnswer;

  if (questionType === 'mcq') {
    resolvedOptions = raw.options.map((o) => String(o).trim());
    // If answer was a letter, resolve to actual text
    if (/^[A-Da-d]$/.test(correctAnswer)) {
      const idx = correctAnswer.toUpperCase().charCodeAt(0) - 65;
      resolvedAnswer = resolvedOptions[idx];
    }
  } else if (questionType === 'true_false') {
    resolvedAnswer = correctAnswer.toLowerCase();
    resolvedOptions = ['true', 'false'];
  } else if (questionType === 'matching') {
    const pairs = raw.options || raw.pairs;
    resolvedOptions = pairs.map((p) => ({
      left: String(p.left).trim(),
      right: String(p.right).trim(),
    }));
  }

  return {
    valid: true,
    errors: [],
    data: {
      questionType,
      questionText,
      options: resolvedOptions,
      correctAnswer: resolvedAnswer,
      explanation: (raw.explanation || '').toString().trim() || null,
      difficulty: rawDiff,
    },
  };
}

/**
 * Validate an array of questions from LLM output.
 *
 * @param {object[]} rawQuestions
 * @param {object}   ctx           { questionType, difficulty }
 * @returns {{ valid: object[], invalid: { raw: object, errors: string[] }[] }}
 */
function validateBatch(rawQuestions, ctx = {}) {
  if (!Array.isArray(rawQuestions)) {
    return { valid: [], invalid: [{ raw: rawQuestions, errors: ['questions must be an array'] }] };
  }

  const valid = [];
  const invalid = [];

  for (const raw of rawQuestions) {
    const result = validateQuestion(raw, ctx);
    if (result.valid) {
      valid.push(result.data);
    } else {
      invalid.push({ raw, errors: result.errors });
    }
  }

  return { valid, invalid };
}

module.exports = { validateQuestion, validateBatch, SUPPORTED_TYPES, SUPPORTED_DIFFICULTIES };
