/**
 * server/tests/unit/services/questionGeneration.service.test.js
 *
 * Tests for QuestionGenerationService.
 * All external dependencies mocked:
 *   - topicRepo, chapterRepo, subjectRepo, curriculumRepo
 *   - questionRepo (question_bank)
 *   - retrieval.service (search)
 *   - ai/providers (getLLMProvider)
 */

jest.mock('../../../src/repositories/topic.repository',     () => ({ findOwnedById: jest.fn() }));
jest.mock('../../../src/repositories/chapter.repository',   () => ({ findOwnedById: jest.fn() }));
jest.mock('../../../src/repositories/subject.repository',   () => ({ findOwnedById: jest.fn() }));
jest.mock('../../../src/repositories/curriculum.repository',() => ({ findOwnedById: jest.fn() }));
jest.mock('../../../src/repositories/questionBank.repository', () => ({
  insert: jest.fn(),
  existsDuplicate: jest.fn(),
}));
jest.mock('../../../src/services/knowledge/retrieval.service', () => ({
  search:       jest.fn(),
  // buildContext now returns an object; mock the full shape
  buildContext: jest.fn().mockReturnValue({
    context:         'Mocked context text',
    selectedCount:   1,
    droppedCount:    0,
    estimatedTokens: 50,
    budgetTokens:    4700,
  }),
}));
jest.mock('../../../src/services/ai/providers', () => ({ getLLMProvider: jest.fn() }));

const { generateQuestions } = require('../../../src/services/questions/questionGeneration.service');
const topicRepo       = require('../../../src/repositories/topic.repository');
const chapterRepo     = require('../../../src/repositories/chapter.repository');
const subjectRepo     = require('../../../src/repositories/subject.repository');
const curriculumRepo  = require('../../../src/repositories/curriculum.repository');
const questionRepo    = require('../../../src/repositories/questionBank.repository');
const { search }      = require('../../../src/services/knowledge/retrieval.service');
const { getLLMProvider } = require('../../../src/services/ai/providers');

// ── Fixtures ──────────────────────────────────────────────────────────────────
const MOCK_TOPIC      = { id: 10, name: 'Photosynthesis', chapter_id: 5 };
const MOCK_CHAPTER    = { id: 5,  name: 'Plant Biology',  subject_id: 3 };
const MOCK_SUBJECT    = { id: 3,  name: 'Biology',        curriculum_id: 1 };
const MOCK_CURRICULUM = { id: 1,  name: 'Science Curriculum' };

const MOCK_CHUNKS = [
  {
    chunkId: 101, chunkIndex: 0,
    text: 'Photosynthesis is the process by which plants convert sunlight into glucose.',
    similarity: 0.92,
    source: {
      documentId: 20, documentTitle: 'Biology Textbook',
      originalFilename: 'bio.pdf', fileType: 'pdf',
      sourceMeta: null,
      topic:      { id: 10, name: 'Photosynthesis' },
      chapter:    { id: 5,  name: 'Plant Biology' },
      subject:    { id: 3,  name: 'Biology' },
      curriculum: { id: 1,  name: 'Science Curriculum' },
    },
  },
];

const MOCK_MCQ_RESPONSE = {
  questions: [
    {
      type: 'mcq',
      question: 'What do plants convert sunlight into?',
      options: ['Starch', 'Glucose', 'Protein', 'Fat'],
      correct_answer: 'Glucose',
      explanation: 'Photosynthesis converts sunlight into glucose.',
      difficulty: 'easy',
    },
  ],
};

// Setup default mocks
beforeEach(() => {
  jest.clearAllMocks();
  topicRepo.findOwnedById.mockResolvedValue(MOCK_TOPIC);
  chapterRepo.findOwnedById.mockResolvedValue(MOCK_CHAPTER);
  subjectRepo.findOwnedById.mockResolvedValue(MOCK_SUBJECT);
  curriculumRepo.findOwnedById.mockResolvedValue(MOCK_CURRICULUM);
  // Updated: search now returns { results, candidates, bestSimilarity, belowThreshold }
  search.mockResolvedValue({
    results: MOCK_CHUNKS,
    candidates: MOCK_CHUNKS.length,
    bestSimilarity: 0.92,
    belowThreshold: false,
  });
  questionRepo.existsDuplicate.mockResolvedValue(false);
  questionRepo.insert.mockResolvedValue({ id: 99, status: 'pending_approval', created_at: new Date().toISOString() });
  getLLMProvider.mockReturnValue({
    generateStructuredOutput: jest.fn().mockResolvedValue(MOCK_MCQ_RESPONSE),
  });
});

