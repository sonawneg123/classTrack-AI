/**
 * server/src/utils/scoring.util.js
 *
 * Shared scoring helpers used across different services.
 *
 * Teacher override wins over the AI score everywhere — PDF reports,
 * CSV exports, student views, API responses.
 *
 * Also contains the question-level auto-scoring helper (Sprint 7) used by
 * quiz-assignment submission and student practice attempt scoring.
 */

// ── Task submission scoring (teacher override > AI score) ─────────────────────

function effectiveScore(submission) {
  if (!submission) return null;
  const ts = submission.teacher_score;
  if (ts !== null && ts !== undefined) return Number(ts);
  const as = submission.ai_score;
  if (as !== null && as !== undefined) return Number(as);
  return null;
}

function isOverridden(submission) {
  return !!submission &&
    submission.teacher_score !== null &&
    submission.teacher_score !== undefined;
}

// ── Question-level auto-scoring ────────────────────────────────────────────────

/**
 * Question types that support automatic string-equality scoring.
 * All other types (short_answer, descriptive, scenario, matching) return null.
 */
const AUTO_SCORE_TYPES = ['mcq', 'true_false', 'one_word', 'fill_blank'];

/**
 * Compute whether a student answer is correct and the score awarded.
 *
 * @param {string}        questionType   — e.g. 'mcq', 'true_false', 'descriptive'
 * @param {string}        correctAnswer  — from question_bank.correct_answer
 * @param {string}        studentAnswer  — trimmed before comparison
 * @param {number|string} marks          — full marks for a correct answer (NUMERIC from pg)
 * @returns {{ isCorrect: boolean|null, score: number|null }}
 */
function autoScore(questionType, correctAnswer, studentAnswer, marks) {
  if (!AUTO_SCORE_TYPES.includes(questionType)) {
    return { isCorrect: null, score: null };
  }
  const isCorrect =
    correctAnswer.trim().toLowerCase() === studentAnswer.trim().toLowerCase();
  return {
    isCorrect,
    score: isCorrect ? Number(marks) : 0,
  };
}

module.exports = { effectiveScore, isOverridden, autoScore, AUTO_SCORE_TYPES };
