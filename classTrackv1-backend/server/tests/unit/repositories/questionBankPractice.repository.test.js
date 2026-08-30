/**
 * server/tests/unit/repositories/questionBankPractice.repository.test.js
 *
 * Unit tests for the Sprint 6 practice methods on QuestionBankRepository:
 *   - listPracticeByStudent
 *   - findPracticeByIdForStudent
 */

const BaseRepository = require('../../../src/repositories/base.repository');

// ── Pool mock ─────────────────────────────────────────────────────────────────
const mockPool = { query: jest.fn() };

jest.mock('../../../src/database/connection', () => ({
  pool: { query: jest.fn() },
}));

// ── Import the actual repository after mocking the DB ─────────────────────────
const questionBankRepo = require('../../../src/repositories/questionBank.repository');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STUDENT_ID  = 5;
const QUESTION_ID = 77;

const MOCK_PRACTICE_ROW = {
  id:              QUESTION_ID,
  question_type:   'mcq',
  question_text:   'What is photosynthesis?',
  correct_answer:  'A process',
  explanation:     'It converts sunlight.',
  marks:           '1.00',
  status:          'practice',
  difficulty:      'easy',
  created_by:      STUDENT_ID,
  created_by_role: 'student',
  topic_id:        10,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockQuery(rows) {
  const { pool } = require('../../../src/database/connection');
  pool.query.mockResolvedValueOnce([rows]);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── listPracticeByStudent ─────────────────────────────────────────────────────

describe('questionBankRepository.listPracticeByStudent', () => {
  it('queries with student_id, created_by_role, and status=practice filters', async () => {
    mockQuery([MOCK_PRACTICE_ROW]);
    const result = await questionBankRepo.listPracticeByStudent(STUDENT_ID);
    const { pool } = require('../../../src/database/connection');
    const [sqlCall] = pool.query.mock.calls[0];
    expect(sqlCall).toContain(`q.created_by = $1`);
    expect(sqlCall).toContain(`'student'`);
    expect(sqlCall).toContain(`'practice'`);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('practice');
  });

  it('adds topic filter when topicId is provided', async () => {
    mockQuery([]);
    await questionBankRepo.listPracticeByStudent(STUDENT_ID, { topicId: 10 });
    const { pool } = require('../../../src/database/connection');
    const [sqlCall] = pool.query.mock.calls[0];
    expect(sqlCall).toContain('q.topic_id');
    expect(pool.query.mock.calls[0][1]).toContain(10);
  });

  it('returns empty array when no practice questions exist', async () => {
    mockQuery([]);
    const result = await questionBankRepo.listPracticeByStudent(STUDENT_ID);
    expect(result).toEqual([]);
  });
});

// ── findPracticeByIdForStudent ────────────────────────────────────────────────

describe('questionBankRepository.findPracticeByIdForStudent', () => {
  it('returns the row when found for this student', async () => {
    mockQuery([MOCK_PRACTICE_ROW]);
    const result = await questionBankRepo.findPracticeByIdForStudent(QUESTION_ID, STUDENT_ID);
    const { pool } = require('../../../src/database/connection');
    const [sqlCall, params] = pool.query.mock.calls[0];
    expect(params).toContain(QUESTION_ID);
    expect(params).toContain(STUDENT_ID);
    expect(sqlCall).toContain(`'practice'`);
    expect(result).toEqual(MOCK_PRACTICE_ROW);
  });

  it('returns null when question not found or not owned by this student', async () => {
    mockQuery([]);
    const result = await questionBankRepo.findPracticeByIdForStudent(QUESTION_ID, STUDENT_ID);
    expect(result).toBeNull();
  });
});
