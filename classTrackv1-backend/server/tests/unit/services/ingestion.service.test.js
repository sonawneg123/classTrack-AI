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
// Sync fs methods
jest.spyOn(fs, 'existsSync').mockReturnValue(true);
jest.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 });
jest.spyOn(fs, 'unlink').mockImplementation((path, cb) => cb && cb());
// Async fs.promises methods (used by _hashFile and _extractText)
const fsPromises = require('fs').promises;
jest.spyOn(fsPromises, 'readFile').mockResolvedValue(Buffer.from('fake file content'));

const { pool } = require('../../../src/database/connection');
const docRepo = require('../../../src/repositories/knowledgeDocument.repository');
const chunkRepo = require('../../../src/repositories/knowledgeChunk.repository');
const { registerAndProcess, retryDocument, recoverStuckDocuments } = require('../../../src/services/knowledge/ingestion.service');

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

// ─────────────────────────────────────────────────────────────────────────────
// recoverStuckDocuments
// ─────────────────────────────────────────────────────────────────────────────

describe('recoverStuckDocuments', () => {
  it('does nothing when there are no stuck documents', async () => {
    pool.query.mockResolvedValue([[], []]);
    await expect(recoverStuckDocuments()).resolves.toBeUndefined();
    // The recovery UPDATE is the only query call
    const callArgs = pool.query.mock.calls[0][0];
    expect(callArgs).toContain("status = 'processing'");
    expect(callArgs).toContain("SET status = 'uploaded'");
  });

  it('resets stuck documents and re-queues them', async () => {
    const stuckDocs = [
      { id: 10, topic_id: 1, teacher_id: 2 },
      { id: 11, topic_id: 1, teacher_id: 2 },
    ];
    pool.query.mockResolvedValue([stuckDocs, []]);

    // The re-queued _processDocumentAsync calls pool.connect — let them resolve
    // quickly by returning an empty-doc client
    const fakeClient = {
      query: jest.fn().mockResolvedValue([[], []]),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(fakeClient);

    await recoverStuckDocuments();

    const callArgs = pool.query.mock.calls[0][0];
    expect(callArgs).toContain("SET status = 'uploaded'");
    expect(callArgs).toContain("status = 'processing'");

    // Let the setImmediate-queued processing drain
    await new Promise((resolve) => setImmediate(resolve));

    // Each recovered doc triggered a pool.connect for _fetchDocumentForProcessing.
    // Calls may be >= stuckDocs.length because other tests in the same suite also
    // queue setImmediate-driven pool.connect calls before clearing mocks.
    expect(pool.connect.mock.calls.length).toBeGreaterThanOrEqual(stuckDocs.length);
  });

  it('survives a DB error without throwing', async () => {
    pool.query.mockRejectedValue(new Error('DB connection error'));
    await expect(recoverStuckDocuments()).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression: connection.js shim client result handling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Regression guard for _fetchDocumentForProcessing using the connection.js shim:
 *   pool.connect() returns a WRAPPED client whose .query() returns [rows, fields]
 *   (the same format as pool.query()).
 *
 *   _fetchDocumentForProcessing must use:
 *     const [rows] = await client.query(...)
 *   NOT:
 *     const result = await client.query(...); return result.rows[0]
 *
 *   The fakeClient below returns [rows, fields] to match the shim contract.
 */
describe('_processDocumentAsync — connection.js shim client result handling (regression)', () => {
  function makeFakeClient(rows) {
    return {
      // Mimics the connection.js shim: returns [rows, fields] tuple, NOT a plain pg result.
      query: jest.fn().mockResolvedValue([rows, []]),
      release: jest.fn(),
    };
  }

  it('processes successfully when client.query returns a pg result object with rows', async () => {
    const fakeDoc = {
      id: 1, teacher_id: 2, file_path: '/tmp/test.pdf',
      file_type: 'pdf', status: 'uploaded', retry_count: 0,
    };
    const fakeClient = makeFakeClient([fakeDoc]);
    pool.connect.mockResolvedValue(fakeClient);

    docRepo.findByHash.mockResolvedValue(null);
    docRepo.create.mockResolvedValue({ id: 1, status: 'uploaded' });
    docRepo.setStatus.mockResolvedValue();
    docRepo.resetForRetry.mockResolvedValue(null);

    // Provide a second client for the txClient (transaction phase);
    // uses [rows, fields] format consistent with the connection.js shim.
    const fakeTxClient = {
      query: jest.fn().mockResolvedValue([[], []]),
      release: jest.fn(),
    };
    pool.connect
      .mockResolvedValueOnce(fakeClient)   // first connect — document fetch
      .mockResolvedValueOnce(fakeTxClient); // second connect — transaction

    chunkRepo.deleteByDocument.mockResolvedValue();
    chunkRepo._insertChunksSequential.mockResolvedValue();

    // registerAndProcess kicks off _processDocumentAsync via setImmediate
    docRepo.findByHash.mockResolvedValue(null);
    docRepo.create.mockResolvedValue({ id: 1, status: 'uploaded' });

    const { registerAndProcess: rAndP } = jest.requireActual(
      '../../../src/services/knowledge/ingestion.service'
    );

    // This call should NOT throw "(intermediate value) is not iterable"
    // The async pipeline is triggered via setImmediate; we drive it manually
    // by calling the service and waiting for the microtask queue to drain.
    await expect(rAndP({
      topicId: 1, teacherId: 2, title: 'Test',
      originalFilename: 'test.pdf', filePath: '/tmp/test.pdf',
      fileType: 'pdf', fileSizeBytes: 100,
    })).resolves.toMatchObject({ status: 'uploaded' });

    // The critical assertion: the mock client received the SELECT query,
    // meaning _fetchDocumentForProcessing did NOT throw on the result object.
    // We flush the setImmediate queue to let the async pipeline start.
    await new Promise((resolve) => setImmediate(resolve));

    // client.query must have been called with the document SELECT
    expect(fakeClient.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
      [1]
    );
    // client.release must have been called (no leak)
    expect(fakeClient.release).toHaveBeenCalled();
  });

  it('returns null when the document row does not exist (client.query returns empty rows)', async () => {
    const fakeClient = makeFakeClient([]); // no rows
    pool.connect.mockResolvedValue(fakeClient);

    // Drive _fetchDocumentForProcessing directly via a fresh retryDocument path:
    // resetForRetry resolves, then async processing fires
    docRepo.resetForRetry.mockResolvedValue({ id: 99, retry_count: 0 });

    // pool.connect returns the client that says the document does not exist
    pool.connect.mockResolvedValueOnce(fakeClient);

    await retryDocument(99, 2);
    await new Promise((resolve) => setImmediate(resolve));

    // client.query was called and did not throw — destructuring [rows] = [[], []] gave rows=[], rows[0]=undefined → null
    expect(fakeClient.query).toHaveBeenCalled();
    expect(fakeClient.release).toHaveBeenCalled();
  });
});
