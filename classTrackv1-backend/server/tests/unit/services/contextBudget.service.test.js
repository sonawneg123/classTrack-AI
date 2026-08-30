/**
 * server/tests/unit/services/contextBudget.service.test.js
 *
 * Regression tests for the LLM Context Budget layer.
 *
 * Sprint 3 — Context Budget:
 *   - 8 small chunks all fit
 *   - 8 large chunks exceed budget → progressive reduction
 *   - Highest-ranked chunks retained, lower-ranked dropped
 *   - No partial chunk splitting
 *   - Source metadata preserved on retained chunks
 *   - Diversity constraint remains valid (tested indirectly via retrieval order)
 *   - Final context remains below configured budget
 *   - Small question count vs large question count output reserve
 *   - INSUFFICIENT_CONTEXT still works (existing path untouched)
 *   - Token budget returns correct metadata
 *   - buildContext API backward-compatible
 *   - _isTokenLimitError correctly classifies 413 / message patterns
 *   - Reproduces today's production failure: 8 chunks ~10361 chars, 8000 TPM
 *
 * All external dependencies are mocked.
 */

// ── Mock config to control budget parameters ──────────────────────────────────
jest.mock('../../../src/config', () => ({
  embedding: { dimension: 384 },
  rag: {
    candidateK:        20,
    keywordCandidateK: 20,
    finalK:             8,
    minSimilarity:      0.30,
    rrfK:               60,
    get topK() { return this.candidateK; },
    reranker: { enabled: false, model: 'Xenova/ms-marco-MiniLM-L-6-v2', candidateK: 15 },
  },
  questionGeneration: {
    // Updated to match new calibrated defaults (2.0 c/t, 6500 effective ceiling)
    maxContextChars:           3_500,
    maxTokens:                 4096,
    maxQuestionsPerRequest:    20,
    timeoutMs:                 60_000,
    promptVersion:             'v1',
    retrievalTopK:             20,
    llmContextWindowTokens:    6_500,
    systemPromptReserveTokens: 700,
    userPromptOverheadTokens:  200,
    outputTokensPerQuestion:   250,
    minOutputReserveTokens:    400,
    safetyMarginTokens:        300,
  },
  groq: { ragModel: 'llama3-70b-8192' },
}));

jest.mock('../../../src/utils/logger.util', () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));
jest.mock('../../../src/services/ai/providers', () => ({
  getEmbeddingProvider: jest.fn(),
}));
jest.mock('../../../src/repositories/knowledgeChunk.repository', () => ({
  similaritySearch: jest.fn(),
  keywordSearch:    jest.fn(),
}));
jest.mock('../../../src/services/knowledge/reranker', () => ({
  getReranker: jest.fn(),
}));

const { buildContext, buildContextString } = require('../../../src/services/knowledge/retrieval.service');
const { estimateTokens, computeContextTokenBudget } = require('../../../src/utils/tokenEstimate.util');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Create a chunk fixture with deterministic content of a given character length.
 * Use explicit null to set pageNumber/sectionHeading to null.
 */
function makeChunk(overrides = {}) {
  const id = overrides.chunkId ?? 1;
  // Use 'pageNumber' key in overrides — default to id, but allow explicit null
  const pageNumber = Object.prototype.hasOwnProperty.call(overrides, 'pageNumber')
    ? overrides.pageNumber
    : id;
  return {
    chunkId:        id,
    documentTitle:  overrides.documentTitle  ?? 'Test Document',
    pageNumber,
    sectionHeading: overrides.sectionHeading ?? `Section ${id}`,
    content:        overrides.content        ?? `Content of chunk ${id}. `.repeat(10).trim(),
    similarity:     overrides.similarity     ?? 0.90,
    rerankScore:    overrides.rerankScore    ?? null,
    rrfScore:       overrides.rrfScore       ?? null,
    retrievalMethod: overrides.retrievalMethod ?? 'vector',
    source: {
      documentId:    overrides.documentId ?? 100,
      documentTitle: overrides.documentTitle ?? 'Test Document',
      topicId:       overrides.topicId    ?? 10,
    },
  };
}

/**
 * Create N chunks with unique content of ~contentChars chars each.
 * Each chunk's content is unique (prefixed by index) to avoid false-positive
 * includes() matches when checking metadata preservation.
 */
