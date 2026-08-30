/**
 * server/tests/unit/services/retrieval.service.test.js
 *
 * Unit tests for the hardened retrieval.service.js
 *
 * Tests:
 *   - Input validation
 *   - teacherId required (security)
 *   - Embedding dimension guard
 *   - Similarity threshold filtering (similarity vs distance)
 *   - Diversity / deduplication rules
 *   - INSUFFICIENT_CONTEXT (belowThreshold flag)
 *   - Source metadata mapping (pageNumber, sectionHeading)
 *   - buildContext structured output
 */

jest.mock('../../../src/utils/logger.util', () => ({
  debug: jest.fn(),
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
}));
jest.mock('../../../src/services/ai/providers', () => ({
  getEmbeddingProvider: jest.fn(),
}));
jest.mock('../../../src/repositories/knowledgeChunk.repository', () => ({
  similaritySearch: jest.fn(),
}));
// Mock config to control thresholds in tests
jest.mock('../../../src/config', () => ({
  embedding: { dimension: 384 },
  rag: {
    candidateK:    20,
    finalK:         8,
    minSimilarity:  0.30,
    get topK() { return this.candidateK; },
  },
  questionGeneration: { maxContextChars: 12000 },
}));

const { search, buildContext } = require('../../../src/services/knowledge/retrieval.service');
const { getEmbeddingProvider } = require('../../../src/services/ai/providers');
const chunkRepo = require('../../../src/repositories/knowledgeChunk.repository');

// ── Helpers ───────────────────────────────────────────────────────────────────

// Build a fake 384-dim embedding
function fakeEmbedding(dim = 384) {
  return Array.from({ length: dim }, (_, i) => i / dim);
}

// Build a fake DB row as returned by chunkRepo.similaritySearch
function makeRow(overrides = {}) {
  return {
    chunk_id:       overrides.chunkId   ?? 1,
    doc_id:         overrides.docId     ?? 10,
    chunk_index:    overrides.chunkIndex ?? 0,
    chunk_text:     overrides.text      ?? 'Sample chunk text for testing purposes.',
    source_meta:    overrides.sourceMeta ?? { page: 1, section: 'Introduction' },
    similarity:     overrides.similarity ?? 0.85,
    document_title: overrides.title     ?? 'Test Document',
    original_filename: 'test.pdf',
    file_type:      'pdf',
    topic_id:       overrides.topicId   ?? 5,
    topic_name:     'Test Topic',
    chapter_id:     2,
    chapter_name:   'Test Chapter',
    subject_id:     1,
    subject_name:   'Test Subject',
    curriculum_id:  1,
    curriculum_name: 'Test Curriculum',
    document_id:    overrides.docId ?? 10,
  };
}

// Build n rows with varying similarity (descending)
function makeRows(n, baseSimilarity = 0.90) {
  return Array.from({ length: n }, (_, i) =>
    makeRow({ chunkId: i + 1, chunkIndex: i, similarity: baseSimilarity - i * 0.01 })
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  getEmbeddingProvider.mockReturnValue({
    generateEmbedding: jest.fn().mockResolvedValue(fakeEmbedding()),
  });
  chunkRepo.similaritySearch.mockResolvedValue([]);
});

// ── Input validation ──────────────────────────────────────────────────────────

describe('search — input validation', () => {
  it('throws when query is empty string', async () => {
    await expect(search({ query: '', teacherId: 1 })).rejects.toThrow('Search query cannot be empty');
  });

  it('throws when query is whitespace-only', async () => {
    await expect(search({ query: '   ', teacherId: 1 })).rejects.toThrow('Search query cannot be empty');
  });

  it('throws when teacherId is missing', async () => {
    await expect(search({ query: 'valid query', teacherId: undefined }))
      .rejects.toThrow('[RAG] teacherId is required');
  });
});

// ── Dimension guard ───────────────────────────────────────────────────────────

describe('search — embedding dimension guard', () => {
  it('throws immediately when embedding has wrong dimension', async () => {
    // Mock embedding provider to return wrong dimension
    getEmbeddingProvider.mockReturnValue({
      generateEmbedding: jest.fn().mockResolvedValue(fakeEmbedding(1536)), // wrong!
    });
    await expect(search({ query: 'test', teacherId: 1 }))
      .rejects.toThrow('Dimension mismatch');
    // chunkRepo should NOT have been called
    expect(chunkRepo.similaritySearch).not.toHaveBeenCalled();
  });

  it('does NOT throw when embedding has correct dimension (384)', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([]);
    await expect(search({ query: 'test', teacherId: 1 })).resolves.toBeDefined();
    expect(chunkRepo.similaritySearch).toHaveBeenCalledTimes(1);
  });
});

// ── Security: teacherId always passed to repository ───────────────────────────

