/**
 * server/tests/unit/services/questionGenBudget.service.test.js
 *
 * Regression tests for the LLM token-budget fix.
 *
 * PURPOSE
 * ───────
 * These tests prove that the ACTUAL Groq API call receives a request whose
 * estimated total tokens (input + max_completion_tokens) is below the
 * configured provider limit.  They mock Groq at the LLMProvider level and
 * inspect the exact `maxTokens` / messages passed to the provider.
 *
 * REPRODUCES TODAY'S FAILURE
 * ──────────────────────────
 * Before the fix:
 *   • 8 retrieved chunks totalling ~10,361 chars
 *   • CHARS_PER_TOKEN = 3.5 → estimated 2,960 tokens (actual ~4,245 input tokens)
 *   • maxTokens passed to Groq was QG_MAX_TOKENS = 4,096 (static, not count-dependent)
 *   • Groq reported: requested = 8,341, limit = 8,000 → HTTP 413
 *
 * After the fix:
 *   • CHARS_PER_TOKEN = 2.0 → more conservative estimate
 *   • QG_MAX_CONTEXT_CHARS = 3,500 → hard char cap applied first
 *   • maxTokens passed to Groq = outputReserve (count-dependent), NOT 4,096
 *   • count=2: outputReserve = max(400, 2×250) = 500 → smaller total request
 *   • count=10: outputReserve = max(400, 10×250) = 2,500 → larger output reserve
 *   • estimatedTotalRequest < 6,500 (effective ceiling) in all cases
 */

// ── Module mocks (must be before any require) ─────────────────────────────────
jest.mock('../../../src/repositories/topic.repository',     () => ({ findOwnedById: jest.fn() }));
jest.mock('../../../src/repositories/chapter.repository',   () => ({ findOwnedById: jest.fn() }));
jest.mock('../../../src/repositories/subject.repository',   () => ({ findOwnedById: jest.fn() }));
jest.mock('../../../src/repositories/curriculum.repository',() => ({ findOwnedById: jest.fn() }));
jest.mock('../../../src/repositories/questionBank.repository', () => ({
  insert:          jest.fn(),
  existsDuplicate: jest.fn(),
}));
jest.mock('../../../src/services/ai/providers', () => ({ getLLMProvider: jest.fn() }));

// We do NOT mock retrieval.service — we use the real buildContext() so that
// the character cap and token budget guards are exercised end-to-end.
// We DO mock search() to return controlled chunks.
jest.mock('../../../src/services/knowledge/retrieval.service', () => {
  const real = jest.requireActual('../../../src/services/knowledge/retrieval.service');
  return {
    buildContext: real.buildContext,   // real implementation under test
    search:       jest.fn(),           // controlled retrieval
  };
});

const { generateQuestions } = require('../../../src/services/questions/questionGeneration.service');
const topicRepo       = require('../../../src/repositories/topic.repository');
const chapterRepo     = require('../../../src/repositories/chapter.repository');
const subjectRepo     = require('../../../src/repositories/subject.repository');
const curriculumRepo  = require('../../../src/repositories/curriculum.repository');
const questionRepo    = require('../../../src/repositories/questionBank.repository');
const { search }      = require('../../../src/services/knowledge/retrieval.service');
const { getLLMProvider } = require('../../../src/services/ai/providers');
const config          = require('../../../src/config');
const { estimateTokens } = require('../../../src/utils/tokenEstimate.util');

// ── Shared fixtures ───────────────────────────────────────────────────────────
const MOCK_TOPIC      = { id: 10, name: 'Photosynthesis',    chapter_id: 5 };
const MOCK_CHAPTER    = { id: 5,  name: 'Plant Biology',     subject_id: 3 };
const MOCK_SUBJECT    = { id: 3,  name: 'Biology',           curriculum_id: 1 };
const MOCK_CURRICULUM = { id: 1,  name: 'Science Curriculum' };

/**
 * Build a realistic knowledge chunk with body of `contentLength` characters.
 * We fill with repeated words to simulate real educational text.
 */
function makeChunk(id, contentLength = 1200) {
  const word  = 'photosynthesis ';
  const times = Math.ceil(contentLength / word.length);
  const body  = (word.repeat(times)).slice(0, contentLength);
  return {
    chunkId:         id,
    chunkIndex:      id - 100,
    documentTitle:   `Biology Textbook Chapter ${id}`,
    pageNumber:      id,
    sectionHeading:  `Section ${id}`,
    content:         body,
    similarity:      0.85,
    source: {
      documentId:       20,
      documentTitle:    'Biology Textbook',
      originalFilename: 'bio.pdf',
      fileType:         'pdf',
      sourceMeta:       null,
      topic:      { id: 10, name: 'Photosynthesis' },
      chapter:    { id: 5,  name: 'Plant Biology'  },
      subject:    { id: 3,  name: 'Biology'         },
      curriculum: { id: 1,  name: 'Science Curriculum' },
    },
  };
}