// ── Topic ownership ───────────────────────────────────────────────────────────
describe('generateQuestions — topic ownership', () => {
  it('throws 404 when topic is not owned by teacher', async () => {
    topicRepo.findOwnedById.mockResolvedValue(null);
    await expect(generateQuestions({
      topicId: 999, questionType: 'mcq', difficulty: 'easy', count: 1,
      requesterId: 1, requesterRole: 'teacher', ownerTeacherId: 1,
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('verifies teacher owns the topic', async () => {
    await generateQuestions({
      topicId: 10, questionType: 'mcq', difficulty: 'easy', count: 1,
      requesterId: 1, requesterRole: 'teacher', ownerTeacherId: 1,
    });
    expect(topicRepo.findOwnedById).toHaveBeenCalledWith(10, 1);
  });
});

// ── Empty retrieval / INSUFFICIENT_CONTEXT ────────────────────────────────────
describe('generateQuestions — insufficient context', () => {
  it('returns INSUFFICIENT_CONTEXT and does NOT call Groq when no chunks pass threshold', async () => {
    search.mockResolvedValue({
      results: [],
      candidates: 0,
      bestSimilarity: null,
      belowThreshold: true,
    });
    const result = await generateQuestions({
      topicId: 10, questionType: 'mcq', difficulty: 'easy', count: 1,
      requesterId: 1, requesterRole: 'teacher', ownerTeacherId: 1,
    });
    expect(result.insufficientContext).toBe(true);
    expect(result.code).toBe('INSUFFICIENT_CONTEXT');
    expect(result.stored).toBe(0);
    expect(getLLMProvider).not.toHaveBeenCalled();
  });

  it('returns INSUFFICIENT_CONTEXT when belowThreshold flag is true even if rows exist', async () => {
    search.mockResolvedValue({
      results: [],          // filtered out by similarity threshold
      candidates: 5,
      bestSimilarity: 0.15, // below default 0.30 threshold
      belowThreshold: true,
    });
    const result = await generateQuestions({
      topicId: 10, questionType: 'mcq', difficulty: 'easy', count: 1,
      requesterId: 1, requesterRole: 'teacher', ownerTeacherId: 1,
    });
    expect(result.insufficientContext).toBe(true);
    expect(getLLMProvider).not.toHaveBeenCalled();
  });

  it('message mentions learning material', async () => {
    search.mockResolvedValue({
      results: [], candidates: 0, bestSimilarity: null, belowThreshold: true,
    });
    const result = await generateQuestions({
      topicId: 10, questionType: 'mcq', difficulty: 'easy', count: 1,
      requesterId: 1, requesterRole: 'teacher', ownerTeacherId: 1,
    });
    expect(result.message).toMatch(/learning material/i);
  });
});

// ── Groq invocation ───────────────────────────────────────────────────────────
describe('generateQuestions — Groq invocation', () => {
  it('calls getLLMProvider once', async () => {
    await generateQuestions({
      topicId: 10, questionType: 'mcq', difficulty: 'easy', count: 1,
      requesterId: 1, requesterRole: 'teacher', ownerTeacherId: 1,
    });
    expect(getLLMProvider).toHaveBeenCalledTimes(1);
  });

  it('calls generateStructuredOutput with system + user prompts', async () => {
    const mockLlm = { generateStructuredOutput: jest.fn().mockResolvedValue(MOCK_MCQ_RESPONSE) };
    getLLMProvider.mockReturnValue(mockLlm);
    await generateQuestions({
      topicId: 10, questionType: 'mcq', difficulty: 'easy', count: 1,
      requesterId: 1, requesterRole: 'teacher', ownerTeacherId: 1,
    });
    expect(mockLlm.generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({ system: expect.any(String), user: expect.any(String) }),
      expect.any(Object)
    );
  });

  it('throws 500 when Groq call fails', async () => {
    getLLMProvider.mockReturnValue({
      generateStructuredOutput: jest.fn().mockRejectedValue(new Error('Groq API timeout')),
    });
    await expect(generateQuestions({
      topicId: 10, questionType: 'mcq', difficulty: 'easy', count: 1,
      requesterId: 1, requesterRole: 'teacher', ownerTeacherId: 1,
    })).rejects.toMatchObject({ statusCode: 500 });
  });
});

// ── Structured output parsing ─────────────────────────────────────────────────
describe('generateQuestions — structured output parsing', () => {
  it('parses and stores valid questions', async () => {
    const result = await generateQuestions({
      topicId: 10, questionType: 'mcq', difficulty: 'easy', count: 1,
      requesterId: 1, requesterRole: 'teacher', ownerTeacherId: 1,
    });
    expect(result.stored).toBe(1);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].status).toBe('pending_approval');
  });

  // ── Response contract: snake_case field names ─────────────────────────────
  // Regression: stored questions were returned with camelCase keys from the
  // validator (questionType, questionText, correctAnswer) which caused
  // q.question_type.replace() to throw a TypeError in the React frontend,
  // producing a blank page.
  it('returns questions with snake_case field names matching the frontend contract', async () => {
    const result = await generateQuestions({
      topicId: 10, questionType: 'mcq', difficulty: 'easy', count: 1,
      requesterId: 1, requesterRole: 'teacher', ownerTeacherId: 1,
    });
    const q = result.questions[0];
    expect(q).toHaveProperty('question_type');
    expect(q).toHaveProperty('question_text');
    expect(q).toHaveProperty('correct_answer');
    expect(q).toHaveProperty('difficulty');
    // Must NOT expose camelCase variants that break frontend rendering
    expect(q).not.toHaveProperty('questionType');
    expect(q).not.toHaveProperty('questionText');
    expect(q).not.toHaveProperty('correctAnswer');
    // Values should be populated
    expect(typeof q.question_type).toBe('string');
    expect(typeof q.question_text).toBe('string');
    expect(typeof q.correct_answer).toBe('string');
  });

  it('handles invalid LLM JSON gracefully (no questions array)', async () => {
    getLLMProvider.mockReturnValue({
      generateStructuredOutput: jest.fn().mockResolvedValue({ result: 'not an array' }),
    });
    await expect(generateQuestions({
      topicId: 10, questionType: 'mcq', difficulty: 'easy', count: 1,
      requesterId: 1, requesterRole: 'teacher', ownerTeacherId: 1,
    })).rejects.toMatchObject({ statusCode: 500 });
  });

  it('stores questions as pending_approval', async () => {
    await generateQuestions({
      topicId: 10, questionType: 'mcq', difficulty: 'easy', count: 1,
      requesterId: 1, requesterRole: 'teacher', ownerTeacherId: 1,
    });
    expect(questionRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ questionType: 'mcq', createdBy: 1, createdByRole: 'teacher' })
    );
  });
});

// ── Invalid LLM output ────────────────────────────────────────────────────────
describe('generateQuestions — invalid LLM output', () => {
  it('skips invalid questions and reports them', async () => {
    getLLMProvider.mockReturnValue({
      generateStructuredOutput: jest.fn().mockResolvedValue({
        questions: [
          { type: 'mcq', question: 'Valid?', options: ['A','B','A','D'], correct_answer: 'A', difficulty: 'easy' },
          { type: 'mcq', question: '', options: [],    correct_answer: '',  difficulty: 'easy' }, // invalid
        ],
      }),
    });
    const result = await generateQuestions({
      topicId: 10, questionType: 'mcq', difficulty: 'easy', count: 2,
      requesterId: 1, requesterRole: 'teacher', ownerTeacherId: 1,
    });
    expect(result.skippedInvalid).toBe(1);
    expect(result.stored).toBe(1);
  });
});

// ── Duplicate detection ───────────────────────────────────────────────────────
describe('generateQuestions — duplicate detection', () => {
  it('skips questions that are duplicates', async () => {
    questionRepo.existsDuplicate.mockResolvedValue(true); // all are duplicates
    const result = await generateQuestions({
      topicId: 10, questionType: 'mcq', difficulty: 'easy', count: 1,
      requesterId: 1, requesterRole: 'teacher', ownerTeacherId: 1,
    });
    expect(result.skippedDuplicates).toBe(1);
    expect(result.stored).toBe(0);
    expect(questionRepo.insert).not.toHaveBeenCalled();
  });
});

// ── Source provenance ─────────────────────────────────────────────────────────
describe('generateQuestions — source provenance', () => {
  it('includes source_document_id and source_chunk_id from first chunk', async () => {
    await generateQuestions({
      topicId: 10, questionType: 'mcq', difficulty: 'easy', count: 1,
      requesterId: 1, requesterRole: 'teacher', ownerTeacherId: 1,
    });
    expect(questionRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceDocumentId: MOCK_CHUNKS[0].source.documentId,
        sourceChunkId:    MOCK_CHUNKS[0].chunkId,
        topicId:          MOCK_TOPIC.id,
      })
    );
  });
});

// ── Maximum questions limit ───────────────────────────────────────────────────
describe('generateQuestions — max limit', () => {
  it('throws 400 when count exceeds configured maximum', async () => {
    await expect(generateQuestions({
      topicId: 10, questionType: 'mcq', difficulty: 'easy', count: 9999,
      requesterId: 1, requesterRole: 'teacher', ownerTeacherId: 1,
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(search).not.toHaveBeenCalled();
  });
});