describe('search — security: teacherId passed to repository', () => {
  it('passes teacherId to chunkRepo.similaritySearch', async () => {
    await search({ query: 'biodiversity', teacherId: 42 });
    expect(chunkRepo.similaritySearch).toHaveBeenCalledWith(
      42,
      expect.any(Array),
      expect.any(Number),
      expect.any(Object)
    );
  });

  it('passes topicId filter when provided', async () => {
    await search({ query: 'biodiversity', teacherId: 1, filters: { topicId: 99 } });
    expect(chunkRepo.similaritySearch).toHaveBeenCalledWith(
      1,
      expect.any(Array),
      expect.any(Number),
      expect.objectContaining({ topicId: 99 })
    );
  });
});

// ── Similarity threshold ──────────────────────────────────────────────────────

describe('search — similarity threshold', () => {
  it('returns belowThreshold=true when no rows returned', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([]);
    const { belowThreshold, results } = await search({ query: 'test', teacherId: 1 });
    expect(belowThreshold).toBe(true);
    expect(results).toHaveLength(0);
  });

  it('filters out chunks below minSimilarity (0.30)', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ similarity: 0.85 }),   // above → keep
      makeRow({ chunkId: 2, chunkIndex: 1, similarity: 0.29 }),  // below → discard
    ]);
    const { results, belowThreshold } = await search({ query: 'test', teacherId: 1 });
    expect(belowThreshold).toBe(false);
    expect(results.length).toBe(1);
    expect(results[0].similarity).toBe(0.85);
  });

  it('returns belowThreshold=true when ALL candidates are below threshold', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ similarity: 0.20 }),
      makeRow({ chunkId: 2, chunkIndex: 1, similarity: 0.15 }),
    ]);
    const { belowThreshold, results } = await search({ query: 'test', teacherId: 1 });
    expect(belowThreshold).toBe(true);
    expect(results).toHaveLength(0);
  });

  it('bestSimilarity is the top candidate similarity', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ similarity: 0.91 }),
      makeRow({ chunkId: 2, chunkIndex: 1, similarity: 0.75 }),
    ]);
    const { bestSimilarity } = await search({ query: 'test', teacherId: 1 });
    expect(bestSimilarity).toBe(0.91);
  });

  it('bestSimilarity is null when no candidates', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([]);
    const { bestSimilarity } = await search({ query: 'test', teacherId: 1 });
    expect(bestSimilarity).toBeNull();
  });

  it('treats similarity correctly as 1-distance (NOT raw distance)', async () => {
    // similarity=0.35 is ABOVE the 0.30 threshold — should be included
    chunkRepo.similaritySearch.mockResolvedValue([makeRow({ similarity: 0.35 })]);
    const { results } = await search({ query: 'test', teacherId: 1 });
    expect(results).toHaveLength(1);
  });
});

// ── Diversity / deduplication ─────────────────────────────────────────────────

describe('search — diversity filter', () => {
  it('caps results at finalK (8 by default)', async () => {
    // Return 20 rows all with high similarity
    chunkRepo.similaritySearch.mockResolvedValue(makeRows(20, 0.90));
    const { results } = await search({ query: 'test', teacherId: 1 });
    expect(results.length).toBeLessThanOrEqual(8);
  });

  it('removes near-duplicate chunks (same 120-char prefix)', async () => {
    const repeatedText = 'x'.repeat(200); // long identical text
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: 1, chunkIndex: 0, text: repeatedText, similarity: 0.90 }),
      makeRow({ chunkId: 2, chunkIndex: 5, text: repeatedText, similarity: 0.88 }),
      makeRow({ chunkId: 3, chunkIndex: 10, text: repeatedText, similarity: 0.86 }),
    ]);
    const { results } = await search({ query: 'test', teacherId: 1 });
    // Only first one should survive near-duplicate check
    expect(results.length).toBe(1);
    expect(results[0].chunkId).toBe(1);
  });

  it('limits consecutive chunks from same document window', async () => {
    // 6 consecutive chunks from doc 10 (chunkIndex 0..5)
    const rows = Array.from({ length: 6 }, (_, i) =>
      makeRow({ chunkId: i + 1, chunkIndex: i, docId: 10, text: `Unique text ${i} ${'y'.repeat(50)}`, similarity: 0.90 - i * 0.01 })
    );
    chunkRepo.similaritySearch.mockResolvedValue(rows);
    const { results } = await search({ query: 'test', teacherId: 1 });
    // Allowed: first 3 consecutive, then chunkIndex 4+ resets (non-consecutive)
    // Regardless of exact logic, we should NOT select all 6
    const fromDoc10 = results.filter(r => r.documentId === 10);
    expect(fromDoc10.length).toBeLessThan(6);
  });
});

