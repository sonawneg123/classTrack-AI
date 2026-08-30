/**
 * server/tests/unit/repositories/quizAssignment.repository.test.js
 *
 * Regression tests for QuizAssignmentRepository.addQuestionsBatch.
 *
 * Root cause of the production bug (HTTP 500 on batch question add):
 *   The repository called `client.query(...)` and then accessed `inserted.rows[0]`,
 *   treating the result as a raw pg QueryResult.  However, the pool shim in
 *   connection.js wraps ALL client.query calls to return [rows, fields] — the
 *   same tuple format used by pool.query().  Destructuring `const [inserted] =
 *   await client.query(...)` therefore sets `inserted` to the *rows array*,
 *   not a QueryResult object.  Accessing `inserted.rows[0]` on an array is
 *   `undefined[0]` which throws:
 *     TypeError: Cannot read properties of undefined (reading '0')
 *   at QuizAssignmentRepository.addQuestionsBatch (repository, line 209).
 *
 * Fix: use `inserted[0]` instead of `inserted.rows[0]` — `inserted` is already
 *   the rows array after the destructuring assignment.
 *
 * These tests use a mock client that faithfully replicates the shim's
 * [rows, fields] tuple format to ensure the fix holds in production.
 */

jest.mock('../../../src/database/connection', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));

const quizAssignmentRepo = require('../../../src/repositories/quizAssignment.repository');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a mock transaction client whose .query() returns the shim format:
 *   [rows, fields]  — matching what pool.connect() produces in production.
 *
 * NOTE: addQuestionsBatch in the repository ONLY calls client.query for the
 * INSERT statements.  BEGIN / COMMIT / ROLLBACK are called by the service
 * BEFORE and AFTER invoking the repository method, so the mock only needs to
 * account for INSERT calls.
 *
 * @param {object[][]} rowsPerCall  — array of row arrays, one per INSERT call
 */
function makeShimClient(rowsPerCall = []) {
  let callIdx = 0;
  return {
    query: jest.fn().mockImplementation(() => {
      const rows = rowsPerCall[callIdx] ?? [];
      callIdx++;
      // Return [rows, fields] — exactly what connection.js shim returns
      return Promise.resolve([rows, []]);
    }),
    release: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── addQuestionsBatch — core regression ───────────────────────────────────────

describe('QuizAssignmentRepository.addQuestionsBatch', () => {

  it('REGRESSION: succeeds when client returns shim format [rows, fields]', async () => {
    // This is the format the real pool.connect() client returns after connection.js shim.
    // Before the fix, `inserted.rows[0]` crashed because `inserted` was already
    // the rows array (not a QueryResult) after destructuring `const [inserted] = ...`.
    // With the fix, `inserted[0]` correctly accesses the first row.
    const INSERTED_ROW = { id: 99, quiz_assignment_id: 8, question_id: 42, order_index: 1, marks_override: null };

    // The repository only calls client.query for INSERT — BEGIN/COMMIT are called
    // by the service BEFORE/AFTER invoking addQuestionsBatch, not inside it.
    const client = makeShimClient([
      [INSERTED_ROW],  // INSERT — one inserted row (shim format: rows array)
    ]);

    const result = await quizAssignmentRepo.addQuestionsBatch(client, 8, [42], 1);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(INSERTED_ROW);
  });

  it('returns empty array when questionIds is empty', async () => {
    const client = makeShimClient([]);
    const result = await quizAssignmentRepo.addQuestionsBatch(client, 8, [], 1);
    expect(result).toEqual([]);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('handles ON CONFLICT DO NOTHING by not including skipped rows', async () => {
    // When the question is already in the quiz, ON CONFLICT DO NOTHING returns
    // no rows.  The shim returns [[], []] → inserted = [] → inserted[0] = undefined.
    // The `if (inserted[0])` guard prevents pushing undefined.
    const client = makeShimClient([
      [],  // INSERT question 42 — conflict, 0 rows returned (shim: empty array)
    ]);

    const result = await quizAssignmentRepo.addQuestionsBatch(client, 8, [42], 1);

    expect(result).toEqual([]); // nothing was inserted (conflict skipped)
  });

  it('inserts multiple questions with sequential order_index', async () => {
    const ROW_A = { id: 10, quiz_assignment_id: 8, question_id: 100, order_index: 3, marks_override: null };
    const ROW_B = { id: 11, quiz_assignment_id: 8, question_id: 101, order_index: 4, marks_override: null };
    const client = makeShimClient([
      [ROW_A],  // INSERT question 100 at order_index 3
      [ROW_B],  // INSERT question 101 at order_index 4
    ]);

    const result = await quizAssignmentRepo.addQuestionsBatch(client, 8, [100, 101], 3);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(ROW_A);
    expect(result[1]).toEqual(ROW_B);

    // Verify the INSERT calls used the correct order_index values
    const insertCalls = client.query.mock.calls.filter(
      ([sql]) => sql && sql.includes('INSERT INTO quiz_assignment_questions')
    );
    expect(insertCalls).toHaveLength(2);
    // First INSERT: startIndex + 0 = 3
    expect(insertCalls[0][1]).toEqual([8, 100, 3]);
    // Second INSERT: startIndex + 1 = 4
    expect(insertCalls[1][1]).toEqual([8, 101, 4]);
  });

  it('uses quizId and questionId as first two SQL params', async () => {
    const ROW = { id: 5, quiz_assignment_id: 8, question_id: 42, order_index: 1, marks_override: null };
    const client = makeShimClient([[ROW]]);

    await quizAssignmentRepo.addQuestionsBatch(client, 8, [42], 1);

    const insertCall = client.query.mock.calls.find(
      ([sql]) => sql && sql.includes('INSERT INTO quiz_assignment_questions')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall[1][0]).toBe(8);  // quizId = $1
    expect(insertCall[1][1]).toBe(42); // questionId = $2
    expect(insertCall[1][2]).toBe(1);  // order_index = $3 (startIndex + 0)
  });
});
