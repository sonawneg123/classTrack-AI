/**
 * server/tests/unit/utils/scoring.mastery.test.js
 *
 * Unit tests for the mastery calculation functions in scoring.util.js
 * (Sprint 3 Phase 1).
 *
 * Tests:
 *   - calculateMastery: cold start, correct, incorrect, mixed
 *   - calculateMastery: repeated sessions, consecutive streaks
 *   - calculateMastery: empty session, free-text only (null is_correct)
 *   - calculateMastery: moving average behavior
 *   - deriveDifficulty: all three thresholds
 *   - deriveMasteryLevel: all three levels
 */

const {
  calculateMastery,
  deriveDifficulty,
  deriveMasteryLevel,
  MASTERY_THRESHOLDS,
  MASTERY_ALPHA,
} = require('../../../src/utils/scoring.util');

const NOW = new Date('2025-01-15T10:00:00.000Z');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAttempts(pattern) {
  // pattern: array of true/false/null
  return pattern.map((v, i) => ({ is_correct: v, question_id: i + 1 }));
}

// ── calculateMastery — cold start ─────────────────────────────────────────────

describe('calculateMastery — cold start (no previous mastery)', () => {
  it('cold start with all correct → mastery_score = 1.0', () => {
    const attempts = makeAttempts([true, true, true, true, true]);
    const result = calculateMastery(attempts, null, NOW);
    expect(result.mastery_score).toBe(1.0);
    expect(result.sessions_completed).toBe(1);
    expect(result.questions_attempted).toBe(5);
    expect(result.questions_correct).toBe(5);
  });

  it('cold start with all incorrect → mastery_score = 0.0', () => {
    const attempts = makeAttempts([false, false, false]);
    const result = calculateMastery(attempts, null, NOW);
    expect(result.mastery_score).toBe(0.0);
    expect(result.sessions_completed).toBe(1);
    expect(result.questions_correct).toBe(0);
  });

  it('cold start with mixed (3/5 correct) → mastery_score = 0.6', () => {
    const attempts = makeAttempts([true, true, true, false, false]);
    const result = calculateMastery(attempts, null, NOW);
    expect(result.mastery_score).toBeCloseTo(0.6, 5);
    expect(result.sessions_completed).toBe(1);
  });

  it('cold start with empty session → mastery_score = 0.0, sessions_completed = 1', () => {
    const result = calculateMastery([], null, NOW);
    expect(result.mastery_score).toBe(0.0);
    expect(result.sessions_completed).toBe(1);
    expect(result.questions_attempted).toBe(0);
  });

  it('cold start with only free-text (null) → mastery_score = 0.0, sessions_completed = 1', () => {
    const attempts = makeAttempts([null, null, null]);
    const result = calculateMastery(attempts, null, NOW);
    expect(result.mastery_score).toBe(0.0);
    expect(result.sessions_completed).toBe(1);
    expect(result.questions_attempted).toBe(3);
    expect(result.questions_correct).toBe(0);
  });
});

// ── calculateMastery — moving average ─────────────────────────────────────────

describe('calculateMastery — moving average (repeated sessions)', () => {
  it('applies EMA with α=0.4 on second session', () => {
    // Previous: mastery_score=1.0, sessions_completed=1
    const prev = {
      mastery_score:       1.0,
      sessions_completed:  1,
      questions_attempted: 5,
      questions_correct:   5,
      consecutive_correct: 5,
      consecutive_incorrect: 0,
    };
    // New session: 0/5 correct (all wrong)
    const attempts = makeAttempts([false, false, false, false, false]);
    const result = calculateMastery(attempts, prev, NOW);

    // α * 0.0 + (1-α) * 1.0 = 0.4 * 0 + 0.6 * 1.0 = 0.6
    expect(result.mastery_score).toBeCloseTo(0.6, 5);
    expect(result.sessions_completed).toBe(2);
  });

  it('multiple sessions converge toward actual performance', () => {
    // Simulate 3 sessions, all 100% correct
    let mastery = null;
    for (let i = 0; i < 3; i++) {
      mastery = calculateMastery(makeAttempts([true, true, true, true, true]), mastery, NOW);
    }
    // After cold start (100%) + 2 more perfect sessions, stays at 1.0
    expect(mastery.mastery_score).toBeCloseTo(1.0, 5);
  });

  it('session with no scoreable questions does not change mastery_score', () => {
    const prev = {
      mastery_score:       0.8,
      sessions_completed:  3,
      questions_attempted: 15,
      questions_correct:   12,
      consecutive_correct: 4,
      consecutive_incorrect: 0,
    };
    const attempts = makeAttempts([null, null]); // free-text only
    const result = calculateMastery(attempts, prev, NOW);
    // Mastery score unchanged
    expect(result.mastery_score).toBeCloseTo(0.8, 5);
    expect(result.sessions_completed).toBe(4);
    expect(result.questions_attempted).toBe(17);
  });
});

// ── calculateMastery — consecutive streaks ────────────────────────────────────