// ── Source metadata mapping ───────────────────────────────────────────────────

describe('search — source metadata', () => {
  it('maps pageNumber from source_meta.page', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ sourceMeta: { page: 5, section: 'Chapter 1' }, similarity: 0.80 }),
    ]);
    const { results } = await search({ query: 'test', teacherId: 1 });
    expect(results[0].pageNumber).toBe(5);
    expect(results[0].sectionHeading).toBe('Chapter 1');
  });

  it('maps pageNumber to null when source_meta is null', async () => {
    // Directly build a row with source_meta=null (bypassing makeRow ?? default)
    const row = {
      ...makeRow({ similarity: 0.80 }),
      source_meta: null,
    };
    chunkRepo.similaritySearch.mockResolvedValue([row]);
    const { results } = await search({ query: 'test', teacherId: 1 });
    expect(results[0].pageNumber).toBeNull();
    expect(results[0].sectionHeading).toBeNull();
  });

  it('returns all required metadata fields', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([makeRow({ similarity: 0.75 })]);
    const { results } = await search({ query: 'test', teacherId: 1 });
    const r = results[0];
    expect(r).toHaveProperty('chunkId');
    expect(r).toHaveProperty('documentId');
    expect(r).toHaveProperty('topicId');
    expect(r).toHaveProperty('similarity');
    expect(r).toHaveProperty('content');
    expect(r).toHaveProperty('text');          // legacy alias
    expect(r).toHaveProperty('chunkIndex');
    expect(r).toHaveProperty('pageNumber');
    expect(r).toHaveProperty('sectionHeading');
    expect(r).toHaveProperty('documentTitle');
    expect(r).toHaveProperty('source');
    expect(r.source).toHaveProperty('documentId');
    expect(r.source.topic).toHaveProperty('id');
    expect(r.source.topic).toHaveProperty('name');
  });
});

// ── Return shape ──────────────────────────────────────────────────────────────

describe('search — return shape', () => {
  it('returns candidates count (pre-filter)', async () => {
    chunkRepo.similaritySearch.mockResolvedValue(makeRows(5, 0.80));
    const { candidates } = await search({ query: 'test', teacherId: 1 });
    expect(candidates).toBe(5);
  });

  it('candidates reflects DB rows even if all filtered out', async () => {
    chunkRepo.similaritySearch.mockResolvedValue(makeRows(3, 0.10)); // all below threshold
    const { candidates, results } = await search({ query: 'test', teacherId: 1 });
    expect(candidates).toBe(3);
    expect(results).toHaveLength(0);
  });
});

// ── buildContext ──────────────────────────────────────────────────────────────

describe('buildContext', () => {
  const sampleChunks = [
    {
      chunkId: 1,
      documentTitle: 'Biology Textbook',
      pageNumber: 4,
      sectionHeading: 'Photosynthesis',
      content: 'Plants use sunlight to produce glucose.',
    },
    {
      chunkId: 2,
      documentTitle: 'Biology Textbook',
      pageNumber: null,
      sectionHeading: null,
      content: 'The chloroplast is the site of photosynthesis.',
    },
  ];

  it('includes [Source N] header', () => {
    const ctx = buildContext(sampleChunks);
    expect(ctx).toContain('[Source 1]');
    expect(ctx).toContain('[Source 2]');
  });

  it('includes document title', () => {
    const ctx = buildContext(sampleChunks);
    expect(ctx).toContain('Document: Biology Textbook');
  });

  it('includes page number when available', () => {
    const ctx = buildContext(sampleChunks);
    expect(ctx).toContain('Page: 4');
  });

  it('omits Page line when pageNumber is null', () => {
    const ctx = buildContext([sampleChunks[1]]);
    expect(ctx).not.toContain('Page:');
  });

  it('includes section heading when available', () => {
    const ctx = buildContext(sampleChunks);
    expect(ctx).toContain('Section: Photosynthesis');
  });

  it('includes chunk content', () => {
    const ctx = buildContext(sampleChunks);
    expect(ctx).toContain('Plants use sunlight to produce glucose.');
  });

  it('includes Chunk ID', () => {
    const ctx = buildContext(sampleChunks);
    expect(ctx).toContain('Chunk ID: 1');
  });

  it('respects maxChars limit by excluding chunks that would exceed it', () => {
    // maxChars=500 fits one chunk header+content (~200 chars) but not two
    const bigChunk = { ...sampleChunks[0], content: 'a'.repeat(300) };
    const ctx = buildContext([bigChunk, bigChunk], 500);
    // First source fits
    expect(ctx).toContain('[Source 1]');
    // Second source would exceed cap
    expect(ctx).not.toContain('[Source 2]');
  });

  it('returns empty string for empty input', () => {
    expect(buildContext([])).toBe('');
  });
});
