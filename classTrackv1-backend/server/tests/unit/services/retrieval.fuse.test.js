/**
 * server/tests/unit/services/retrieval.fuse.test.js
 *
 * Unit tests for the RRF fusion module (retrieval.fuse.js).
 * Tests the fuseCandidates() function in complete isolation.
 *
 * Tests:
 *   - Basic RRF score computation
 *   - Correct ordering by RRF score
 *   - Chunks in both lists (hybrid) vs. one list only
 *   - Deduplication
 *   - Empty inputs
 *   - rrfK parameter effect
 *   - retrievalMethod tagging
 *   - similarity field preservation
 */

const { fuseCandidates } = require('../../../src/services/knowledge/retrieval.fuse');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVectorChunk(chunkId, similarity = 0.80) {
  return {
    chunkId,
    documentId: 10,
    topicId: 5,
    similarity,
    content: `Vector chunk ${chunkId}`,
    text: `Vector chunk ${chunkId}`,
    chunkIndex: chunkId,
    pageNumber: 1,
    sectionHeading: null,
    documentTitle: 'Test Doc',
    retrievalMethod: 'vector',
    source: { documentId: 10, topic: { id: 5, name: 'Test' } },
  };
}

function makeKeywordChunk(chunkId, keywordRank = 0.15) {
  return {
    chunkId,
    documentId: 10,
    topicId: 5,
    similarity: null,
    keywordRank,
    content: `Keyword chunk ${chunkId}`,
    text: `Keyword chunk ${chunkId}`,
    chunkIndex: chunkId,
    pageNumber: 2,
    sectionHeading: null,
    documentTitle: 'Test Doc',
    retrievalMethod: 'keyword',
    source: { documentId: 10, topic: { id: 5, name: 'Test' } },
  };
}

// ── Empty inputs ──────────────────────────────────────────────────────────────

describe('fuseCandidates — empty inputs', () => {
  it('returns empty array when both lists are empty', () => {
    const result = fuseCandidates({ vectorResults: [], keywordResults: [] });
    expect(result).toHaveLength(0);
  });

  it('returns vector-only results when keyword list is empty', () => {
    const vChunks = [makeVectorChunk(1), makeVectorChunk(2)];
    const result = fuseCandidates({ vectorResults: vChunks, keywordResults: [] });
    expect(result).toHaveLength(2);
    result.forEach(r => expect(r.retrievalMethod).toBe('vector'));
  });

  it('returns keyword-only results when vector list is empty', () => {
    const kChunks = [makeKeywordChunk(1), makeKeywordChunk(2)];
    const result = fuseCandidates({ vectorResults: [], keywordResults: kChunks });
    expect(result).toHaveLength(2);
    result.forEach(r => expect(r.retrievalMethod).toBe('keyword'));
  });
});

// ── Deduplication ─────────────────────────────────────────────────────────────

describe('fuseCandidates — deduplication', () => {
  it('chunk appearing in both lists appears only once in output', () => {
    const vChunks = [makeVectorChunk(10, 0.85)];
    const kChunks = [makeKeywordChunk(10, 0.20)];  // same chunkId=10
    const result = fuseCandidates({ vectorResults: vChunks, keywordResults: kChunks });
    expect(result).toHaveLength(1);
    expect(result[0].chunkId).toBe(10);
  });

  it('unique chunks from both lists are all included', () => {
    const vChunks = [makeVectorChunk(1), makeVectorChunk(2)];
    const kChunks = [makeKeywordChunk(3), makeKeywordChunk(4)];
    const result = fuseCandidates({ vectorResults: vChunks, keywordResults: kChunks });
    expect(result).toHaveLength(4);
    const ids = result.map(r => r.chunkId).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3, 4]);
  });

  it('partial overlap: 2 shared + 1 unique each → 4 total', () => {
    const vChunks = [makeVectorChunk(1), makeVectorChunk(2), makeVectorChunk(3)];
    const kChunks = [makeKeywordChunk(2), makeKeywordChunk(3), makeKeywordChunk(4)];
    const result = fuseCandidates({ vectorResults: vChunks, keywordResults: kChunks });
    expect(result).toHaveLength(4);
  });
});

// ── retrievalMethod tagging ───────────────────────────────────────────────────

describe('fuseCandidates — retrievalMethod', () => {
  it('marks chunk only in vector list as "vector"', () => {
    const result = fuseCandidates({
      vectorResults:  [makeVectorChunk(1)],
      keywordResults: [],
    });
    expect(result[0].retrievalMethod).toBe('vector');
  });

  it('marks chunk only in keyword list as "keyword"', () => {
    const result = fuseCandidates({
      vectorResults:  [],
      keywordResults: [makeKeywordChunk(1)],
    });
    expect(result[0].retrievalMethod).toBe('keyword');
  });

  it('marks chunk in both lists as "hybrid"', () => {
    const result = fuseCandidates({
      vectorResults:  [makeVectorChunk(5, 0.90)],
      keywordResults: [makeKeywordChunk(5, 0.25)],
    });
    expect(result[0].retrievalMethod).toBe('hybrid');
  });
});

// ── similarity preservation ───────────────────────────────────────────────────