/**
 * Build 8 chunks totalling approximately 10,361 characters of content —
 * reproducing the exact scenario from the live HTTP 413 failure.
 */
function makeLargeChunkSet() {
  // 8 chunks × ~1,295 chars each ≈ 10,361 chars of content body.
  // The structured headers add ~100 chars per chunk.
  return Array.from({ length: 8 }, (_, i) => makeChunk(101 + i, 1295));
}

function makeMcqResponse(count) {
  return {
    questions: Array.from({ length: count }, (_, i) => ({
      type:           'mcq',
      question:       `Question ${i + 1}: What do plants convert sunlight into?`,
      options:        ['Starch', 'Glucose', 'Protein', 'Fat'],
      correct_answer: 'Glucose',
      explanation:    'Photosynthesis converts sunlight into glucose.',
      difficulty:     'medium',
    })),
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
  topicRepo.findOwnedById.mockResolvedValue(MOCK_TOPIC);
  chapterRepo.findOwnedById.mockResolvedValue(MOCK_CHAPTER);
  subjectRepo.findOwnedById.mockResolvedValue(MOCK_SUBJECT);
  curriculumRepo.findOwnedById.mockResolvedValue(MOCK_CURRICULUM);
  questionRepo.existsDuplicate.mockResolvedValue(false);
  questionRepo.insert.mockResolvedValue({
    id: 99, status: 'pending_approval', created_at: new Date().toISOString(),
  });
});

// ── Helper: run generateQuestions and capture the provider call args ──────────
async function runAndCapture(count, chunks = [makeChunk(101)]) {
  const mockGenerateStructuredOutput = jest.fn().mockResolvedValue(makeMcqResponse(count));
  getLLMProvider.mockReturnValue({ generateStructuredOutput: mockGenerateStructuredOutput });
  search.mockResolvedValue({
    results:        chunks,
    candidates:     chunks.length,
    bestSimilarity: 0.85,
    belowThreshold: false,
  });

  await generateQuestions({
    topicId:        10,
    questionType:   'mcq',
    difficulty:     'medium',
    count,
    requesterId:    1,
    requesterRole:  'teacher',
    ownerTeacherId: 1,
  });

  expect(mockGenerateStructuredOutput).toHaveBeenCalledTimes(1);
  const [messages, options] = mockGenerateStructuredOutput.mock.calls[0];
  return { messages, options };
}

// ── Suite 1: count-dependent output reservation ───────────────────────────────
describe('Token budget — count-dependent output reservation', () => {
  it('count=1 uses a smaller maxTokens than count=5', async () => {
    const { options: o1 } = await runAndCapture(1);
    const { options: o5 } = await runAndCapture(5);
    expect(o1.maxTokens).toBeLessThan(o5.maxTokens);
  });

  it('count=2 uses a smaller maxTokens than count=5', async () => {
    const { options: o2 } = await runAndCapture(2);
    const { options: o5 } = await runAndCapture(5);
    expect(o2.maxTokens).toBeLessThan(o5.maxTokens);
  });

  it('count=5 uses a smaller maxTokens than count=10', async () => {
    const { options: o5 } = await runAndCapture(5);
    const { options: o10 } = await runAndCapture(10);
    expect(o5.maxTokens).toBeLessThan(o10.maxTokens);
  });

  it('maxTokens equals the count-dependent outputReserve formula', async () => {
    const qgCfg = config.questionGeneration;
    for (const count of [1, 2, 5, 10]) {
      const expectedReserve = Math.max(
        qgCfg.minOutputReserveTokens,
        count * qgCfg.outputTokensPerQuestion,
      );
      const { options } = await runAndCapture(count);
      expect(options.maxTokens).toBe(expectedReserve);
    }
  });
});

// ── Suite 2: total request estimate stays below the safe ceiling ──────────────
describe('Token budget — total request estimate < effective ceiling', () => {
  const SAFE_CEILING = config.questionGeneration.llmContextWindowTokens;

  it.each([1, 2, 5, 10])('count=%i: estimatedTotalRequest < %i', async (count) => {
    const { messages, options } = await runAndCapture(count);
    const estimatedInput =
      estimateTokens(messages.system) + estimateTokens(messages.user);
    const estimatedTotal = estimatedInput + options.maxTokens;
    expect(estimatedTotal).toBeLessThan(SAFE_CEILING);
  });
});

