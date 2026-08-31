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

// ── Mastery calculation ────────────────────────────────────────────────────────

/**
 * Mastery thresholds (score 0.0 – 1.0):
 *   ≥ 0.80  → mastered
 *   ≥ 0.60  → progressing
 *   < 0.60  → needs_practice
 */
const MASTERY_THRESHOLDS = {
  MASTERED:    0.80,
  PROGRESSING: 0.60,
};

/**
 * Moving-average weight for the current session vs. historical mastery.
 * α = 0.4 gives 40% weight to the new session and 60% to historical score.
 * This keeps mastery deterministic and explainable.
 */
const MASTERY_ALPHA = 0.4;

/**
 * Calculate mastery from a completed practice session.
 *
 * Algorithm (deterministic, explainable):
 *   1. Count scoreable attempts (is_correct is NOT NULL).
 *   2. sessionAccuracy = correctAnswers / scoreableAttempts  (or 0 if none).
 *   3. newMasteryScore = α * sessionAccuracy + (1 - α) * previousMasteryScore.
 *      On first session: newMasteryScore = sessionAccuracy.
 *   4. Update rolling totals and consecutive streaks.
 *
 * Design decisions:
 *   - Questions with is_correct=NULL (free-text) are excluded from accuracy.
 *   - Sessions with zero scoreable attempts do not change mastery_score
 *     but still increment sessions_completed.
 *   - Consecutive streaks reset when the opposite result occurs.
 *
 * @param {object[]} sessionAttempts  — rows from quiz_attempts (may include null is_correct)
 * @param {object|null} previousMastery — existing student_topic_mastery row, or null
 * @param {Date|string} sessionCompletedAt
 * @returns {object}  New mastery values (ready for upsertMastery)
 */
function calculateMastery(sessionAttempts, previousMastery, sessionCompletedAt) {
  // Only scoreable attempts count toward accuracy
  const scoreable = sessionAttempts.filter((a) => a.is_correct !== null);
  const sessionCorrect = scoreable.filter((a) => a.is_correct === true).length;
  const sessionTotal   = scoreable.length;

  const sessionAccuracy = sessionTotal > 0
    ? sessionCorrect / sessionTotal
    : null; // no scoreable questions — mastery_score unchanged

  // Pull previous values (defaults for cold start)
  const prev = previousMastery || {
    mastery_score:         0.0,
    sessions_completed:    0,
    questions_attempted:   0,
    questions_correct:     0,
    consecutive_correct:   0,
    consecutive_incorrect: 0,
  };

  const prevScore = Number(prev.mastery_score);

  // Moving average — only update score if there are scoreable questions
  const newScore = sessionAccuracy !== null
    ? (prev.sessions_completed === 0
        ? sessionAccuracy                                      // cold start: use session directly
        : MASTERY_ALPHA * sessionAccuracy + (1 - MASTERY_ALPHA) * prevScore)
    : prevScore; // no scoreable questions: keep previous score

  // Clamp to [0, 1]
  const clampedScore = Math.min(1.0, Math.max(0.0, newScore));

  // Rolling totals
  const newQuestionsAttempted = Number(prev.questions_attempted) + sessionAttempts.length;
  const newQuestionsCorrect   = Number(prev.questions_correct)   + sessionCorrect;

  // Consecutive streaks: walk through the scoreable attempts in order
  let consecutive_correct   = Number(prev.consecutive_correct);
  let consecutive_incorrect = Number(prev.consecutive_incorrect);

  for (const attempt of scoreable) {
    if (attempt.is_correct === true) {
      consecutive_correct   += 1;
      consecutive_incorrect  = 0;
    } else {
      consecutive_incorrect += 1;
      consecutive_correct    = 0;
    }
  }

  return {
    mastery_score:         clampedScore,
    sessions_completed:    Number(prev.sessions_completed) + 1,
    questions_attempted:   newQuestionsAttempted,
    questions_correct:     newQuestionsCorrect,
    consecutive_correct,
    consecutive_incorrect,
    last_session_at:       sessionCompletedAt,
  };
}

/**
 * Derive the recommended difficulty from current mastery (not persisted).
 *
 * mastery_score ≥ 0.80  → 'hard'   (student is mastered, push harder)
 * mastery_score ≥ 0.60  → 'medium' (progressing, maintain challenge)
 * mastery_score <  0.60  → 'easy'  (needs practice, reduce difficulty)
 *
 * @param {number} masteryScore  0.0 – 1.0
 * @returns {'easy'|'medium'|'hard'}
 */
function deriveDifficulty(masteryScore) {
  const s = Number(masteryScore);
  if (s >= MASTERY_THRESHOLDS.MASTERED)    return 'hard';
  if (s >= MASTERY_THRESHOLDS.PROGRESSING) return 'medium';
  return 'easy';
}

/**
 * Derive a human-readable mastery level label.
 *
 * @param {number} masteryScore  0.0 – 1.0
 * @returns {'mastered'|'progressing'|'needs_practice'}
 */
function deriveMasteryLevel(masteryScore) {
  const s = Number(masteryScore);
  if (s >= MASTERY_THRESHOLDS.MASTERED)    return 'mastered';
  if (s >= MASTERY_THRESHOLDS.PROGRESSING) return 'progressing';
  return 'needs_practice';
}

module.exports = {
  effectiveScore,
  isOverridden,
  autoScore,
  AUTO_SCORE_TYPES,
  calculateMastery,
  deriveDifficulty,
  deriveMasteryLevel,
  MASTERY_THRESHOLDS,
  MASTERY_ALPHA,
};