describe('fuseCandidates — similarity field', () => {
  it('preserves similarity from vector chunk', () => {
    const result = fuseCandidates({
      vectorResults:  [makeVectorChunk(1, 0.92)],
      keywordResults: [],
    });
    expect(result[0].similarity).toBe(0.92);
  });

  it('similarity is null for keyword-only chunks', () => {
    const result = fuseCandidates({
      vectorResults:  [],
      keywordResults: [makeKeywordChunk(1)],
    });
    expect(result[0].similarity).toBeNull();
  });

  it('hybrid chunk preserves similarity from vector result', () => {
    const result = fuseCandidates({
      vectorResults:  [makeVectorChunk(7, 0.88)],
      keywordResults: [makeKeywordChunk(7, 0.12)],
    });
    expect(result[0].similarity).toBe(0.88);
  });
});

// ── RRF ordering ─────────────────────────────────────────────────────────────

describe('fuseCandidates — RRF ordering', () => {
  it('chunk ranked #1 in both lists outscores chunk ranked #1 in one list', () => {
    // rrfK = 60
    // chunkId=1: in vector rank=1, keyword rank=1
    //   score = 1/(60+1) + 1/(60+1) = 2/61 ≈ 0.0328
    // chunkId=2: in vector rank=1, NOT in keyword (penalty = 2)
    //   score = 1/(60+1) + 1/(60+2) = 1/61 + 1/62 ≈ 0.0164 + 0.0161 ≈ 0.0325
    // chunkId=1 should come first
    const vChunks = [makeVectorChunk(1), makeVectorChunk(2)];
    const kChunks = [makeKeywordChunk(1), makeKeywordChunk(3)]; // chunk 1 in both, chunk 2 only in vector
    const result = fuseCandidates({ vectorResults: vChunks, keywordResults: kChunks, rrfK: 60 });
    expect(result[0].chunkId).toBe(1);
    expect(result[0].retrievalMethod).toBe('hybrid');
  });

  it('results are sorted descending by rrfScore', () => {
    // Use an asymmetric arrangement so we can deterministically verify order
    // chunkId=1: in BOTH lists at rank 1 → score = 1/(60+1) + 1/(60+1) = 2/61 ≈ 0.03279
    // chunkId=2: in vector only at rank 2 → score = 1/(60+2) + 1/(60+2) [penalty] = 2/62 ≈ 0.03226
    // chunkId=3: in keyword only at rank 1 → score = 1/(60+2)[penalty] + 1/(60+1) = 1/62 + 1/61 ≈ 0.02782
    const vChunks = [makeVectorChunk(1), makeVectorChunk(2)]; // chunk 1 rank1, chunk 2 rank2
    const kChunks = [makeKeywordChunk(1), makeKeywordChunk(3)]; // chunk 1 rank1, chunk 3 rank2
    const result = fuseCandidates({ vectorResults: vChunks, keywordResults: kChunks, rrfK: 60 });
    const scores = result.map(r => r.rrfScore);
    // Verify sorted descending
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]);
    }
    // chunk 1 is in both lists at rank 1 → highest RRF score → should be first
    expect(result[0].chunkId).toBe(1);
  });

  it('each result has an rrfScore field', () => {
    const result = fuseCandidates({
      vectorResults:  [makeVectorChunk(1)],
      keywordResults: [makeKeywordChunk(2)],
    });
    result.forEach(r => expect(typeof r.rrfScore).toBe('number'));
  });
});

// ── rrfK parameter ────────────────────────────────────────────────────────────

describe('fuseCandidates — rrfK parameter', () => {
  it('uses default rrfK=60 when not specified', () => {
    const result = fuseCandidates({
      vectorResults:  [makeVectorChunk(1, 0.9)],
      keywordResults: [],
    });
    // 1 vector result, 0 keyword results.
    // vectorPenaltyRank = 1+1=2, but chunk IS in vector at rank 1.
    // keywordPenaltyRank = 0+1=1 (keyword list is empty, so penalty rank = 1)
    // score = 1/(60+1) + 1/(60+1) = 2/61
    const expectedScore = 1 / (60 + 1) + 1 / (60 + 1);
    expect(result[0].rrfScore).toBeCloseTo(expectedScore, 5);
  });

  it('accepts custom rrfK value', () => {
    const result = fuseCandidates({
      vectorResults:  [makeVectorChunk(1, 0.9)],
      keywordResults: [],
      rrfK: 10,
    });
    // 1 vector result, 0 keyword results.
    // keywordPenaltyRank = 0+1=1
    // score = 1/(10+1) + 1/(10+1) = 2/11
    const expectedScore = 1 / (10 + 1) + 1 / (10 + 1);
    expect(result[0].rrfScore).toBeCloseTo(expectedScore, 5);
  });
});

// ── Malformed / edge input ────────────────────────────────────────────────────

describe('fuseCandidates — edge cases', () => {
  it('handles single-item lists', () => {
    const result = fuseCandidates({
      vectorResults:  [makeVectorChunk(1)],
      keywordResults: [makeKeywordChunk(2)],
    });
    expect(result).toHaveLength(2);
  });

  it('all chunks overlap between lists — all marked hybrid', () => {
    const vChunks = [makeVectorChunk(1), makeVectorChunk(2), makeVectorChunk(3)];
    const kChunks = [makeKeywordChunk(1), makeKeywordChunk(2), makeKeywordChunk(3)];
    const result = fuseCandidates({ vectorResults: vChunks, keywordResults: kChunks });
    expect(result).toHaveLength(3);
    result.forEach(r => expect(r.retrievalMethod).toBe('hybrid'));
  });
});
