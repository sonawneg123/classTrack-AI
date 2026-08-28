/**
 * server/tests/unit/repositories/curriculum.repository.test.js
 *
 * Tests for CurriculumRepository — pool.query mocked, no live DB.
 */
jest.mock('../../../src/database/connection', () => ({
  pool: { query: jest.fn() },
}));

const { pool } = require('../../../src/database/connection');
const curriculumRepo = require('../../../src/repositories/curriculum.repository');

beforeEach(() => jest.clearAllMocks());

describe('CurriculumRepository.findOwnedById', () => {
  it('filters by id AND teacher_id', async () => {
    pool.query.mockResolvedValue([[]]);
    await curriculumRepo.findOwnedById(5, 2);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/teacher_id = \$2/);
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(params).toEqual([5, 2]);
  });

  it('returns the row when found', async () => {
    const row = { id: 5, teacher_id: 2, name: 'Biology', deleted_at: null };
    pool.query.mockResolvedValue([[row]]);
    const result = await curriculumRepo.findOwnedById(5, 2);
    expect(result).toEqual(row);
  });

  it('returns null when not found', async () => {
    pool.query.mockResolvedValue([[]]);
    const result = await curriculumRepo.findOwnedById(999, 2);
    expect(result).toBeNull();
  });
});

describe('CurriculumRepository.listByTeacher', () => {
  it('filters by teacher_id and excludes soft-deleted', async () => {
    pool.query.mockResolvedValue([[]]);
    await curriculumRepo.listByTeacher(3);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/teacher_id = \$1/);
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(params).toEqual([3]);
  });
});

describe('CurriculumRepository.createForTeacher', () => {
  it('inserts with teacher_id and returns row', async () => {
    const row = { id: 10, name: 'Science', description: null, is_active: true, created_at: new Date() };
    pool.query.mockResolvedValue([[row]]);
    const result = await curriculumRepo.createForTeacher(3, { name: 'Science', description: null });
    expect(result).toEqual(row);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO curricula/);
    expect(params[0]).toBe(3); // teacherId
    expect(params[1]).toBe('Science');
  });
});

describe('CurriculumRepository.softDeleteOwned', () => {
  it('sets deleted_at where id AND teacher_id match', async () => {
    pool.query.mockResolvedValue([[{ id: 5 }]]);
    const result = await curriculumRepo.softDeleteOwned(5, 2);
    expect(result).toBe(true);
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toMatch(/deleted_at = NOW/);
  });

  it('returns false when row not found (wrong teacher)', async () => {
    pool.query.mockResolvedValue([[]]);
    const result = await curriculumRepo.softDeleteOwned(5, 99);
    expect(result).toBe(false);
  });
});
