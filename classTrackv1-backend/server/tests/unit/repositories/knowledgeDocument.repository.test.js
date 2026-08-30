/**
 * server/tests/unit/repositories/knowledgeDocument.repository.test.js
 *
 * Tests for KnowledgeDocumentRepository — pool.query mocked, no live DB.
 * Covers status transitions, deduplication, and ownership enforcement.
 */
jest.mock('../../../src/database/connection', () => ({
  pool: { query: jest.fn() },
}));

const { pool } = require('../../../src/database/connection');
const docRepo = require('../../../src/repositories/knowledgeDocument.repository');

beforeEach(() => jest.clearAllMocks());

describe('KnowledgeDocumentRepository.findOwnedById', () => {
  it('enforces teacher_id ownership', async () => {
    pool.query.mockResolvedValue([[]]);
    const result = await docRepo.findOwnedById(10, 5);
    expect(result).toBeNull();
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/teacher_id = \$2/);
    expect(params).toEqual([10, 5]);
  });
});

describe('KnowledgeDocumentRepository.findByHash', () => {
  it('looks up by content_hash and teacher_id', async () => {
    const row = { id: 3, title: 'Existing Doc', status: 'ready', version: 1 };
    pool.query.mockResolvedValue([[row]]);
    const result = await docRepo.findByHash('abcdef1234567890', 5);
    expect(result).toEqual(row);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/content_hash = \$1/);
    expect(sql).toMatch(/teacher_id = \$2/);
    expect(params[0]).toBe('abcdef1234567890');
    expect(params[1]).toBe(5);
  });

  it('returns null when not found', async () => {
    pool.query.mockResolvedValue([[]]);
    expect(await docRepo.findByHash('nosuchhash', 5)).toBeNull();
  });
});

describe('KnowledgeDocumentRepository.create', () => {
  it('sets status to uploaded by default', async () => {
    const row = { id: 99, title: 'Test Doc', status: 'uploaded', created_at: new Date() };
    pool.query.mockResolvedValue([[row]]);
    const result = await docRepo.create({
      topicId: 1, teacherId: 2, title: 'Test Doc',
      originalFilename: 'test.pdf', filePath: '/uploads/test.pdf',
      fileType: 'pdf', fileSizeBytes: 1024, contentHash: null,
    });
    expect(result).toEqual(row);
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toMatch(/'uploaded'/);
  });
});

describe('KnowledgeDocumentRepository.setStatus', () => {
  it('transitions to processing', async () => {
    pool.query.mockResolvedValue([[{ id: 99, status: 'processing' }]]);
    const result = await docRepo.setStatus(99, 'processing');
    expect(result.status).toBe('processing');
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toMatch(/status = \$1/);
    expect(pool.query.mock.calls[0][1][0]).toBe('processing');
  });

  it('sets processed_at when transitioning to ready', async () => {
    pool.query.mockResolvedValue([[{ id: 99, status: 'ready' }]]);
    await docRepo.setStatus(99, 'ready', { totalChunks: 12 });
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toMatch(/processed_at.*WHEN \$1 = 'ready'/);
  });

  it('records failure_message when transitioning to failed', async () => {
    pool.query.mockResolvedValue([[{ id: 99, status: 'failed' }]]);
    await docRepo.setStatus(99, 'failed', { failureMessage: 'extraction error' });
    const params = pool.query.mock.calls[0][1];
    expect(params[0]).toBe('failed');
    expect(params[1]).toBe('extraction error');
  });
});

describe('KnowledgeDocumentRepository.resetForRetry', () => {
  it('only resets if current status is failed', async () => {
    pool.query.mockResolvedValue([[{ id: 99, retry_count: 1 }]]);
    const result = await docRepo.resetForRetry(99, 5);
    expect(result.retry_count).toBe(1);
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toMatch(/status = 'failed'/);
  });

  it('returns null when no matching failed document', async () => {
    pool.query.mockResolvedValue([[]]);
    const result = await docRepo.resetForRetry(999, 5);
    expect(result).toBeNull();
  });
});

describe('KnowledgeDocumentRepository.softDeleteOwned', () => {
  it('enforces ownership on soft delete', async () => {
    pool.query.mockResolvedValue([[{ id: 5 }]]);
    const result = await docRepo.softDeleteOwned(5, 2);
    expect(result).toBe(true);
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toMatch(/teacher_id = \$2/);
  });

  it('returns false when document not owned by teacher', async () => {
    pool.query.mockResolvedValue([[]]);
    expect(await docRepo.softDeleteOwned(5, 99)).toBe(false);
  });
});

