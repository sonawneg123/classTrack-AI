/**
 * server/tests/unit/services/ingestion.service.test.js
 *
 * Tests for the document ingestion pipeline.
 * Mocks: pool, repositories, embedding provider, chunking service.
 */

// Mock heavy modules before requiring anything
jest.mock('../../../src/database/connection', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock('../../../src/repositories/knowledgeDocument.repository', () => ({
  findByHash: jest.fn(),
  create: jest.fn(),
  setStatus: jest.fn(),
  resetForRetry: jest.fn(),
  findOwnedById: jest.fn(),
}));

jest.mock('../../../src/repositories/knowledgeChunk.repository', () => ({
  deleteByDocument: jest.fn(),
  _insertChunksSequential: jest.fn(),
}));

jest.mock('../../../src/services/ai/providers', () => ({
  getEmbeddingProvider: jest.fn(() => ({
    generateEmbeddings: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  })),
}));

jest.mock('pdf-parse', () => jest.fn().mockResolvedValue({ text: 'PDF content here.' }));
jest.mock('mammoth', () => ({
  extractRawText: jest.fn().mockResolvedValue({ value: 'DOCX content here.' }),
}));

const fs = require('fs');
jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('fake file content'));
jest.spyOn(fs, 'unlink').mockImplementation((path, cb) => cb && cb());

const { pool } = require('../../../src/database/connection');
const docRepo = require('../../../src/repositories/knowledgeDocument.repository');
const chunkRepo = require('../../../src/repositories/knowledgeChunk.repository');
const { registerAndProcess, retryDocument } = require('../../../src/services/knowledge/ingestion.service');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('registerAndProcess', () => {
  it('throws DUPLICATE error when content hash already exists', async () => {
    docRepo.findByHash.mockResolvedValue({ id: 3, title: 'Existing', status: 'ready' });

    const err = await registerAndProcess({
      topicId: 1, teacherId: 2, title: 'Test',
      originalFilename: 'test.pdf', filePath: '/tmp/test.pdf',
      fileType: 'pdf', fileSizeBytes: 100,
    }).catch((e) => e);

    expect(err.code).toBe('DUPLICATE');
    expect(err.existingId).toBe(3);
  });

  it('creates document record when no duplicate found', async () => {
    docRepo.findByHash.mockResolvedValue(null);
    docRepo.create.mockResolvedValue({ id: 10, title: 'Test', status: 'uploaded' });

    const result = await registerAndProcess({
      topicId: 1, teacherId: 2, title: 'Test',
      originalFilename: 'test.pdf', filePath: '/tmp/test.pdf',
      fileType: 'pdf', fileSizeBytes: 100,
    });

    expect(docRepo.create).toHaveBeenCalled();
    expect(result.status).toBe('uploaded');
  });
});

describe('retryDocument', () => {
  it('returns null when no failed document found', async () => {
    docRepo.resetForRetry.mockResolvedValue(null);
    const result = await retryDocument(999, 1);
    expect(result).toBeNull();
  });

  it('resets the document and returns updated row', async () => {
    docRepo.resetForRetry.mockResolvedValue({ id: 5, retry_count: 1 });
    const result = await retryDocument(5, 1);
    expect(result.retry_count).toBe(1);
  });
});
