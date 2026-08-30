/**
 * server/tests/unit/services/retrieval.service.test.js
 *
 * Unit tests for the hardened retrieval.service.js — Sprint 1 + Sprint 2
 *
 * Sprint 1 Tests (REGRESSION — must all continue to pass):
 *   - Input validation
 *   - teacherId required (security)
 *   - Embedding dimension guard
 *   - Similarity threshold filtering (similarity vs distance)
 *   - Diversity / deduplication rules
 *   - INSUFFICIENT_CONTEXT (belowThreshold flag)
 *   - Source metadata mapping (pageNumber, sectionHeading)
 *   - buildContext structured output
 *
 * Sprint 2 Tests (NEW):
 *   - Keyword retrieval is called alongside vector retrieval
 *   - RRF fusion ordering
 *   - Vector-only candidates
 *   - Keyword-only candidates
 *   - Candidates appearing in both (hybrid)
 *   - Duplicate removal
 *   - Empty vector results
 *   - Empty keyword results
 *   - Both empty
 *   - Final K enforcement
 *   - Security: keyword search receives same teacherId + filters
 *   - Backward compatibility: candidates field still equals vectorRows.length
 *   - retrievalMethod field on results
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
  keywordSearch:    jest.fn(),
}));
// Mock the reranker factory so tests can control reranking behaviour
jest.mock('../../../src/services/knowledge/reranker', () => ({
  getReranker: jest.fn(),
}));
// Mock config to control thresholds in tests
jest.mock('../../../src/config', () => ({
  embedding: { dimension: 384 },
  rag: {
    candidateK:        20,
    keywordCandidateK: 20,
    finalK:             8,
    minSimilarity:      0.30,
    rrfK:               60,
    get topK() { return this.candidateK; },
    reranker: {
      enabled:    false,  // disabled by default — tests opt-in per describe
      model:      'Xenova/ms-marco-MiniLM-L-6-v2',
      candidateK: 15,
    },
  },
  questionGeneration: { maxContextChars: 12000 },
}));

const { search, buildContext } = require('../../../src/services/knowledge/retrieval.service');
const { getEmbeddingProvider } = require('../../../src/services/ai/providers');
const chunkRepo = require('../../../src/repositories/knowledgeChunk.repository');
const { getReranker } = require('../../../src/services/knowledge/reranker');

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

// Build a fake DB row as returned by chunkRepo.keywordSearch
function makeKeywordRow(overrides = {}) {
  return {
    chunk_id:       overrides.chunkId   ?? 1,
    doc_id:         overrides.docId     ?? 10,
    chunk_index:    overrides.chunkIndex ?? 0,
    chunk_text:     overrides.text      ?? 'Sample keyword chunk text for testing.',
    source_meta:    overrides.sourceMeta ?? { page: 2, section: 'Results' },
    keyword_rank:   overrides.keywordRank ?? 0.15,
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
  // Default: no results from either retrieval method
  chunkRepo.similaritySearch.mockResolvedValue([]);
  chunkRepo.keywordSearch.mockResolvedValue([]);
  // Default: reranker disabled (null = disabled, matches config.rag.reranker.enabled=false)
  getReranker.mockReturnValue(null);
});

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 1 REGRESSION TESTS
// ─────────────────────────────────────────────────────────────────────────────

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
    getEmbeddingProvider.mockReturnValue({
      generateEmbedding: jest.fn().mockResolvedValue(fakeEmbedding(1536)), // wrong!
    });
    await expect(search({ query: 'test', teacherId: 1 }))
      .rejects.toThrow('Dimension mismatch');
    expect(chunkRepo.similaritySearch).not.toHaveBeenCalled();
    expect(chunkRepo.keywordSearch).not.toHaveBeenCalled();
  });

  it('does NOT throw when embedding has correct dimension (384)', async () => {
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
  it('returns belowThreshold=true when no rows returned from either retrieval', async () => {
    const { belowThreshold, results } = await search({ query: 'test', teacherId: 1 });
    expect(belowThreshold).toBe(true);
    expect(results).toHaveLength(0);
  });

  it('filters out vector chunks below minSimilarity (0.30)', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ similarity: 0.85 }),   // above → keep
      makeRow({ chunkId: 2, chunkIndex: 1, similarity: 0.29 }),  // below → discard
    ]);
    const { results, belowThreshold } = await search({ query: 'test', teacherId: 1 });
    expect(belowThreshold).toBe(false);
    expect(results.length).toBe(1);
    expect(results[0].similarity).toBe(0.85);
  });

  it('returns belowThreshold=true when ALL vector candidates are below threshold and no keyword results', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ similarity: 0.20 }),
      makeRow({ chunkId: 2, chunkIndex: 1, similarity: 0.15 }),
    ]);
    const { belowThreshold, results } = await search({ query: 'test', teacherId: 1 });
    expect(belowThreshold).toBe(true);
    expect(results).toHaveLength(0);
  });

  it('bestSimilarity is the top vector candidate similarity', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ similarity: 0.91 }),
      makeRow({ chunkId: 2, chunkIndex: 1, similarity: 0.75 }),
    ]);
    const { bestSimilarity } = await search({ query: 'test', teacherId: 1 });
    expect(bestSimilarity).toBe(0.91);
  });

  it('bestSimilarity is null when no vector candidates', async () => {
    const { bestSimilarity } = await search({ query: 'test', teacherId: 1 });
    expect(bestSimilarity).toBeNull();
  });

  it('treats similarity correctly as 1-distance (NOT raw distance)', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([makeRow({ similarity: 0.35 })]);
    const { results } = await search({ query: 'test', teacherId: 1 });
    expect(results).toHaveLength(1);
  });
});

// ── Diversity / deduplication ─────────────────────────────────────────────────

describe('search — diversity filter', () => {
  it('caps results at finalK (8 by default)', async () => {
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
    expect(results.length).toBe(1);
    expect(results[0].chunkId).toBe(1);
  });

  it('limits consecutive chunks from same document window', async () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      makeRow({ chunkId: i + 1, chunkIndex: i, docId: 10, text: `Unique text ${i} ${'y'.repeat(50)}`, similarity: 0.90 - i * 0.01 })
    );
    chunkRepo.similaritySearch.mockResolvedValue(rows);
    const { results } = await search({ query: 'test', teacherId: 1 });
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

// ── Return shape (Sprint 1 backward compat) ───────────────────────────────────

describe('search — return shape', () => {
  it('returns candidates count (pre-filter, equals vector row count)', async () => {
    chunkRepo.similaritySearch.mockResolvedValue(makeRows(5, 0.80));
    const { candidates } = await search({ query: 'test', teacherId: 1 });
    expect(candidates).toBe(5);
  });

  it('candidates reflects vector DB rows even if all filtered out', async () => {
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

  // buildContext now returns an object: { context, selectedCount, droppedCount, estimatedTokens, budgetTokens }

  it('includes [Source N] header', () => {
    const { context } = buildContext(sampleChunks);
    expect(context).toContain('[Source 1]');
    expect(context).toContain('[Source 2]');
  });

  it('includes document title', () => {
    const { context } = buildContext(sampleChunks);
    expect(context).toContain('Document: Biology Textbook');
  });

  it('includes page number when available', () => {
    const { context } = buildContext(sampleChunks);
    expect(context).toContain('Page: 4');
  });

  it('omits Page line when pageNumber is null', () => {
    const { context } = buildContext([sampleChunks[1]]);
    expect(context).not.toContain('Page:');
  });

  it('includes section heading when available', () => {
    const { context } = buildContext(sampleChunks);
    expect(context).toContain('Section: Photosynthesis');
  });

  it('includes chunk content', () => {
    const { context } = buildContext(sampleChunks);
    expect(context).toContain('Plants use sunlight to produce glucose.');
  });

  it('includes Chunk ID', () => {
    const { context } = buildContext(sampleChunks);
    expect(context).toContain('Chunk ID: 1');
  });

  it('respects maxChars limit by excluding chunks that would exceed it', () => {
    const bigChunk = { ...sampleChunks[0], content: 'a'.repeat(300) };
    const { context, selectedCount, droppedCount } = buildContext([bigChunk, bigChunk], 500);
    expect(context).toContain('[Source 1]');
    expect(context).not.toContain('[Source 2]');
    expect(selectedCount).toBe(1);
    expect(droppedCount).toBe(1);
  });

  it('returns empty context string for empty input', () => {
    const { context, selectedCount, droppedCount } = buildContext([]);
    expect(context).toBe('');
    expect(selectedCount).toBe(0);
    expect(droppedCount).toBe(0);
  });

  it('returns selectedCount and droppedCount metadata', () => {
    const { selectedCount, droppedCount } = buildContext(sampleChunks);
    expect(selectedCount).toBe(2);
    expect(droppedCount).toBe(0);
  });

  it('returns estimatedTokens > 0 for non-empty input', () => {
    const { estimatedTokens } = buildContext(sampleChunks);
    expect(estimatedTokens).toBeGreaterThan(0);
  });

  it('returns budgetTokens null when no token budget supplied', () => {
    const { budgetTokens } = buildContext(sampleChunks);
    expect(budgetTokens).toBeNull();
  });

  it('respects maxTokens budget by excluding chunks that exceed token limit', () => {
    // Each chunk's block is ~20 lines; at 3.5 chars/token a 50-token budget
    // is enough for the first block but not both.
    const { selectedCount, droppedCount, budgetTokens } = buildContext(sampleChunks, undefined, 50);
    expect(budgetTokens).toBe(50);
    expect(selectedCount).toBeLessThan(2);
    expect(droppedCount).toBeGreaterThan(0);
  });

  it('includes all chunks when token budget is large', () => {
    const { selectedCount, droppedCount } = buildContext(sampleChunks, undefined, 99999);
    expect(selectedCount).toBe(2);
    expect(droppedCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 2 NEW TESTS
// ─────────────────────────────────────────────────────────────────────────────

// ── Keyword retrieval is invoked ──────────────────────────────────────────────

describe('Sprint 2 — keyword retrieval invocation', () => {
  it('calls chunkRepo.keywordSearch with teacherId and query', async () => {
    await search({ query: 'photosynthesis', teacherId: 7 });
    expect(chunkRepo.keywordSearch).toHaveBeenCalledWith(
      7,
      'photosynthesis',
      expect.any(Number),
      expect.any(Object)
    );
  });

  it('passes topicId filter to keywordSearch as well as similaritySearch', async () => {
    await search({ query: 'photosynthesis', teacherId: 1, filters: { topicId: 55 } });
    expect(chunkRepo.keywordSearch).toHaveBeenCalledWith(
      1,
      'photosynthesis',
      expect.any(Number),
      expect.objectContaining({ topicId: 55 })
    );
    expect(chunkRepo.similaritySearch).toHaveBeenCalledWith(
      1,
      expect.any(Array),
      expect.any(Number),
      expect.objectContaining({ topicId: 55 })
    );
  });

  it('keyword search is called even when vector returns no results', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([]);
    chunkRepo.keywordSearch.mockResolvedValue([makeKeywordRow({ chunkId: 99 })]);
    await search({ query: 'constitution', teacherId: 1 });
    expect(chunkRepo.keywordSearch).toHaveBeenCalledTimes(1);
  });

  it('vector and keyword are called in parallel (both always called)', async () => {
    await search({ query: 'biology', teacherId: 1 });
    expect(chunkRepo.similaritySearch).toHaveBeenCalledTimes(1);
    expect(chunkRepo.keywordSearch).toHaveBeenCalledTimes(1);
  });
});

// ── Keyword-only candidate ────────────────────────────────────────────────────

describe('Sprint 2 — keyword-only candidates', () => {
  it('includes a keyword-only chunk even when vector returns nothing', async () => {
    chunkRepo.keywordSearch.mockResolvedValue([
      makeKeywordRow({ chunkId: 50, chunkIndex: 0, text: 'The Indian Constitution was adopted in 1950.' }),
    ]);
    const { results, belowThreshold } = await search({ query: 'Indian Constitution', teacherId: 1 });
    expect(belowThreshold).toBe(false);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunkId).toBe(50);
    expect(results[0].retrievalMethod).toBe('keyword');
    expect(results[0].similarity).toBeNull();
  });

  it('keyword-only chunk bypasses similarity threshold', async () => {
    // No vector results, but keyword results exist
    chunkRepo.keywordSearch.mockResolvedValue([
      makeKeywordRow({ chunkId: 77, chunkIndex: 0, text: 'Keyword match chunk text here yes.' }),
    ]);
    const { results } = await search({ query: 'keyword match', teacherId: 1 });
    // Should be included despite having null similarity (no minSimilarity applied)
    expect(results).toHaveLength(1);
    expect(results[0].retrievalMethod).toBe('keyword');
  });

  it('preserves metadata fields for keyword-only results', async () => {
    chunkRepo.keywordSearch.mockResolvedValue([
      makeKeywordRow({ chunkId: 42, sourceMeta: { page: 3, section: 'Test' }, topicId: 10 }),
    ]);
    const { results } = await search({ query: 'test', teacherId: 1 });
    const r = results[0];
    expect(r).toHaveProperty('chunkId', 42);
    expect(r).toHaveProperty('pageNumber', 3);
    expect(r).toHaveProperty('sectionHeading', 'Test');
    expect(r).toHaveProperty('topicId', 10);
    expect(r).toHaveProperty('content');
    expect(r).toHaveProperty('text');
    expect(r).toHaveProperty('documentTitle');
    expect(r).toHaveProperty('source');
    expect(r.source).toHaveProperty('documentId');
  });
});

// ── Vector-only candidate ─────────────────────────────────────────────────────

describe('Sprint 2 — vector-only candidates', () => {
  it('vector-only chunk is marked with retrievalMethod = vector', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([makeRow({ chunkId: 10, similarity: 0.80 })]);
    const { results } = await search({ query: 'test', teacherId: 1 });
    expect(results[0].retrievalMethod).toBe('vector');
    expect(results[0].similarity).toBe(0.80);
  });
});

// ── Hybrid candidate (both lists) ─────────────────────────────────────────────

describe('Sprint 2 — hybrid candidates (appears in both lists)', () => {
  it('chunk in both lists is marked as hybrid', async () => {
    const sharedChunkId = 999;
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: sharedChunkId, chunkIndex: 0, similarity: 0.75 }),
    ]);
    chunkRepo.keywordSearch.mockResolvedValue([
      makeKeywordRow({ chunkId: sharedChunkId, chunkIndex: 0, keywordRank: 0.20 }),
    ]);
    const { results } = await search({ query: 'shared concept', teacherId: 1 });
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.chunkId).toBe(sharedChunkId);
    expect(r.retrievalMethod).toBe('hybrid');
    // similarity from vector result is preserved
    expect(r.similarity).toBe(0.75);
  });

  it('hybrid chunk gets higher RRF score than vector-only or keyword-only at same rank', async () => {
    // Chunk 1: only in vector (rank 1), Chunk 2: only in keyword (rank 1)
    // Chunk 3: in both (rank 1 in each) → should score highest
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: 3, chunkIndex: 2, similarity: 0.70, text: 'Hybrid text abc' }),
      makeRow({ chunkId: 1, chunkIndex: 0, similarity: 0.85, text: 'Vector only text' }),
    ]);
    chunkRepo.keywordSearch.mockResolvedValue([
      makeKeywordRow({ chunkId: 3, chunkIndex: 2, keywordRank: 0.18, text: 'Hybrid text abc' }),
      makeKeywordRow({ chunkId: 2, chunkIndex: 1, keywordRank: 0.15, text: 'Keyword only text' }),
    ]);
    const { results } = await search({ query: 'hybrid', teacherId: 1 });
    const hybridChunk = results.find(r => r.chunkId === 3);
    expect(hybridChunk).toBeDefined();
    expect(hybridChunk.retrievalMethod).toBe('hybrid');
    // Chunk 3 appears in both lists so should have highest RRF score
    expect(results[0].chunkId).toBe(3);
  });
});

// ── Deduplication ─────────────────────────────────────────────────────────────

describe('Sprint 2 — deduplication', () => {
  it('chunk appearing in both vector and keyword results is deduplicated (only once in output)', async () => {
    const sharedChunk = 55;
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: sharedChunk, chunkIndex: 0, similarity: 0.88 }),
    ]);
    chunkRepo.keywordSearch.mockResolvedValue([
      makeKeywordRow({ chunkId: sharedChunk, chunkIndex: 0 }),
    ]);
    const { results } = await search({ query: 'test', teacherId: 1 });
    const occurrences = results.filter(r => r.chunkId === sharedChunk);
    expect(occurrences).toHaveLength(1);
  });

  it('does not produce duplicate chunkIds in results', async () => {
    const vectorRows = makeRows(5, 0.90);
    const keywordRows = [
      makeKeywordRow({ chunkId: 1, chunkIndex: 0 }), // duplicate of vector chunkId=1
      makeKeywordRow({ chunkId: 99, chunkIndex: 99, text: 'Unique keyword content here.' }),
    ];
    chunkRepo.similaritySearch.mockResolvedValue(vectorRows);
    chunkRepo.keywordSearch.mockResolvedValue(keywordRows);
    const { results } = await search({ query: 'test', teacherId: 1 });
    const ids = results.map(r => r.chunkId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ── Empty results cases ───────────────────────────────────────────────────────

describe('Sprint 2 — empty results cases', () => {
  it('both empty → belowThreshold=true, empty results', async () => {
    const { belowThreshold, results } = await search({ query: 'test', teacherId: 1 });
    expect(belowThreshold).toBe(true);
    expect(results).toHaveLength(0);
  });

  it('only vector results → works correctly', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([makeRow({ similarity: 0.75 })]);
    const { results } = await search({ query: 'test', teacherId: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].retrievalMethod).toBe('vector');
  });

  it('only keyword results → works correctly, belowThreshold=false', async () => {
    chunkRepo.keywordSearch.mockResolvedValue([makeKeywordRow({ chunkId: 200 })]);
    const { results, belowThreshold } = await search({ query: 'test', teacherId: 1 });
    expect(results).toHaveLength(1);
    expect(belowThreshold).toBe(false);
    expect(results[0].retrievalMethod).toBe('keyword');
  });

  it('vector results all below threshold but keyword results exist → belowThreshold=false', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([makeRow({ similarity: 0.10 })]);
    chunkRepo.keywordSearch.mockResolvedValue([makeKeywordRow({ chunkId: 300, chunkIndex: 99 })]);
    const { results, belowThreshold } = await search({ query: 'test', teacherId: 1 });
    expect(belowThreshold).toBe(false);
    expect(results.length).toBeGreaterThan(0);
  });
});

// ── Final K enforcement ───────────────────────────────────────────────────────

describe('Sprint 2 — final K enforcement', () => {
  it('combined results never exceed finalK (8)', async () => {
    // 10 vector + 10 keyword (non-overlapping)
    const vRows = makeRows(10, 0.90);
    const kRows = Array.from({ length: 10 }, (_, i) =>
      makeKeywordRow({ chunkId: 100 + i, chunkIndex: 100 + i, text: `Keyword text ${i} unique` })
    );
    chunkRepo.similaritySearch.mockResolvedValue(vRows);
    chunkRepo.keywordSearch.mockResolvedValue(kRows);
    const { results } = await search({ query: 'test', teacherId: 1 });
    expect(results.length).toBeLessThanOrEqual(8);
  });
});

// ── New return shape fields ───────────────────────────────────────────────────

describe('Sprint 2 — extended return shape', () => {
  it('returns vectorCandidateCount', async () => {
    chunkRepo.similaritySearch.mockResolvedValue(makeRows(7, 0.80));
    const { vectorCandidateCount } = await search({ query: 'test', teacherId: 1 });
    expect(vectorCandidateCount).toBe(7);
  });

  it('returns keywordCandidateCount', async () => {
    chunkRepo.keywordSearch.mockResolvedValue([
      makeKeywordRow({ chunkId: 200 }),
      makeKeywordRow({ chunkId: 201, chunkIndex: 1 }),
    ]);
    const { keywordCandidateCount } = await search({ query: 'test', teacherId: 1 });
    expect(keywordCandidateCount).toBe(2);
  });

  it('returns fusedCandidateCount (total unique after fusion)', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: 1, similarity: 0.80 }),
      makeRow({ chunkId: 2, chunkIndex: 1, similarity: 0.75 }),
    ]);
    chunkRepo.keywordSearch.mockResolvedValue([
      makeKeywordRow({ chunkId: 2, chunkIndex: 1 }), // duplicate
      makeKeywordRow({ chunkId: 3, chunkIndex: 2 }),
    ]);
    const { fusedCandidateCount } = await search({ query: 'test', teacherId: 1 });
    // unique: 1, 2, 3 → 3
    expect(fusedCandidateCount).toBe(3);
  });

  it('candidates field (backward compat) = vector row count', async () => {
    chunkRepo.similaritySearch.mockResolvedValue(makeRows(4, 0.80));
    chunkRepo.keywordSearch.mockResolvedValue([makeKeywordRow({ chunkId: 200 })]);
    const { candidates, vectorCandidateCount } = await search({ query: 'test', teacherId: 1 });
    expect(candidates).toBe(4);
    expect(vectorCandidateCount).toBe(4);
  });
});

// ── RRF ordering ─────────────────────────────────────────────────────────────

describe('Sprint 2 — RRF ordering', () => {
  it('chunk ranked first in both lists should appear first in fused results', async () => {
    // chunkId=1: rank 1 in both → highest RRF score
    // chunkId=2: rank 1 in vector only
    // chunkId=3: rank 1 in keyword only
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: 1, chunkIndex: 0, similarity: 0.90 }),
      makeRow({ chunkId: 2, chunkIndex: 1, similarity: 0.80 }),
    ]);
    chunkRepo.keywordSearch.mockResolvedValue([
      makeKeywordRow({ chunkId: 1, chunkIndex: 0, keywordRank: 0.30 }),
      makeKeywordRow({ chunkId: 3, chunkIndex: 2, keywordRank: 0.25 }),
    ]);
    const { results } = await search({ query: 'test', teacherId: 1 });
    expect(results[0].chunkId).toBe(1);
    expect(results[0].retrievalMethod).toBe('hybrid');
  });
});

// ── Security: keyword search respects isolation ───────────────────────────────

describe('Sprint 2 — security: keyword search isolation', () => {
  it('keyword search never called with different teacherId than vector search', async () => {
    await search({ query: 'test', teacherId: 5, filters: { topicId: 10 } });
    const vectorCall  = chunkRepo.similaritySearch.mock.calls[0];
    const keywordCall = chunkRepo.keywordSearch.mock.calls[0];
    // Same teacherId for both
    expect(vectorCall[0]).toBe(5);
    expect(keywordCall[0]).toBe(5);
    // Same topicId filter for both
    expect(vectorCall[3]).toEqual(expect.objectContaining({ topicId: 10 }));
    expect(keywordCall[3]).toEqual(expect.objectContaining({ topicId: 10 }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 2 PHASE 2 — CROSS-ENCODER RERANKING TESTS
// ─────────────────────────────────────────────────────────────────────────────

// ── Reranking disabled (default) ─────────────────────────────────────────────

describe('Sprint 2 Phase 2 — reranking disabled', () => {
  it('when getReranker returns null, results follow RRF ordering', async () => {
    getReranker.mockReturnValue(null);
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: 1, chunkIndex: 0, similarity: 0.80 }),
      makeRow({ chunkId: 2, chunkIndex: 1, similarity: 0.75 }),
    ]);
    const { results, rerankerUsed } = await search({ query: 'test', teacherId: 1 });
    expect(rerankerUsed).toBe(false);
    // Both results should be present
    expect(results.length).toBeGreaterThan(0);
  });

  it('rerankerUsed is false when reranker is null', async () => {
    getReranker.mockReturnValue(null);
    chunkRepo.similaritySearch.mockResolvedValue([makeRow({ similarity: 0.80 })]);
    const { rerankerUsed } = await search({ query: 'test', teacherId: 1 });
    expect(rerankerUsed).toBe(false);
  });

  it('rerankedCandidateCount is 0 when reranker is disabled', async () => {
    getReranker.mockReturnValue(null);
    chunkRepo.similaritySearch.mockResolvedValue([makeRow({ similarity: 0.80 })]);
    const { rerankedCandidateCount } = await search({ query: 'test', teacherId: 1 });
    expect(rerankedCandidateCount).toBe(0);
  });
});

// ── Reranking enabled ─────────────────────────────────────────────────────────

describe('Sprint 2 Phase 2 — reranking enabled', () => {
  let mockReranker;

  beforeEach(() => {
    // Provide a mock reranker that attaches rerankScore and reverses order
    mockReranker = {
      rerank: jest.fn().mockImplementation(async (query, candidates) =>
        [...candidates]
          .map((c, i) => ({ ...c, rerankScore: 1.0 - i * 0.1 }))
          .sort((a, b) => b.rerankScore - a.rerankScore)
      ),
    };
    getReranker.mockReturnValue(mockReranker);
  });

  it('calls reranker.rerank with query and fused candidates', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: 1, chunkIndex: 0, similarity: 0.80 }),
      makeRow({ chunkId: 2, chunkIndex: 1, similarity: 0.75 }),
    ]);
    await search({ query: 'photosynthesis', teacherId: 1 });
    expect(mockReranker.rerank).toHaveBeenCalledWith(
      'photosynthesis',
      expect.any(Array)
    );
  });

  it('rerankerUsed is true when reranker succeeds', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([makeRow({ similarity: 0.80 })]);
    const { rerankerUsed } = await search({ query: 'test', teacherId: 1 });
    expect(rerankerUsed).toBe(true);
  });

  it('rerankedCandidateCount reflects candidates sent to reranker', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: 1, chunkIndex: 0, similarity: 0.80 }),
      makeRow({ chunkId: 2, chunkIndex: 1, similarity: 0.75 }),
      makeRow({ chunkId: 3, chunkIndex: 2, similarity: 0.70 }),
    ]);
    const { rerankedCandidateCount } = await search({ query: 'test', teacherId: 1 });
    // All 3 are within candidateK=15
    expect(rerankedCandidateCount).toBe(3);
  });

  it('rerankScore is preserved on result chunks', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: 10, chunkIndex: 0, similarity: 0.80 }),
    ]);
    const { results } = await search({ query: 'test', teacherId: 1 });
    expect(results[0]).toHaveProperty('rerankScore');
    expect(typeof results[0].rerankScore).toBe('number');
  });

  it('original metadata is preserved after reranking', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: 42, chunkIndex: 0, similarity: 0.85, sourceMeta: { page: 5, section: 'Methods' } }),
    ]);
    const { results } = await search({ query: 'test', teacherId: 1 });
    const r = results[0];
    expect(r.chunkId).toBe(42);
    expect(r.similarity).toBe(0.85);
    expect(r.pageNumber).toBe(5);
    expect(r.sectionHeading).toBe('Methods');
    expect(r.retrievalMethod).toBe('vector');
    expect(r).toHaveProperty('rrfScore');
  });

  it('similarity and rrfScore are not overwritten by rerankScore', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: 1, chunkIndex: 0, similarity: 0.80 }),
    ]);
    const { results } = await search({ query: 'test', teacherId: 1 });
    // All three scores must coexist
    expect(typeof results[0].similarity).toBe('number');
    expect(typeof results[0].rrfScore).toBe('number');
    expect(typeof results[0].rerankScore).toBe('number');
    expect(results[0].similarity).not.toBe(results[0].rerankScore);
  });

  it('only top rerankerCandidateK (15) are sent to reranker', async () => {
    // Create 20 fused candidates (all vector-only for simplicity)
    chunkRepo.similaritySearch.mockResolvedValue(makeRows(20, 0.95));
    await search({ query: 'test', teacherId: 1 });
    // reranker should receive at most 15 candidates (config.rag.reranker.candidateK)
    const rerankCall = mockReranker.rerank.mock.calls[0];
    expect(rerankCall[1].length).toBeLessThanOrEqual(15);
  });

  it('existing quality gates still apply after reranking', async () => {
    // Set up: reranker puts a below-threshold chunk first
    mockReranker.rerank.mockImplementation(async (query, candidates) =>
      candidates.map((c, i) => ({
        ...c,
        rerankScore: i === 0 ? 0.99 : 0.50 - i * 0.01,  // first chunk gets top rerank score
      })).sort((a, b) => b.rerankScore - a.rerankScore)
    );
    // First chunk has low similarity (below 0.30 threshold)
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: 1, chunkIndex: 0, similarity: 0.10 }), // below threshold
      makeRow({ chunkId: 2, chunkIndex: 1, similarity: 0.80 }),
    ]);
    const { results } = await search({ query: 'test', teacherId: 1 });
    // Chunk 1 must not appear despite having high rerankScore (similarity gate applies)
    const chunk1 = results.find(r => r.chunkId === 1);
    expect(chunk1).toBeUndefined();
    // Chunk 2 should appear
    const chunk2 = results.find(r => r.chunkId === 2);
    expect(chunk2).toBeDefined();
  });

  it('diversity filter still applies after reranking — near-duplicate rejection works', async () => {
    // Create 3 chunks with near-identical content (same 120-char prefix) from the same doc.
    // The diversity filter should reject duplicates.
    const IDENTICAL_TEXT = 'A'.repeat(130); // long enough for near-duplicate detection (>= 40 chars)
    const rows = [
      makeRow({ chunkId: 1, docId: 99, chunkIndex: 0, similarity: 0.90, text: IDENTICAL_TEXT }),
      makeRow({ chunkId: 2, docId: 99, chunkIndex: 1, similarity: 0.88, text: IDENTICAL_TEXT }),  // duplicate prefix
      makeRow({ chunkId: 3, docId: 99, chunkIndex: 2, similarity: 0.86, text: IDENTICAL_TEXT }),  // duplicate prefix
    ];
    chunkRepo.similaritySearch.mockResolvedValue(rows);
    const { results } = await search({ query: 'test', teacherId: 1 });
    // Only 1 should survive (near-duplicate rejection)
    const fromDoc99 = results.filter(r => r.documentId === 99);
    expect(fromDoc99.length).toBe(1);
  });

  it('final K cap still applies after reranking', async () => {
    // 10 vector + 10 keyword unique chunks
    const vRows = makeRows(10, 0.90);
    const kRows = Array.from({ length: 10 }, (_, i) =>
      makeKeywordRow({ chunkId: 100 + i, chunkIndex: 100 + i, text: `Keyword text ${i} unique content` })
    );
    chunkRepo.similaritySearch.mockResolvedValue(vRows);
    chunkRepo.keywordSearch.mockResolvedValue(kRows);
    const { results } = await search({ query: 'test', teacherId: 1 });
    expect(results.length).toBeLessThanOrEqual(8);
  });
});

// ── Reranker failure fallback ─────────────────────────────────────────────────

describe('Sprint 2 Phase 2 — reranker failure fallback', () => {
  it('falls back to RRF ordering when reranker throws', async () => {
    const failingReranker = {
      rerank: jest.fn().mockRejectedValue(new Error('Model load failure')),
    };
    getReranker.mockReturnValue(failingReranker);
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: 1, chunkIndex: 0, similarity: 0.80 }),
      makeRow({ chunkId: 2, chunkIndex: 1, similarity: 0.75 }),
    ]);
    // Should NOT throw — graceful fallback
    const { results, rerankerUsed } = await search({ query: 'test', teacherId: 1 });
    expect(results.length).toBeGreaterThan(0);
    expect(rerankerUsed).toBe(false);
  });

  it('logs error when reranker fails', async () => {
    const logger = require('../../../src/utils/logger.util');
    const failingReranker = {
      rerank: jest.fn().mockRejectedValue(new Error('Inference failed')),
    };
    getReranker.mockReturnValue(failingReranker);
    chunkRepo.similaritySearch.mockResolvedValue([makeRow({ similarity: 0.80 })]);
    await search({ query: 'test', teacherId: 1 });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('[Reranker]'),
      expect.objectContaining({ error: 'Inference failed' })
    );
  });

  it('fallback result count matches what hybrid would have returned', async () => {
    const failingReranker = {
      rerank: jest.fn().mockRejectedValue(new Error('Worker dead')),
    };
    getReranker.mockReturnValue(failingReranker);
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: 1, chunkIndex: 0, similarity: 0.85 }),
      makeRow({ chunkId: 2, chunkIndex: 1, similarity: 0.80 }),
    ]);
    const { results } = await search({ query: 'test', teacherId: 1 });
    expect(results).toHaveLength(2);
  });

  it('rerankerUsed remains false in the return value on failure', async () => {
    const failingReranker = {
      rerank: jest.fn().mockRejectedValue(new Error('timeout')),
    };
    getReranker.mockReturnValue(failingReranker);
    chunkRepo.similaritySearch.mockResolvedValue([makeRow({ similarity: 0.80 })]);
    const { rerankerUsed } = await search({ query: 'test', teacherId: 1 });
    expect(rerankerUsed).toBe(false);
  });
});

// ── Empty candidates with reranker enabled ────────────────────────────────────

describe('Sprint 2 Phase 2 — empty candidates with reranker', () => {
  it('does not call reranker when fused candidates are empty', async () => {
    const mockReranker = { rerank: jest.fn() };
    getReranker.mockReturnValue(mockReranker);
    // Both retrieval methods return nothing
    const { results, rerankerUsed } = await search({ query: 'test', teacherId: 1 });
    expect(mockReranker.rerank).not.toHaveBeenCalled();
    expect(rerankerUsed).toBe(false);
    expect(results).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 2 PHASE 2 — POST-RERANK DIVERSITY GATE REGRESSION TESTS
//
// These tests specifically cover the scenario where reranking changes the
// candidate ordering so that one document would dominate the final results,
// and verify that the diversity constraint is enforced on the FINAL output.
// ─────────────────────────────────────────────────────────────────────────────

describe('Sprint 2 Phase 2 — post-rerank diversity: reranker reorders to dominate', () => {
  // Helper: create rows all from the same document with distinct consecutive indices
  function makeDominatingRows(n, docId = 42) {
    return Array.from({ length: n }, (_, i) =>
      makeRow({
        chunkId:    docId * 100 + i,
        docId,
        chunkIndex: i,
        similarity: 0.90 - i * 0.01,
        text:       `Unique dominating text chunk ${i} from document ${docId} ${'z'.repeat(40)}`,
      })
    );
  }

  let dominatingReranker;

  beforeEach(() => {
    // Reranker reverses the input order so highest-indexed chunks score highest.
    // This simulates a reranker promoting many chunks from one document.
    dominatingReranker = {
      rerank: jest.fn().mockImplementation(async (_query, candidates) =>
        [...candidates]
          .reverse()
          .map((c, i) => ({ ...c, rerankScore: 1.0 - i * 0.05 }))
      ),
    };
    getReranker.mockReturnValue(dominatingReranker);
  });

  it('final output has max 3 consecutive chunks from any one document', async () => {
    // 7 consecutive chunks from doc 42 + 2 from doc 99 (non-consecutive indices)
    const doc42Rows = makeDominatingRows(7, 42);
    const doc99Rows = [
      makeRow({ chunkId: 9901, docId: 99, chunkIndex: 10, similarity: 0.80, text: 'Other doc chunk A here now ' + 'a'.repeat(40) }),
      makeRow({ chunkId: 9902, docId: 99, chunkIndex: 20, similarity: 0.79, text: 'Other doc chunk B here now ' + 'b'.repeat(40) }),
    ];
    chunkRepo.similaritySearch.mockResolvedValue([...doc42Rows, ...doc99Rows]);

    const { results } = await search({ query: 'test', teacherId: 1 });

    // Collect chunk indices per document in the final output
    const docIndices = new Map();
    for (const r of results) {
      if (!docIndices.has(r.documentId)) docIndices.set(r.documentId, []);
      docIndices.get(r.documentId).push(r.chunkIndex);
    }

    for (const [, indices] of docIndices) {
      indices.sort((a, b) => a - b);
      let maxConsecutive = 1;
      let run = 1;
      for (let i = 1; i < indices.length; i++) {
        run = indices[i] === indices[i - 1] + 1 ? run + 1 : 1;
        if (run > maxConsecutive) maxConsecutive = run;
      }
      expect(maxConsecutive).toBeLessThanOrEqual(3);
    }
  });

  it('rerankScore is present on all returned chunks', async () => {
    const doc42Rows = makeDominatingRows(5, 42);
    chunkRepo.similaritySearch.mockResolvedValue(doc42Rows);

    const { results } = await search({ query: 'test', teacherId: 1 });
    expect(results.length).toBeGreaterThan(0);
    results.forEach(r => {
      expect(r).toHaveProperty('rerankScore');
      expect(typeof r.rerankScore).toBe('number');
    });
  });

  it('results remain sorted descending by rerankScore as much as diversity allows', async () => {
    // 4 chunks from doc 42 (consecutive indices 0-3), 4 from doc 55 (non-consecutive)
    const doc42Rows = makeDominatingRows(4, 42);
    const doc55Rows = [
      makeRow({ chunkId: 5501, docId: 55, chunkIndex: 0, similarity: 0.70, text: 'Doc 55 chunk X unique ' + 'x'.repeat(40) }),
      makeRow({ chunkId: 5502, docId: 55, chunkIndex: 5, similarity: 0.68, text: 'Doc 55 chunk Y unique ' + 'y'.repeat(40) }),
      makeRow({ chunkId: 5503, docId: 55, chunkIndex: 10, similarity: 0.66, text: 'Doc 55 chunk Z unique ' + 'z'.repeat(40) }),
      makeRow({ chunkId: 5504, docId: 55, chunkIndex: 15, similarity: 0.64, text: 'Doc 55 chunk W unique ' + 'w'.repeat(40) }),
    ];
    chunkRepo.similaritySearch.mockResolvedValue([...doc42Rows, ...doc55Rows]);

    const { results } = await search({ query: 'test', teacherId: 1 });

    // Verify finalK is respected
    expect(results.length).toBeLessThanOrEqual(8);

    // Verify rerankScore is non-increasing (ties allowed due to diversity skips)
    for (let i = 1; i < results.length; i++) {
      if (results[i].rerankScore != null && results[i - 1].rerankScore != null) {
        expect(results[i].rerankScore).toBeLessThanOrEqual(results[i - 1].rerankScore + 1e-9);
      }
    }
  });

  it('finalK is still respected when diversity skips candidates', async () => {
    // 10 consecutive chunks from one document — diversity will admit at most 3
    const doc42Rows = makeDominatingRows(10, 42);
    chunkRepo.similaritySearch.mockResolvedValue(doc42Rows);

    const { results } = await search({ query: 'test', teacherId: 1 });
    expect(results.length).toBeLessThanOrEqual(8);
  });

  it('empty candidate set with reranker enabled returns empty results', async () => {
    const { results, rerankerUsed } = await search({ query: 'test', teacherId: 1 });
    expect(results).toHaveLength(0);
    expect(rerankerUsed).toBe(false);
  });

  it('single candidate from one document always passes diversity', async () => {
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: 1, docId: 77, chunkIndex: 0, similarity: 0.85, text: 'Single chunk text ' + 'a'.repeat(40) }),
    ]);
    const { results } = await search({ query: 'test', teacherId: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe(1);
  });
});

// ── Sprint 1 diversity tests still pass with new algorithm ───────────────────

describe('Sprint 1 regression — _applyDiversity semantics preserved', () => {
  it('near-duplicate rejection still works after algorithm change', async () => {
    const repeatedText = 'q'.repeat(200);
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: 1, chunkIndex: 0, text: repeatedText, similarity: 0.90 }),
      makeRow({ chunkId: 2, chunkIndex: 5, text: repeatedText, similarity: 0.88 }),
      makeRow({ chunkId: 3, chunkIndex: 10, text: repeatedText, similarity: 0.86 }),
    ]);
    getReranker.mockReturnValue(null);
    const { results } = await search({ query: 'test', teacherId: 1 });
    expect(results.length).toBe(1);
    expect(results[0].chunkId).toBe(1);
  });

  it('non-consecutive chunks from the same document are all allowed', async () => {
    // Indices 0, 10, 20 — gaps > 1, so no consecutive run of >1
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: 1, docId: 10, chunkIndex: 0,  similarity: 0.90, text: 'Text chunk A ' + 'a'.repeat(40) }),
      makeRow({ chunkId: 2, docId: 10, chunkIndex: 10, similarity: 0.88, text: 'Text chunk B ' + 'b'.repeat(40) }),
      makeRow({ chunkId: 3, docId: 10, chunkIndex: 20, similarity: 0.86, text: 'Text chunk C ' + 'c'.repeat(40) }),
    ]);
    getReranker.mockReturnValue(null);
    const { results } = await search({ query: 'test', teacherId: 1 });
    // All 3 should pass — no consecutive run
    expect(results.length).toBe(3);
  });

  it('exactly MAX_CONSECUTIVE_FROM_SAME_DOC consecutive chunks are allowed', async () => {
    // Indices 0,1,2 → run of 3 → exactly at limit → all allowed
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: 1, docId: 10, chunkIndex: 0, similarity: 0.90, text: 'Text A ' + 'a'.repeat(40) }),
      makeRow({ chunkId: 2, docId: 10, chunkIndex: 1, similarity: 0.88, text: 'Text B ' + 'b'.repeat(40) }),
      makeRow({ chunkId: 3, docId: 10, chunkIndex: 2, similarity: 0.86, text: 'Text C ' + 'c'.repeat(40) }),
    ]);
    getReranker.mockReturnValue(null);
    const { results } = await search({ query: 'test', teacherId: 1 });
    expect(results.length).toBe(3);
  });

  it('4th consecutive chunk from the same document is skipped', async () => {
    // Indices 0,1,2,3 → adding 3 would create a run of 4 → must skip
    chunkRepo.similaritySearch.mockResolvedValue([
      makeRow({ chunkId: 1, docId: 10, chunkIndex: 0, similarity: 0.90, text: 'Text A ' + 'a'.repeat(40) }),
      makeRow({ chunkId: 2, docId: 10, chunkIndex: 1, similarity: 0.88, text: 'Text B ' + 'b'.repeat(40) }),
      makeRow({ chunkId: 3, docId: 10, chunkIndex: 2, similarity: 0.86, text: 'Text C ' + 'c'.repeat(40) }),
      makeRow({ chunkId: 4, docId: 10, chunkIndex: 3, similarity: 0.84, text: 'Text D ' + 'd'.repeat(40) }),
    ]);
    getReranker.mockReturnValue(null);
    const { results } = await search({ query: 'test', teacherId: 1 });
    const fromDoc10 = results.filter(r => r.documentId === 10);
    expect(fromDoc10.length).toBe(3); // chunk 4 (index 3) is skipped
  });
});