describe('KnowledgeDocumentRepository.hardDeleteOwned', () => {
  it('issues a real DELETE and returns file_path', async () => {
    pool.query.mockResolvedValue([[{ file_path: '/uploads/knowledge/803020012.pdf' }]]);
    const result = await docRepo.hardDeleteOwned(7, 3);
    expect(result).toBe('/uploads/knowledge/803020012.pdf');
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM knowledge_documents/);
    expect(sql).toMatch(/teacher_id = \$2/);
    expect(params).toEqual([7, 3]);
  });

  it('returns null when document not found', async () => {
    pool.query.mockResolvedValue([[]]);
    expect(await docRepo.hardDeleteOwned(999, 3)).toBeNull();
  });

  it('uses provided pg client when given', async () => {
    const mockClient = { query: jest.fn().mockResolvedValue([[{ file_path: '/uploads/x.pdf' }]]) };
    const result = await docRepo.hardDeleteOwned(7, 3, mockClient);
    expect(result).toBe('/uploads/x.pdf');
    expect(mockClient.query).toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('KnowledgeDocumentRepository.listFilePathsByCurriculum', () => {
  it('queries through the full hierarchy and returns file_path array', async () => {
    pool.query.mockResolvedValue([[
      { file_path: '/uploads/a.pdf' },
      { file_path: '/uploads/b.pdf' },
    ]]);
    const result = await docRepo.listFilePathsByCurriculum(1, 5);
    expect(result).toEqual(['/uploads/a.pdf', '/uploads/b.pdf']);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/curriculum_id = \$1/);
    expect(sql).toMatch(/kd\.teacher_id\s*=\s*\$2/);
    expect(params).toEqual([1, 5]);
  });

  it('returns empty array when no documents found', async () => {
    pool.query.mockResolvedValue([[]]);
    const result = await docRepo.listFilePathsByCurriculum(99, 5);
    expect(result).toEqual([]);
  });

  it('uses provided pg client when given', async () => {
    const mockClient = { query: jest.fn().mockResolvedValue([[{ file_path: '/uploads/c.pdf' }]]) };
    const result = await docRepo.listFilePathsByCurriculum(1, 5, mockClient);
    expect(result).toEqual(['/uploads/c.pdf']);
    expect(mockClient.query).toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('KnowledgeDocumentRepository.listFilePathsBySubject', () => {
  it('queries through chapters and returns file_paths', async () => {
    pool.query.mockResolvedValue([[{ file_path: '/uploads/s1.pdf' }]]);
    const result = await docRepo.listFilePathsBySubject(2, 5);
    expect(result).toEqual(['/uploads/s1.pdf']);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/ch\.subject_id = \$1/);
    expect(sql).toMatch(/kd\.teacher_id = \$2/);
    expect(params).toEqual([2, 5]);
  });
});

describe('KnowledgeDocumentRepository.listFilePathsByChapter', () => {
  it('queries through topics and returns file_paths', async () => {
    pool.query.mockResolvedValue([[{ file_path: '/uploads/ch1.pdf' }, { file_path: '/uploads/ch2.pdf' }]]);
    const result = await docRepo.listFilePathsByChapter(3, 5);
    expect(result).toEqual(['/uploads/ch1.pdf', '/uploads/ch2.pdf']);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/t\.chapter_id\s*=\s*\$1/);
    expect(sql).toMatch(/kd\.teacher_id = \$2/);
    expect(params).toEqual([3, 5]);
  });
});

describe('KnowledgeDocumentRepository.listFilePathsByTopic', () => {
  it('queries directly on topic_id', async () => {
    pool.query.mockResolvedValue([[{ file_path: '/uploads/t1.pdf' }]]);
    const result = await docRepo.listFilePathsByTopic(4, 5);
    expect(result).toEqual(['/uploads/t1.pdf']);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/kd\.topic_id\s*=\s*\$1/);
    expect(sql).toMatch(/kd\.teacher_id = \$2/);
    expect(params).toEqual([4, 5]);
  });

  it('returns empty array when topic has no documents', async () => {
    pool.query.mockResolvedValue([[]]);
    expect(await docRepo.listFilePathsByTopic(99, 5)).toEqual([]);
  });
});
