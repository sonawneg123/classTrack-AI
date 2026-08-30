/**
 * server/tests/unit/repositories/quizAttemptTeacher.repository.test.js
 *
 * Unit tests for the teacher-facing quiz attempt repository methods added
 * in Sprint 5: listByTopicForTeacher and listByQuestionForTeacher.
 *
 * The database pool is mocked — no real DB required.
 */

const mockQuery = jest.fn();

jest.mock('../../../src/database/connection', () => ({
  pool: { query: mockQuery },
  testConnection: jest.fn(),
}));

const repo = require('../../../src/repositories/quizAttempt.repository');

const TEACHER_ID  = 1;
const TOPIC_ID    = 5;
const QUESTION_ID = 42;

const ATTEMPT_ROW = {
  id:                1,
  student_id:        10,
  question_id:       QUESTION_ID,
  student_answer:    'Glucose',
  is_correct:        true,
  score:             '1.00',
  attempt_count:     1,
  first_attempted_at: '2025-01-01T10:00:00.000Z',
  last_attempted_at:  '2025-01-01T10:00:00.000Z',
  question_text:     'What do plants produce via photosynthesis?',
  question_type:     'mcq',
  difficulty:        'easy',
  marks:             '1.00',
  correct_answer:    'Glucose',
  topic_id:          TOPIC_ID,
  student_name:      'Alice Smith',
  student_username:  'alice_smith',
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ── listByTopicForTeacher ────────────────────────────────────────────────────

describe('quizAttemptRepository.listByTopicForTeacher', () => {
  it('returns rows with expected shape', async () => {
    mockQuery.mockResolvedValue([[ATTEMPT_ROW]]);

    const result = await repo.listByTopicForTeacher(TOPIC_ID, TEACHER_ID);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      student_name:     'Alice Smith',
      student_username: 'alice_smith',
      question_text:    expect.any(String),
      is_correct:       true,
    });
  });

  it('queries with topic_id and teacher_id parameters', async () => {
    mockQuery.mockResolvedValue([[]]);

    await repo.listByTopicForTeacher(TOPIC_ID, TEACHER_ID);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/q\.topic_id = \$1/);
    expect(sql).toMatch(/cu\.teacher_id = \$2/);
    expect(params).toEqual([TOPIC_ID, TEACHER_ID]);
  });

  it('scopes to teacher — curriculum join prevents cross-teacher access', async () => {
    mockQuery.mockResolvedValue([[ATTEMPT_ROW]]);

    await repo.listByTopicForTeacher(TOPIC_ID, TEACHER_ID);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/JOIN curricula\s+cu ON cu\.id = q\.curriculum_id/i);
    expect(sql).toMatch(/cu\.teacher_id = \$2/);
    expect(sql).toMatch(/cu\.deleted_at IS NULL/);
  });

  it('returns empty array when no attempts exist', async () => {
    mockQuery.mockResolvedValue([[]]);

    const result = await repo.listByTopicForTeacher(TOPIC_ID, TEACHER_ID);
    expect(result).toEqual([]);
  });
});

// ── listByQuestionForTeacher ─────────────────────────────────────────────────

describe('quizAttemptRepository.listByQuestionForTeacher', () => {
  it('returns rows with expected shape', async () => {
    mockQuery.mockResolvedValue([[ATTEMPT_ROW]]);

    const result = await repo.listByQuestionForTeacher(QUESTION_ID, TEACHER_ID);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      student_name:     'Alice Smith',
      question_text:    expect.any(String),
      is_correct:       true,
    });
  });

  it('queries with question_id and teacher_id parameters', async () => {
    mockQuery.mockResolvedValue([[]]);

    await repo.listByQuestionForTeacher(QUESTION_ID, TEACHER_ID);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/a\.question_id = \$1/);
    expect(sql).toMatch(/cu\.teacher_id = \$2/);
    expect(params).toEqual([QUESTION_ID, TEACHER_ID]);
  });

  it('scopes to teacher — curriculum join prevents cross-teacher access', async () => {
    mockQuery.mockResolvedValue([[]]);

    await repo.listByQuestionForTeacher(QUESTION_ID, TEACHER_ID);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/JOIN curricula\s+cu ON cu\.id = q\.curriculum_id/i);
    expect(sql).toMatch(/cu\.teacher_id = \$2/);
    expect(sql).toMatch(/cu\.deleted_at IS NULL/);
  });

  it('returns empty array when no attempts exist', async () => {
    mockQuery.mockResolvedValue([[]]);

    const result = await repo.listByQuestionForTeacher(QUESTION_ID, TEACHER_ID);
    expect(result).toEqual([]);
  });
});
