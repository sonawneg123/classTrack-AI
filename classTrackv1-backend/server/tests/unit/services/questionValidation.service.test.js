/**
 * server/tests/unit/services/questionValidation.service.test.js
 *
 * Tests for QuestionValidationService.
 * No database connection needed — pure logic tests.
 */
const {
  validateQuestion,
  validateBatch,
  SUPPORTED_TYPES,
  SUPPORTED_DIFFICULTIES,
} = require('../../../src/services/questions/questionValidation.service');

// ── Supported constants ───────────────────────────────────────────────────────
describe('SUPPORTED_TYPES and SUPPORTED_DIFFICULTIES', () => {
  it('includes all 8 question types', () => {
    expect(SUPPORTED_TYPES).toHaveLength(8);
    expect(SUPPORTED_TYPES).toContain('mcq');
    expect(SUPPORTED_TYPES).toContain('true_false');
    expect(SUPPORTED_TYPES).toContain('matching');
  });

  it('includes exactly 3 difficulties', () => {
    expect(SUPPORTED_DIFFICULTIES).toEqual(['easy', 'medium', 'hard']);
  });
});

// ── MCQ validation ────────────────────────────────────────────────────────────
describe('validateQuestion — MCQ', () => {
  const validMcq = {
    type: 'mcq',
    question: 'What is 2 + 2?',
    options: ['2', '3', '4', '5'],
    correct_answer: '4',
    explanation: 'Basic addition.',
    difficulty: 'easy',
  };

  it('passes a valid MCQ', () => {
    const result = validateQuestion(validMcq);
    expect(result.valid).toBe(true);
    expect(result.data.questionType).toBe('mcq');
    expect(result.data.correctAnswer).toBe('4');
    expect(result.data.options).toEqual(['2', '3', '4', '5']);
  });

  it('fails when options is not an array', () => {
    const result = validateQuestion({ ...validMcq, options: 'A,B,C,D' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('options array'))).toBe(true);
  });

  it('fails when correct_answer does not match any option', () => {
    const result = validateQuestion({ ...validMcq, correct_answer: '99' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not match'))).toBe(true);
  });

  it('fails when options has only 1 item', () => {
    const result = validateQuestion({ ...validMcq, options: ['only one'] });
    expect(result.valid).toBe(false);
  });

  it('resolves letter-based answer (A → first option)', () => {
    const result = validateQuestion({ ...validMcq, correct_answer: 'A' });
    expect(result.valid).toBe(true);
    expect(result.data.correctAnswer).toBe('2');
  });

  it('fails when question_text is empty', () => {
    const result = validateQuestion({ ...validMcq, question: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('question_text is required'))).toBe(true);
  });
});

// ── True/False validation ─────────────────────────────────────────────────────
describe('validateQuestion — true_false', () => {
  const validTF = {
    type: 'true_false',
    question: 'The sky is blue.',
    correct_answer: 'true',
    difficulty: 'easy',
  };

  it('passes a valid true/false question', () => {
    const result = validateQuestion(validTF);
    expect(result.valid).toBe(true);
    expect(result.data.correctAnswer).toBe('true');
    expect(result.data.options).toEqual(['true', 'false']);
  });

  it('fails with an invalid answer', () => {
    const result = validateQuestion({ ...validTF, correct_answer: 'yes' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('true_false'))).toBe(true);
  });

  it('accepts "True" (case-insensitive) and normalises to lowercase', () => {
    const result = validateQuestion({ ...validTF, correct_answer: 'True' });
    expect(result.valid).toBe(true);
    expect(result.data.correctAnswer).toBe('true');
  });
});

// ── Matching validation ───────────────────────────────────────────────────────
describe('validateQuestion — matching', () => {
  const validMatching = {
    type: 'matching',
    question: 'Match the terms.',
    options: [
      { left: 'Photosynthesis', right: 'Plants making food' },
      { left: 'Respiration',    right: 'Energy release' },
    ],
    correct_answer: '1-A, 2-B',
    difficulty: 'medium',
  };

  it('passes a valid matching question', () => {
    const result = validateQuestion(validMatching);
    expect(result.valid).toBe(true);
    expect(result.data.options).toHaveLength(2);
    expect(result.data.options[0]).toHaveProperty('left');
    expect(result.data.options[0]).toHaveProperty('right');
  });

  it('fails when pairs are missing required keys', () => {
    const badOptions = [{ term: 'A', definition: 'B' }, { term: 'C', definition: 'D' }];
    const result = validateQuestion({ ...validMatching, options: badOptions });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"left" and "right"'))).toBe(true);
  });

  it('fails when fewer than 2 pairs provided', () => {
    const result = validateQuestion({
      ...validMatching,
      options: [{ left: 'A', right: 'B' }],
    });
    expect(result.valid).toBe(false);
  });
});

// ── Fill blank / one word ─────────────────────────────────────────────────────
describe('validateQuestion — fill_blank', () => {
  it('passes a valid fill-blank question', () => {
    const result = validateQuestion({
      type: 'fill_blank',
      question: 'The capital of France is ___.',
      correct_answer: 'Paris',
      difficulty: 'easy',
    });
    expect(result.valid).toBe(true);
  });
});

// ── Difficulty validation ─────────────────────────────────────────────────────
describe('validateQuestion — difficulty', () => {
  it('fails with invalid difficulty', () => {
    const result = validateQuestion({
      type: 'short_answer',
      question: 'Explain photosynthesis.',
      correct_answer: 'Plants make food from sunlight.',
      difficulty: 'extreme',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('difficulty'))).toBe(true);
  });

  it('defaults to medium when difficulty is from context', () => {
    const result = validateQuestion(
      { type: 'short_answer', question: 'Explain photosynthesis.', correct_answer: 'Food from sunlight.' },
      { difficulty: 'medium' }
    );
    expect(result.valid).toBe(true);
    expect(result.data.difficulty).toBe('medium');
  });
});

// ── Unsupported type ──────────────────────────────────────────────────────────
describe('validateQuestion — unsupported type', () => {
  it('fails with an unsupported question type', () => {
    const result = validateQuestion({
      type: 'drag_and_drop',
      question: 'This type is not supported.',
      correct_answer: 'N/A',
      difficulty: 'easy',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not supported'))).toBe(true);
  });
});

// ── Question text length ──────────────────────────────────────────────────────
describe('validateQuestion — text length', () => {
  it('fails when question_text exceeds max length', () => {
    const result = validateQuestion({
      type: 'descriptive',
      question: 'A'.repeat(2001),
      correct_answer: 'Some answer',
      difficulty: 'hard',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('exceeds'))).toBe(true);
  });
});

// ── validateBatch ─────────────────────────────────────────────────────────────
describe('validateBatch', () => {
  it('separates valid from invalid questions', () => {
    const raws = [
      {
        type: 'mcq',
        question: 'What color is the sky?',
        options: ['Red', 'Blue', 'Green', 'Yellow'],
        correct_answer: 'Blue',
        difficulty: 'easy',
      },
      {
        type: 'mcq',
        question: 'Invalid MCQ',
        options: [],           // invalid
        correct_answer: 'Something',
        difficulty: 'easy',
      },
    ];
    const { valid, invalid } = validateBatch(raws, { questionType: 'mcq' });
    expect(valid).toHaveLength(1);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].errors.length).toBeGreaterThan(0);
  });

  it('returns empty valid array when input is not an array', () => {
    const { valid, invalid } = validateBatch('not-an-array');
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
  });
});

// ── Type alias normalisation ──────────────────────────────────────────────────
describe('validateQuestion — type aliases', () => {
  it('normalises "multiple_choice" to "mcq"', () => {
    const result = validateQuestion({
      type: 'multiple_choice',
      question: 'Alias test?',
      options: ['A', 'B', 'A', 'D'],
      correct_answer: 'A',
      difficulty: 'easy',
    });
    expect(result.valid).toBe(true);
    expect(result.data.questionType).toBe('mcq');
  });
});