// ── Suite 3: reproduce the exact HTTP 413 scenario ────────────────────────────
describe('Regression — 8 chunks, ~10,361 context chars (the HTTP 413 scenario)', () => {
  const largeChunks = makeLargeChunkSet();

  it('buildContext trims the 10,361-char corpus before it reaches the provider', async () => {
    const { messages } = await runAndCapture(2, largeChunks);
    // The full corpus is ~10,361 chars; the hard char cap is 3,500 by default.
    // The user prompt wraps the context — check that the context portion is trimmed.
    const userPromptLen = (messages.user || '').length;
    // The user prompt total (with headers/delimiters) must be comfortably below
    // 12,000 chars (the old, broken limit) — the new limit causes real trimming.
    expect(userPromptLen).toBeLessThan(8_000);
  });

  it('count=2 with 8 large chunks: estimatedTotalRequest < 8,000', async () => {
    const { messages, options } = await runAndCapture(2, largeChunks);
    const estimatedInput =
      estimateTokens(messages.system) + estimateTokens(messages.user);
    const estimatedTotal = estimatedInput + options.maxTokens;
    // Must be well below the Groq TPM limit that caused the real 413.
    expect(estimatedTotal).toBeLessThan(8_000);
  });

  it('count=2 with 8 large chunks: maxTokens is NOT the old static 4,096', async () => {
    const { options } = await runAndCapture(2, largeChunks);
    // Before the fix, maxTokens was always 4,096 regardless of count.
    // After the fix it is count-dependent: max(400, 2×250) = 500.
    expect(options.maxTokens).not.toBe(4096);
    expect(options.maxTokens).toBeLessThanOrEqual(1000); // small count → small reserve
  });

  it('count=5 with 8 large chunks: estimatedTotalRequest < 8,000', async () => {
    const { messages, options } = await runAndCapture(5, largeChunks);
    const estimatedInput =
      estimateTokens(messages.system) + estimateTokens(messages.user);
    const estimatedTotal = estimatedInput + options.maxTokens;
    expect(estimatedTotal).toBeLessThan(8_000);
  });

  it('count=10 with 8 large chunks: estimatedTotalRequest < 8,000', async () => {
    const { messages, options } = await runAndCapture(10, largeChunks);
    const estimatedInput =
      estimateTokens(messages.system) + estimateTokens(messages.user);
    const estimatedTotal = estimatedInput + options.maxTokens;
    expect(estimatedTotal).toBeLessThan(8_000);
  });
});

// ── Suite 4: dual guard — char cap AND token budget both enforced ─────────────
describe('Dual guard — char cap and token budget both active', () => {
  it('context chars in the user prompt do not exceed the configured char cap', async () => {
    const MAX_CHARS = config.questionGeneration.maxContextChars;
    const { messages } = await runAndCapture(2, makeLargeChunkSet());
    // Extract the context section from the user prompt (between the delimiters).
    const start = (messages.user || '').indexOf('=== CONTEXT_START ===');
    const end   = (messages.user || '').indexOf('=== CONTEXT_END ===');
    if (start !== -1 && end !== -1) {
      const contextSection = messages.user.slice(start, end);
      expect(contextSection.length).toBeLessThanOrEqual(MAX_CHARS + 500); // +500 for delimiters/headers
    }
  });

  it('even a single very-large chunk is trimmed to char cap', async () => {
    // One chunk with 20,000 chars of content — should be dropped by the char cap.
    const hugeChunk = makeChunk(101, 20_000);
    const { messages } = await runAndCapture(1, [hugeChunk]);
    // With maxContextChars=3,500, a 20,000-char chunk cannot fit.
    // buildContext will drop it and contextText will be empty / minimal.
    const userPromptLen = (messages.user || '').length;
    // Even the prompt overhead is bounded — no 20,000-char expansion.
    expect(userPromptLen).toBeLessThan(10_000);
  });
});

// ── Suite 5: the messages object passed to the provider ──────────────────────
describe('Provider messages structure', () => {
  it('passes system and user string messages', async () => {
    const { messages } = await runAndCapture(1);
    expect(typeof messages.system).toBe('string');
    expect(typeof messages.user).toBe('string');
    expect(messages.system.length).toBeGreaterThan(0);
    expect(messages.user.length).toBeGreaterThan(0);
  });

  it('user prompt contains CONTEXT_START / CONTEXT_END delimiters', async () => {
    const { messages } = await runAndCapture(1);
    expect(messages.user).toContain('=== CONTEXT_START ===');
    expect(messages.user).toContain('=== CONTEXT_END ===');
  });

  it('system prompt contains the count number', async () => {
    const { messages } = await runAndCapture(3);
    expect(messages.system).toContain('3');
  });
});