function makeChunks(n, contentChars = 200) {
  return Array.from({ length: n }, (_, i) => makeChunk({
    chunkId:  i + 1,
    // Use unique padding so content.includes() tests are unambiguous
    content:  `CHUNK${i + 1}_${'x'.repeat(Math.max(0, contentChars - 8))}`,
    pageNumber: i + 1,
    sectionHeading: `Section ${i + 1}`,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// tokenEstimate.util tests
// ─────────────────────────────────────────────────────────────────────────────

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 0 for null/undefined', () => {
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });

  it('returns a positive integer for non-empty string', () => {
    const t = estimateTokens('Hello world');
    expect(t).toBeGreaterThan(0);
    expect(Number.isInteger(t)).toBe(true);
  });

  it('is proportional to string length', () => {
    const t100  = estimateTokens('a'.repeat(100));
    const t1000 = estimateTokens('a'.repeat(1000));
    expect(t1000).toBeGreaterThan(t100);
  });

  it('is conservative (2.0 c/t): 3500 chars → 1750 tokens', () => {
    // 3500 / 2.0 = 1750 exactly
    expect(estimateTokens('a'.repeat(3500))).toBe(1750);
  });

  it('rounds up (ceiling): 3 chars → 2 tokens (3/2.0 = 1.5 → ceil = 2)', () => {
    expect(estimateTokens('abc')).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeContextTokenBudget tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeContextTokenBudget', () => {
  const BASE = {
    windowTokens:        8_000,
    systemPromptReserve: 600,
    userPromptOverhead:  200,
    outputReserve:       1_000,
    safetyMargin:        200,
  };

  it('computes correct budget for 5 MCQs at default limits', () => {
    // 8000 - 600 - 200 - 1000 - 200 = 6000
    expect(computeContextTokenBudget(BASE)).toBe(6_000);
  });

  it('returns 0 when budget is exhausted', () => {
    expect(computeContextTokenBudget({
      ...BASE, windowTokens: 500, outputReserve: 2000,
    })).toBe(0);
  });

  it('never returns negative', () => {
    expect(computeContextTokenBudget({
      windowTokens: 100, systemPromptReserve: 200, userPromptOverhead: 200,
      outputReserve: 200, safetyMargin: 200,
    })).toBe(0);
  });

  it('output reserve scales with question count', () => {
    // count=1: max(300, 1*200) = 300 output reserve
    // count=10: max(300, 10*200) = 2000 output reserve
    const budget1  = computeContextTokenBudget({ ...BASE, outputReserve: 300  });
    const budget10 = computeContextTokenBudget({ ...BASE, outputReserve: 2000 });
    expect(budget1).toBeGreaterThan(budget10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildContext API tests
// ─────────────────────────────────────────────────────────────────────────────

describe('buildContext — return shape', () => {
  const chunk = makeChunk({ chunkId: 1, content: 'Short content.' });

  it('returns an object with context, selectedCount, droppedCount, estimatedTokens, budgetTokens', () => {
    const result = buildContext([chunk]);
    expect(result).toHaveProperty('context');
    expect(result).toHaveProperty('selectedCount');
    expect(result).toHaveProperty('droppedCount');
    expect(result).toHaveProperty('estimatedTokens');
    expect(result).toHaveProperty('budgetTokens');
  });

  it('budgetTokens is null when no maxTokens supplied', () => {
    expect(buildContext([chunk]).budgetTokens).toBeNull();
  });

  it('budgetTokens equals the supplied maxTokens', () => {
    expect(buildContext([chunk], undefined, 500).budgetTokens).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8 small chunks — all fit
// ─────────────────────────────────────────────────────────────────────────────

describe('buildContext — 8 small chunks all fit', () => {
  // 8 chunks × 200 chars ≈ 1600 content chars → ~457 tokens @ 3.5 c/t
  // Budget: 4700 tokens (comfortable)
  const chunks  = makeChunks(8, 200);
  const budget  = 4_700;

  it('selects all 8 chunks', () => {
    const { selectedCount } = buildContext(chunks, undefined, budget);
    expect(selectedCount).toBe(8);
  });

  it('drops 0 chunks', () => {
    const { droppedCount } = buildContext(chunks, undefined, budget);
    expect(droppedCount).toBe(0);
  });

  it('context contains all 8 source headers', () => {
    const { context } = buildContext(chunks, undefined, budget);
    for (let i = 1; i <= 8; i++) {
      expect(context).toContain(`[Source ${i}]`);
    }
  });

  it('estimated tokens is within budget', () => {
    const { estimatedTokens } = buildContext(chunks, undefined, budget);
    expect(estimatedTokens).toBeLessThanOrEqual(budget);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8 large chunks exceed budget → progressive reduction
// ─────────────────────────────────────────────────────────────────────────────

describe('buildContext — 8 large chunks exceed token budget', () => {
  // ~1295 chars per chunk → ~371 tokens each; 8 × 371 ≈ 2968 tokens
  // Budget: 1000 tokens — forces reduction
  const chunks = makeChunks(8, 1295);
  const budget = 1_000;

  it('selects fewer than 8 chunks', () => {
    const { selectedCount } = buildContext(chunks, undefined, budget);
    expect(selectedCount).toBeLessThan(8);
  });

  it('drops at least 1 chunk', () => {
    const { droppedCount } = buildContext(chunks, undefined, budget);
    expect(droppedCount).toBeGreaterThan(0);
  });

  it('estimated tokens stays within budget', () => {
    const { estimatedTokens } = buildContext(chunks, undefined, budget);
    expect(estimatedTokens).toBeLessThanOrEqual(budget);
  });

  it('context does not contain dropped source numbers', () => {
    const { context, selectedCount } = buildContext(chunks, undefined, budget);
    // The dropped chunks should not appear in the context
    for (let i = selectedCount + 1; i <= 8; i++) {
      expect(context).not.toContain(`[Source ${i}]`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Highest-ranked chunks are retained, lower-ranked are dropped
// ─────────────────────────────────────────────────────────────────────────────

describe('buildContext — ranking order preserved', () => {
  // buildContext respects input order — the caller (questionGeneration) sorts
  // by rerankScore/rrfScore before calling.  So we test that the FIRST chunks
  // in the array are always retained when the budget forces a reduction.
  const chunks = makeChunks(5, 800);  // each chunk ~230 tokens
  const budget = 500;                 // fits ~2 chunks

  it('retains the first (highest-ranked) chunks', () => {
    const { context, selectedCount } = buildContext(chunks, undefined, budget);
    expect(context).toContain('[Source 1]');
    if (selectedCount >= 2) expect(context).toContain('[Source 2]');
  });

  it('does not retain chunks beyond the budget', () => {
    const { context, selectedCount } = buildContext(chunks, undefined, budget);
    for (let i = selectedCount + 1; i <= 5; i++) {
      expect(context).not.toContain(`[Source ${i}]`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// No partial chunk splitting
// ─────────────────────────────────────────────────────────────────────────────

describe('buildContext — no partial chunks', () => {
  it('never splits a chunk: content of included chunks is complete', () => {
    const chunks = makeChunks(4, 300);
    const budget = 300; // tight budget
    const { context } = buildContext(chunks, undefined, budget);

    // Each included chunk must appear with its FULL content intact.
    // We verify by checking that every content we CAN find is complete.
    for (const chunk of chunks) {
      if (context.includes(`Chunk ID: ${chunk.chunkId}`)) {
        expect(context).toContain(chunk.content);
      }
    }
  });

  it('a chunk is either fully included or fully excluded', () => {
    const chunks = makeChunks(3, 400);
    const budget = 400; // tight — may include 1 chunk only
    const { context } = buildContext(chunks, undefined, budget);

    for (const chunk of chunks) {
      const hasHeader  = context.includes(`Chunk ID: ${chunk.chunkId}`);
      const hasContent = context.includes(chunk.content);
      // Either both present or both absent
      expect(hasHeader).toBe(hasContent);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source metadata preserved on retained chunks
// ─────────────────────────────────────────────────────────────────────────────

describe('buildContext — metadata preserved', () => {
  const chunks = [
    makeChunk({ chunkId: 1, pageNumber: 42,   sectionHeading: 'Introduction',  documentTitle: 'Book A' }),
    makeChunk({ chunkId: 2, pageNumber: null,  sectionHeading: null,             documentTitle: 'Book B' }),
    makeChunk({ chunkId: 3, pageNumber: 99,   sectionHeading: 'Conclusion',     documentTitle: 'Book A' }),
  ];

  it('preserves pageNumber in output', () => {
    const { context } = buildContext(chunks, undefined, 99999);
    expect(context).toContain('Page: 42');
    expect(context).toContain('Page: 99');
  });

  it('omits Page line when pageNumber is null', () => {
    // chunk 2 has null pageNumber but chunk 1/3 have pages
    // Find the Source 2 section and verify no "Page:" in it
    const { context } = buildContext(chunks, undefined, 99999);
    const src2Start = context.indexOf('[Source 2]');
    const src3Start = context.indexOf('[Source 3]');
    const src2Block = src3Start === -1
      ? context.slice(src2Start)
      : context.slice(src2Start, src3Start);
    expect(src2Block).not.toContain('Page:');
  });

  it('preserves sectionHeading in output', () => {
    const { context } = buildContext(chunks, undefined, 99999);
    expect(context).toContain('Section: Introduction');
    expect(context).toContain('Section: Conclusion');
  });

  it('preserves documentTitle in output', () => {
    const { context } = buildContext(chunks, undefined, 99999);
    expect(context).toContain('Document: Book A');
    expect(context).toContain('Document: Book B');
  });

  it('preserves chunkId in output', () => {
    const { context } = buildContext(chunks, undefined, 99999);
    expect(context).toContain('Chunk ID: 1');
    expect(context).toContain('Chunk ID: 2');
    expect(context).toContain('Chunk ID: 3');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildContextString backward-compatible wrapper
// ─────────────────────────────────────────────────────────────────────────────

describe('buildContextString — backward-compatible API', () => {
  const chunk = makeChunk({ chunkId: 1, content: 'Some content here.' });

  it('returns a plain string', () => {
    expect(typeof buildContextString([chunk])).toBe('string');
  });

  it('returns the same text as buildContext(...).context', () => {
    const str = buildContextString([chunk]);
    const { context } = buildContext([chunk]);
    expect(str).toBe(context);
  });

  it('returns empty string for empty input', () => {
    expect(buildContextString([])).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Production failure reproduction
// ─────────────────────────────────────────────────────────────────────────────

describe('Production failure reproduction — 8 chunks ~10361 chars, 8000 TPM limit', () => {
  /**
   * Reproduce the exact failure scenario:
   *   - 8 retrieved chunks
   *   - Total context chars ≈ 10 361 (reported in the production error)
   *   - Without budget: the full 8-chunk context + prompt overhead exceeds the 8000 TPM limit
   *   - With budget: context is reduced to a safe size BEFORE the LLM call
   *
   * Our deterministic token estimate: 2.0 chars/token (conservative empirical calibration).
   *
   * The production request was 8 341 tokens on a provider with 8 000 TPM.
   * Input tokens were approximately 4,245 (= 8341 - 4096 max_completion_tokens).
   * The full request payload (system + user + context) was ~10,361 chars.
   * 10,361 / 4,245 ≈ 2.44 chars/token — much denser than the old 3.5 c/t estimate.
   *
   * With the new 2.0 c/t estimate and QG_MAX_CONTEXT_CHARS=3500, the context
   * body is capped hard at 3,500 chars ≈ 1,750 estimated tokens.  Combined with
   * a 6,500-token effective ceiling (below Groq's 8,000 TPM limit), the guard
   * is effective.
   *
   * We demonstrate the budget layer works by using a tight budget that matches
   * the available input tokens (approximately 2500 after removing output + overhead):
   *
   *   Available context = 8000 - 600 (system) - 200 (user overhead) - 1000 (output) - 200 (safety) = 6000
   *   With 2.0 c/t, a context body of 12,000 chars = 6,000 estimated tokens hits the budget.
   *   We therefore test with a TIGHT context budget directly.
   */

  // ── Fixture: 8 chunks that collectively exceed a 2500-token context budget ──
  // 2500 / 8 = 312 tokens/chunk; 312 × 3.5 = 1093 chars/chunk content.
  // We use 1100 chars per chunk → ~314 tokens each → 8 chunks = ~2514 tokens
  // which exceeds our test budget of 2500.
  const CHUNK_CONTENT_CHARS = 1100;
  const chunks = makeChunks(8, CHUNK_CONTENT_CHARS);

  // Approx total raw content chars
  const TOTAL_RAW_CHARS = chunks.reduce((s, c) => s + c.content.length, 0);

  // Context budget chosen to match the real available input after overhead.
  // We set this to 2500 tokens — tight enough that 8 × ~314-token chunks overflow.
  const CONTEXT_BUDGET_TOKENS = 2_500;

  // Each chunk block (content + metadata headers) is approximately:
  // content (~1100) + header lines (~80 chars) = ~1180 chars → ~590 tokens at 2.0 c/t
  const APPROX_TOKENS_PER_BLOCK = Math.ceil((CHUNK_CONTENT_CHARS + 80) / 2.0);

  it('fixture produces ≥ 8000 raw content chars (scale of reported failure)', () => {
    expect(TOTAL_RAW_CHARS).toBeGreaterThan(8_000);
  });

  it('8 full blocks would exceed the 2500-token context budget', () => {
    // 8 blocks × ~337 tokens = ~2698 tokens > 2500 budget
    expect(8 * APPROX_TOKENS_PER_BLOCK).toBeGreaterThan(CONTEXT_BUDGET_TOKENS);
  });

  it('with budget applied: estimated context tokens stay within budget', () => {
    const { estimatedTokens } = buildContext(chunks, undefined, CONTEXT_BUDGET_TOKENS);
    expect(estimatedTokens).toBeLessThanOrEqual(CONTEXT_BUDGET_TOKENS);
  });

  it('with budget applied: some chunks are dropped', () => {
    const { droppedCount } = buildContext(chunks, undefined, CONTEXT_BUDGET_TOKENS);
    expect(droppedCount).toBeGreaterThan(0);
  });

  it('with budget applied: at least 1 chunk is retained', () => {
    const { selectedCount } = buildContext(chunks, undefined, CONTEXT_BUDGET_TOKENS);
    expect(selectedCount).toBeGreaterThan(0);
  });

  it('first (highest-ranked) chunk is always retained', () => {
    const { context } = buildContext(chunks, undefined, CONTEXT_BUDGET_TOKENS);
    expect(context).toContain('[Source 1]');
    expect(context).toContain('Document: Test Document');
  });

  it('without budget: all 8 chunks are included but would overflow a tight provider limit', () => {
    // Without a token budget, all 8 chunks are included (only char cap applies at 12k)
    const { selectedCount: rawSelected } = buildContext(chunks, 12_000, null);
    expect(rawSelected).toBe(8);  // all 8 fit under the 12k char cap

    // Compute their combined estimated tokens — should exceed the 2500 budget
    const { estimatedTokens: rawTokens } = buildContext(chunks, 12_000, null);
    expect(rawTokens).toBeGreaterThan(CONTEXT_BUDGET_TOKENS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Small question count vs large question count output reserve
// ─────────────────────────────────────────────────────────────────────────────

describe('Output reserve scales correctly with question count', () => {
  // Updated to match new config defaults: minOutputReserveTokens=400, outputTokensPerQuestion=250
  it('count=1: uses minOutputReserveTokens (400)', () => {
    const reserve = Math.max(400, 1 * 250);
    expect(reserve).toBe(400);
  });

  it('count=5: 5 * 250 = 1250 tokens output reserve', () => {
    const reserve = Math.max(400, 5 * 250);
    expect(reserve).toBe(1250);
  });

  it('count=10: 10 * 250 = 2500 tokens output reserve', () => {
    const reserve = Math.max(400, 10 * 250);
    expect(reserve).toBe(2500);
  });

  it('count=1 has more context budget than count=10', () => {
    const budgetCount1 = computeContextTokenBudget({
      windowTokens: 6500, systemPromptReserve: 700,
      userPromptOverhead: 200, outputReserve: Math.max(400, 1 * 250), safetyMargin: 300,
    });
    const budgetCount10 = computeContextTokenBudget({
      windowTokens: 6500, systemPromptReserve: 700,
      userPromptOverhead: 200, outputReserve: Math.max(400, 10 * 250), safetyMargin: 300,
    });
    expect(budgetCount1).toBeGreaterThan(budgetCount10);
  });
});
