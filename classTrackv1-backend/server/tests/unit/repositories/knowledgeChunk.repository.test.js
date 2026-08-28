/**
 * server/tests/unit/repositories/knowledgeChunk.repository.test.js
 *
 * Tests for KnowledgeChunkRepository — pool.query mocked, no live DB.
 */
jest.mock('../../../src/database/connection', () => ({
  pool: { query: jest.fn() },
}));

const { pool } = require('../../../src/database/connection');
const chunkRepo = require('../../../src/repositories/knowledgeChunk.repository');

beforeEach(() => jest.clearAllMocks());

describe('KnowledgeChunkRepository._insertChunksSequential', () => {
  it('calls pool.query once per chunk', async () => {
    pool.query.mockResolvedValue([[]]);
    const chunks = [
      { chunkIndex: 0, chunkText: 'hello', charCount: 5, tokenApprox: 2, sourceMeta: {}, embedding: [0.1, 0.2] },
      { chunkIndex: 1, chunkText: 'world', charCount: 5, tokenApprox: 2, sourceMeta: {}, embedding: [0.3, 0.4] },
    ];
    await chunkRepo._insertChunksSequential(1, 2, chunks, pool);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('passes document_id and teacher_id to every insert', async () => {
    pool.query.mockResolvedValue([[]]);
    await chunkRepo._insertChunksSequential(10, 20, [
      { chunkIndex: 0, chunkText: 'text', charCount: 4, tokenApprox: 1, sourceMeta: {}, embedding: null },
    ], pool);
    const params = pool.query.mock.calls[0][1];
    expect(params[0]).toBe(10); // document_id
    expect(params[1]).toBe(20); // teacher_id
  });
});

describe('KnowledgeChunkRepository.deleteByDocument', () => {
  it('deletes by document_id', async () => {
    pool.query.mockResolvedValue([[]]);
    await chunkRepo.deleteByDocument(5, pool);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM knowledge_chunks/);
    expect(params).toEqual([5]);
  });
});

describe('KnowledgeChunkRepository.similaritySearch', () => {
  it('enforces teacher_id in WHERE clause', async () => {
    pool.query.mockResolvedValue([[]]);
    const embedding = new Array(384).fill(0.1);
    await chunkRepo.similaritySearch(7, embedding, 5);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/kc\.teacher_id = \$2/);
    expect(params[1]).toBe(7); // teacherId
  });

  it('only searches ready documents', async () => {
    pool.query.mockResolvedValue([[]]);
    const embedding = new Array(384).fill(0.1);
    await chunkRepo.similaritySearch(7, embedding, 5);
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toMatch(/kd\.status = 'ready'/);
  });

  it('filters by topicId when provided', async () => {
    pool.query.mockResolvedValue([[]]);
    const embedding = new Array(384).fill(0.1);
    await chunkRepo.similaritySearch(7, embedding, 5, { topicId: 3 });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/kd\.topic_id = /);
    expect(params).toContain(3);
  });
});
