/**
 * server/tests/unit/repositories/task.repository.test.js
 *
 * Boundary: the repository's own SQL — pool.query mocked directly, no
 * Express/service layer involved. Verifies WHERE-clause construction
 * (deleted_at exclusion, status/search/classroom filters) and exact
 * params passed to the pg driver ($1/$2/… placeholders).
 */

jest.mock('../../../src/database/connection', () => ({
  pool: { query: jest.fn() },
}));

const { pool } = require('../../../src/database/connection');
const taskRepo = require('../../../src/repositories/task.repository');

beforeEach(() => jest.clearAllMocks());

describe('task.repository — existsDuplicateTitle', () => {
  it('is case-insensitive and excludes soft-deleted tasks', async () => {
    pool.query.mockResolvedValue([[{ id: 1 }]]);
    const result = await taskRepo.existsDuplicateTitle({ classroomId: 3, title: 'Problem Set 7' });
    expect(result).toBe(true);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/deleted_at IS NULL/);
    // PostgreSQL uses $2 placeholders, not ?
    expect(sql).toMatch(/LOWER\(title\) = LOWER\(\$2\)/);
    expect(params).toEqual([3, 'Problem Set 7']);
  });

  it('excludes the current task id when editing', async () => {
    pool.query.mockResolvedValue([[]]);
    await taskRepo.existsDuplicateTitle({ classroomId: 3, title: 'Problem Set 7', excludeId: 1 });
    const [sql, params] = pool.query.mock.calls[0];
    // PostgreSQL uses $3 for the third parameter
    expect(sql).toMatch(/AND id != \$3/);
    expect(params).toEqual([3, 'Problem Set 7', 1]);
  });
});

describe('task.repository — belongsToTeacher', () => {
  it('excludes soft-deleted tasks from ownership lookup', async () => {
    pool.query.mockResolvedValue([[]]);
    await taskRepo.belongsToTeacher(1, 7);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/t\.deleted_at IS NULL/);
    expect(params).toEqual([1, 7]);
  });
});

describe('task.repository — listByTeacherManaged', () => {
  it('always filters by teacher and excludes deleted tasks', async () => {
    pool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]]);
    await taskRepo.listByTeacherManaged({
      teacherId: 7, limit: 20, offset: 0, status: 'all', sortBy: 'createdAt', sortDir: 'desc',
    });
    const [sql, params] = pool.query.mock.calls[0];
    // PostgreSQL uses $1 placeholders
    expect(sql).toMatch(/t\.teacher_id = \$1/);
    expect(sql).toMatch(/t\.deleted_at IS NULL/);
    expect(params).toEqual([7, 20, 0]);
  });

  it('adds an is_active filter only for published/unpublished status, not "all"', async () => {
    pool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
    await taskRepo.listByTeacherManaged({ teacherId: 7, limit: 20, offset: 0, status: 'published' });
    // PostgreSQL uses TRUE/FALSE for boolean literals
    expect(pool.query.mock.calls[0][0]).toMatch(/t\.is_active = TRUE/);
  });

  it('filters by classroomId when provided', async () => {
    pool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
    await taskRepo.listByTeacherManaged({ teacherId: 7, limit: 20, offset: 0, status: 'all', classroomId: 3 });
    const [sql, params] = pool.query.mock.calls[0];
    // classroom_id filter uses a $N placeholder
    expect(sql).toMatch(/t\.classroom_id = \$\d+/);
    expect(params).toEqual([7, 3, 20, 0]);
  });
});

describe('task.repository — setPublished / softDelete', () => {
  it('setPublished writes exactly true or false, not a toggle', async () => {
    pool.query.mockResolvedValue([{}]);
    await taskRepo.setPublished(1, true);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SET is_active = $1'), [true, 1]);

    await taskRepo.setPublished(1, false);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SET is_active = $1'), [false, 1]);
  });

  it('softDelete sets deleted_at and clears is_active', async () => {
    pool.query.mockResolvedValue([{}]);
    await taskRepo.softDelete(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/deleted_at = NOW\(\)/);
    // PostgreSQL boolean FALSE, not 0
    expect(sql).toMatch(/is_active = FALSE/);
    expect(params).toEqual([1]);
  });
});