describe('calculateMastery — consecutive streaks', () => {
  it('consecutive_correct increments through session', () => {
    const attempts = makeAttempts([true, true, true]);
    const result = calculateMastery(attempts, null, NOW);
    expect(result.consecutive_correct).toBe(3);
    expect(result.consecutive_incorrect).toBe(0);
  });

  it('consecutive_incorrect increments on wrong answers', () => {
    const attempts = makeAttempts([false, false]);
    const result = calculateMastery(attempts, null, NOW);
    expect(result.consecutive_incorrect).toBe(2);
    expect(result.consecutive_correct).toBe(0);
  });

  it('correct streak resets consecutive_incorrect to 0', () => {
    const prev = { mastery_score: 0.5, sessions_completed: 1,
                   questions_attempted: 3, questions_correct: 0,
                   consecutive_correct: 0, consecutive_incorrect: 3 };
    const attempts = makeAttempts([true, true]);
    const result = calculateMastery(attempts, prev, NOW);
    expect(result.consecutive_correct).toBe(2);
    expect(result.consecutive_incorrect).toBe(0);
  });

  it('incorrect answer resets consecutive_correct to 0', () => {
    const prev = { mastery_score: 1.0, sessions_completed: 2,
                   questions_attempted: 10, questions_correct: 10,
                   consecutive_correct: 10, consecutive_incorrect: 0 };
    const attempts = makeAttempts([false]);
    const result = calculateMastery(attempts, prev, NOW);
    expect(result.consecutive_correct).toBe(0);
    expect(result.consecutive_incorrect).toBe(1);
  });

  it('mixed attempts update streaks correctly', () => {
    // [T, T, F, T] — ends on T
    const attempts = makeAttempts([true, true, false, true]);
    const result = calculateMastery(attempts, null, NOW);
    expect(result.consecutive_correct).toBe(1);
    expect(result.consecutive_incorrect).toBe(0);
  });
});

// ── calculateMastery — mastery_score clamped ──────────────────────────────────

describe('calculateMastery — score clamping', () => {
  it('never exceeds 1.0 even with perfect sessions', () => {
    let mastery = null;
    for (let i = 0; i < 10; i++) {
      mastery = calculateMastery(makeAttempts([true, true, true]), mastery, NOW);
    }
    expect(mastery.mastery_score).toBeLessThanOrEqual(1.0);
  });

  it('never goes below 0.0 even with all-wrong sessions', () => {
    let mastery = null;
    for (let i = 0; i < 10; i++) {
      mastery = calculateMastery(makeAttempts([false, false, false]), mastery, NOW);
    }
    expect(mastery.mastery_score).toBeGreaterThanOrEqual(0.0);
  });
});

// ── calculateMastery — last_session_at ───────────────────────────────────────

describe('calculateMastery — last_session_at', () => {
  it('sets last_session_at to the sessionCompletedAt value', () => {
    const result = calculateMastery([], null, NOW);
    expect(result.last_session_at).toBe(NOW);
  });
});

// ── deriveDifficulty ──────────────────────────────────────────────────────────

describe('deriveDifficulty', () => {
  it('returns "hard" when mastery_score >= 0.80', () => {
    expect(deriveDifficulty(0.80)).toBe('hard');
    expect(deriveDifficulty(0.95)).toBe('hard');
    expect(deriveDifficulty(1.0)).toBe('hard');
  });

  it('returns "medium" when mastery_score >= 0.60 and < 0.80', () => {
    expect(deriveDifficulty(0.60)).toBe('medium');
    expect(deriveDifficulty(0.70)).toBe('medium');
    expect(deriveDifficulty(0.79)).toBe('medium');
  });

  it('returns "easy" when mastery_score < 0.60', () => {
    expect(deriveDifficulty(0.0)).toBe('easy');
    expect(deriveDifficulty(0.30)).toBe('easy');
    expect(deriveDifficulty(0.59)).toBe('easy');
  });
});

// ── deriveMasteryLevel ────────────────────────────────────────────────────────

describe('deriveMasteryLevel', () => {
  it('returns "mastered" at >= 0.80', () => {
    expect(deriveMasteryLevel(0.80)).toBe('mastered');
    expect(deriveMasteryLevel(1.0)).toBe('mastered');
  });

  it('returns "progressing" at >= 0.60 and < 0.80', () => {
    expect(deriveMasteryLevel(0.60)).toBe('progressing');
    expect(deriveMasteryLevel(0.75)).toBe('progressing');
  });

  it('returns "needs_practice" at < 0.60', () => {
    expect(deriveMasteryLevel(0.0)).toBe('needs_practice');
    expect(deriveMasteryLevel(0.59)).toBe('needs_practice');
  });
});

// ── MASTERY_THRESHOLDS and MASTERY_ALPHA constants ───────────────────────────

describe('Mastery constants', () => {
  it('MASTERY_THRESHOLDS defines MASTERED=0.80 and PROGRESSING=0.60', () => {
    expect(MASTERY_THRESHOLDS.MASTERED).toBe(0.80);
    expect(MASTERY_THRESHOLDS.PROGRESSING).toBe(0.60);
  });

  it('MASTERY_ALPHA is 0.4', () => {
    expect(MASTERY_ALPHA).toBe(0.4);
  });
});
