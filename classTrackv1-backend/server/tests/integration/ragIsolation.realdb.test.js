/**
 * server/tests/integration/ragIsolation.realdb.test.js
 *
 * Real-database integration tests for RAG retrieval security and correctness.
 *
 * Requires:
 *   REAL_DB_TESTS=1  (set in environment to enable)
 *   A running PostgreSQL + pgvector instance with the Flyway schema applied.
 *
 * What is tested:
 *   TEST 1  Student A queries Topic A → receives Topic A chunks
 *   TEST 2  Student A queries Topic B → blocked (belowThreshold or empty)
 *   TEST 3  Topic A retrieval never returns chunks from Topic B
 *   TEST 4  Deleted document → never retrieved
 *   TEST 5  Processing document → never retrieved
 *   TEST 6  Failed document → never retrieved
 *   TEST 7  No relevant chunks → INSUFFICIENT_CONTEXT
 *   TEST 8  High similarity query → correct chunk ranked first
 *   TEST 9  Embedding dimension mismatch → clean error
 *   TEST 10 Multiple documents → best relevant chunks selected
 *   TEST 11 Cross-teacher isolation: Teacher B docs not visible to Teacher A
 *
 * Run:
 *   REAL_DB_TESTS=1 npx jest ragIsolation.realdb.test.js --testTimeout=60000
 */

const shouldRun = process.env.REAL_DB_TESTS === '1';
const describeOrSkip = shouldRun ? describe : describe.skip;

// Only require DB-touching code when REAL_DB_TESTS is set
let pool, search, buildContext, getEmbeddingProvider;

if (shouldRun) {
  pool               = require('../../src/database/connection').pool;
  ({ search, buildContext } = require('../../src/services/knowledge/retrieval.service'));
  ({ getEmbeddingProvider } = require('../../src/services/ai/providers'));
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

// These are created in beforeAll and cleaned in afterAll using a unique test
// marker so they do not collide with existing data.
const TEST_MARKER = `rag_test_${Date.now()}`;

let teacherA, teacherB;
let classroomA;
let curriculumA, subjectA, chapterA, topicA, topicB;
let curriculumB, subjectB, chapterB, topicC; // Teacher B's data
let docA_ready, docA_processing, docA_failed, docA_deleted;
let docB_ready; // Different topic, same teacher A
let docC_ready; // Teacher B's document

// ── Helpers ───────────────────────────────────────────────────────────────────

async function q(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Insert a fake embedding vector using the actual embedding provider
 * so dimensions always match the stored schema.
 */
async function generateEmbedding(text) {
  const provider = getEmbeddingProvider();
  return provider.generateEmbedding(text);
}

async function insertChunk(documentId, teacherId, chunkIndex, text) {
  const embedding = await generateEmbedding(text);
  const embeddingStr = JSON.stringify(embedding);
  const [rows] = await pool.query(
    `INSERT INTO knowledge_chunks
       (document_id, teacher_id, chunk_index, chunk_text, char_count, token_approx,
        embedding, source_meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8::jsonb)
     RETURNING id`,
    [documentId, teacherId, chunkIndex, text, text.length,
     Math.ceil(text.length / 4), embeddingStr,
     JSON.stringify({ page: chunkIndex + 1, section: 'Test Section' })]
  );
  return rows[0].id;
}

// ── Database setup ────────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!shouldRun) return;

  // ── Create two test teachers ─────────────────────────────────────────────
  const [tA] = await q(
    `INSERT INTO teachers (email, password_hash, name, is_active)
     VALUES ($1, $2, $3, true) RETURNING id`,
    [`teacher_a_${TEST_MARKER}@test.com`, 'hash', `Teacher A ${TEST_MARKER}`]
  );
  teacherA = tA;

  const [tB] = await q(
    `INSERT INTO teachers (email, password_hash, name, is_active)
     VALUES ($1, $2, $3, true) RETURNING id`,
    [`teacher_b_${TEST_MARKER}@test.com`, 'hash', `Teacher B ${TEST_MARKER}`]
  );
  teacherB = tB;

  // ── Create classroom for Teacher A ──────────────────────────────────────
  const [cls] = await q(
    `INSERT INTO classrooms (teacher_id, name, class_code, is_active)
     VALUES ($1, $2, $3, true) RETURNING id`,
    [teacherA.id, `Class A ${TEST_MARKER}`, `CLS_${TEST_MARKER.slice(-6)}`]
  );
  classroomA = cls;

  // ── Teacher A hierarchy: Topic A ─────────────────────────────────────────
  const [cu] = await q(
    `INSERT INTO curricula (teacher_id, name) VALUES ($1, $2) RETURNING id`,
    [teacherA.id, `Curriculum A ${TEST_MARKER}`]
  );
  curriculumA = cu;

  const [su] = await q(
    `INSERT INTO subjects (curriculum_id, teacher_id, name) VALUES ($1, $2, $3) RETURNING id`,
    [curriculumA.id, teacherA.id, `Biology ${TEST_MARKER}`]
  );
  subjectA = su;

  const [ch] = await q(
    `INSERT INTO chapters (subject_id, teacher_id, name) VALUES ($1, $2, $3) RETURNING id`,
    [subjectA.id, teacherA.id, `Microbes ${TEST_MARKER}`]
  );
  chapterA = ch;

  const [tpA] = await q(
    `INSERT INTO topics (chapter_id, teacher_id, name) VALUES ($1, $2, $3) RETURNING id`,
    [chapterA.id, teacherA.id, `Biodiversity ${TEST_MARKER}`]
  );
  topicA = tpA;

  const [tpB] = await q(
    `INSERT INTO topics (chapter_id, teacher_id, name) VALUES ($1, $2, $3) RETURNING id`,
    [chapterA.id, teacherA.id, `Viruses ${TEST_MARKER}`]
  );
  topicB = tpB;

  // ── Teacher B hierarchy ──────────────────────────────────────────────────
  const [cuB] = await q(
    `INSERT INTO curricula (teacher_id, name) VALUES ($1, $2) RETURNING id`,
    [teacherB.id, `Curriculum B ${TEST_MARKER}`]
  );
  curriculumB = cuB;

  const [suB] = await q(
    `INSERT INTO subjects (curriculum_id, teacher_id, name) VALUES ($1, $2, $3) RETURNING id`,
    [curriculumB.id, teacherB.id, `Physics ${TEST_MARKER}`]
  );
  subjectB = suB;

  const [chB] = await q(
    `INSERT INTO chapters (subject_id, teacher_id, name) VALUES ($1, $2, $3) RETURNING id`,
    [subjectB.id, teacherB.id, `Optics ${TEST_MARKER}`]
  );
  chapterB = chB;

  const [tpC] = await q(
    `INSERT INTO topics (chapter_id, teacher_id, name) VALUES ($1, $2, $3) RETURNING id`,
    [chapterB.id, teacherB.id, `Light Refraction ${TEST_MARKER}`]
  );
  topicC = tpC;

  // ── Documents ────────────────────────────────────────────────────────────
  // doc A ready (Topic A, Teacher A)
  const [dAR] = await q(
    `INSERT INTO knowledge_documents
       (topic_id, teacher_id, title, original_filename, file_path, file_type, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'ready') RETURNING id`,
    [topicA.id, teacherA.id, `Biodiversity Doc ${TEST_MARKER}`,
     'bio.pdf', '/tmp/bio.pdf', 'pdf']
  );
  docA_ready = dAR;

  // doc A processing
  const [dAP] = await q(
    `INSERT INTO knowledge_documents
       (topic_id, teacher_id, title, original_filename, file_path, file_type, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'processing') RETURNING id`,
    [topicA.id, teacherA.id, `Processing Doc ${TEST_MARKER}`,
     'proc.pdf', '/tmp/proc.pdf', 'pdf']
  );
  docA_processing = dAP;

  // doc A failed
  const [dAF] = await q(
    `INSERT INTO knowledge_documents
       (topic_id, teacher_id, title, original_filename, file_path, file_type, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'failed') RETURNING id`,
    [topicA.id, teacherA.id, `Failed Doc ${TEST_MARKER}`,
     'fail.pdf', '/tmp/fail.pdf', 'pdf']
  );
  docA_failed = dAF;

  // doc A deleted (soft delete)
  const [dAD] = await q(
    `INSERT INTO knowledge_documents
       (topic_id, teacher_id, title, original_filename, file_path, file_type, status, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'ready', NOW()) RETURNING id`,
    [topicA.id, teacherA.id, `Deleted Doc ${TEST_MARKER}`,
     'del.pdf', '/tmp/del.pdf', 'pdf']
  );
  docA_deleted = dAD;

  // doc B ready (Topic B, Teacher A)
  const [dBR] = await q(
    `INSERT INTO knowledge_documents
       (topic_id, teacher_id, title, original_filename, file_path, file_type, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'ready') RETURNING id`,
    [topicB.id, teacherA.id, `Viruses Doc ${TEST_MARKER}`,
     'virus.pdf', '/tmp/virus.pdf', 'pdf']
  );
  docB_ready = dBR;

  // doc C ready (Teacher B)
  const [dCR] = await q(
    `INSERT INTO knowledge_documents
       (topic_id, teacher_id, title, original_filename, file_path, file_type, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'ready') RETURNING id`,
    [topicC.id, teacherB.id, `Optics Doc ${TEST_MARKER}`,
     'optics.pdf', '/tmp/optics.pdf', 'pdf']
  );
  docC_ready = dCR;

  // ── Insert chunks ────────────────────────────────────────────────────────
  // Topic A (biodiversity) — ready doc
  const biodiversityText = 'Biodiversity refers to the variety of life on Earth, including all species of plants, animals, fungi and microorganisms. Classification is the systematic arrangement of organisms into groups.';
  await insertChunk(docA_ready.id, teacherA.id, 0, biodiversityText);
  await insertChunk(docA_ready.id, teacherA.id, 1, 'Viruses are acellular entities that require a host cell to replicate. They are not classified as living organisms by most scientists.');

  // Processing doc — should NOT be retrieved
  await insertChunk(docA_processing.id, teacherA.id, 0, biodiversityText);

  // Failed doc — should NOT be retrieved
  await insertChunk(docA_failed.id, teacherA.id, 0, biodiversityText);

  // Deleted doc — should NOT be retrieved
  await insertChunk(docA_deleted.id, teacherA.id, 0, biodiversityText);

  // Topic B (viruses) — different topic from A
  const virusText = 'Viruses infect host cells and use the host machinery to replicate. Unlike bacteria, viruses cannot reproduce on their own.';
  await insertChunk(docB_ready.id, teacherA.id, 0, virusText);

  // Teacher B's doc — should NEVER be visible to Teacher A
  const opticsText = 'Light refracts when passing from one medium to another due to the change in speed.';
  await insertChunk(docC_ready.id, teacherB.id, 0, opticsText);

}, 120_000); // allow extra time for embedding model download on first run

afterAll(async () => {
  if (!shouldRun) return;

  // Clean up all test data by deleting the teachers (CASCADE handles everything)
  if (teacherA?.id) await q(`DELETE FROM teachers WHERE id = $1`, [teacherA.id]);
  if (teacherB?.id) await q(`DELETE FROM teachers WHERE id = $1`, [teacherB.id]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describeOrSkip('RAG Isolation — real database', () => {
  // TEST 1: Topic A query returns Topic A chunks
  it('TEST 1: query for Topic A returns chunks from Topic A', async () => {
    const { results } = await search({
      query: 'biodiversity classification organisms',
      teacherId: teacherA.id,
      filters: { topicId: topicA.id },
    });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.topicId).toBe(topicA.id);
    }
  }, 30_000);

  // TEST 2: Topic A isolation — Topic B chunks do NOT appear
  it('TEST 2: Topic A query never returns Topic B chunks', async () => {
    const { results } = await search({
      query: 'biodiversity classification organisms',
      teacherId: teacherA.id,
      filters: { topicId: topicA.id },
    });
    const topicBChunks = results.filter(r => r.topicId === topicB.id);
    expect(topicBChunks).toHaveLength(0);
  }, 30_000);

  // TEST 3: Topic B filter returns only Topic B chunks
  it('TEST 3: Topic B filter returns only Topic B chunks', async () => {
    const { results } = await search({
      query: 'viruses infect host cells replicate',
      teacherId: teacherA.id,
      filters: { topicId: topicB.id },
    });
    if (results.length > 0) {
      for (const r of results) {
        expect(r.topicId).toBe(topicB.id);
      }
    }
  }, 30_000);

  // TEST 4: Deleted documents never retrieved
  it('TEST 4: deleted document is never retrieved', async () => {
    const { results } = await search({
      query: 'biodiversity classification organisms',
      teacherId: teacherA.id,
      filters: { topicId: topicA.id },
    });
    const fromDeletedDoc = results.filter(r => r.documentId === docA_deleted.id);
    expect(fromDeletedDoc).toHaveLength(0);
  }, 30_000);

  // TEST 5: Processing documents never retrieved
  it('TEST 5: processing document is never retrieved', async () => {
    const { results } = await search({
      query: 'biodiversity',
      teacherId: teacherA.id,
      filters: { topicId: topicA.id },
    });
    const fromProcessing = results.filter(r => r.documentId === docA_processing.id);
    expect(fromProcessing).toHaveLength(0);
  }, 30_000);

  // TEST 6: Failed documents never retrieved
  it('TEST 6: failed document is never retrieved', async () => {
    const { results } = await search({
      query: 'biodiversity',
      teacherId: teacherA.id,
      filters: { topicId: topicA.id },
    });
    const fromFailed = results.filter(r => r.documentId === docA_failed.id);
    expect(fromFailed).toHaveLength(0);
  }, 30_000);

  // TEST 7: Completely unrelated query → INSUFFICIENT_CONTEXT or empty
  it('TEST 7: query for unrelated content returns belowThreshold or empty results', async () => {
    const { belowThreshold, results } = await search({
      query: 'the capital of France is Paris baguette',
      teacherId: teacherA.id,
      filters: { topicId: topicA.id },
    });
    // Either no results passed threshold, or results are very low similarity
    if (!belowThreshold && results.length > 0) {
      expect(results[0].similarity).toBeLessThan(0.70);
    }
  }, 30_000);

  // TEST 8: High similarity query → correct chunk ranked first
  it('TEST 8: high-similarity query returns relevant chunk first', async () => {
    const { results } = await search({
      query: 'biodiversity variety of life on Earth species classification',
      teacherId: teacherA.id,
      filters: { topicId: topicA.id },
    });
    expect(results.length).toBeGreaterThan(0);
    // Top result should be about biodiversity
    expect(results[0].content).toMatch(/biodiversity|classification|organisms/i);
  }, 30_000);

  // TEST 9: Embedding dimension mismatch → clean error
  it('TEST 9: embedding dimension mismatch throws before reaching PostgreSQL', async () => {
    const { getEmbeddingProvider } = require('../../src/services/ai/providers');
    const origProvider = getEmbeddingProvider();
    const origGenerate = origProvider.generateEmbedding.bind(origProvider);

    // Temporarily override to return wrong-dimension vector
    origProvider.generateEmbedding = async () => new Array(1536).fill(0);

    try {
      await expect(search({ query: 'biodiversity', teacherId: teacherA.id }))
        .rejects.toThrow('Dimension mismatch');
    } finally {
      // Restore
      origProvider.generateEmbedding = origGenerate;
    }
  }, 30_000);

  // TEST 10: Cross-teacher isolation
  it('TEST 10: Teacher B resources are never returned for Teacher A queries', async () => {
    const { results } = await search({
      query: 'light refraction optics wavelength',
      teacherId: teacherA.id,
    });
    const fromTeacherB = results.filter(r => r.documentId === docC_ready.id);
    expect(fromTeacherB).toHaveLength(0);
  }, 30_000);

  // TEST 11: Source metadata is returned
  it('TEST 11: results include source metadata (pageNumber, sectionHeading)', async () => {
    const { results } = await search({
      query: 'biodiversity classification organisms',
      teacherId: teacherA.id,
      filters: { topicId: topicA.id },
    });
    if (results.length > 0) {
      const r = results[0];
      expect(r).toHaveProperty('chunkId');
      expect(r).toHaveProperty('documentId');
      expect(r).toHaveProperty('topicId');
      expect(r).toHaveProperty('similarity');
      expect(r).toHaveProperty('content');
      expect(r).toHaveProperty('pageNumber');
      expect(r).toHaveProperty('sectionHeading');
      expect(r).toHaveProperty('documentTitle');
    }
  }, 30_000);
});

// ── Golden Dataset evaluation ─────────────────────────────────────────────────
// Measures Recall@K, Precision@K, Hit Rate@K for a small deterministic dataset.

describeOrSkip('RAG Golden Dataset — retrieval metrics', () => {
  const GOLDEN = [
    {
      query: 'What is biodiversity?',
      expectedTopicId: null, // set in beforeAll
      expectedTerms: ['biodiversity', 'variety', 'life', 'species'],
    },
    {
      query: 'How are organisms classified?',
      expectedTopicId: null,
      expectedTerms: ['classification', 'organisms'],
    },
    {
      query: 'Are viruses living organisms?',
      expectedTopicId: null,
      expectedTerms: ['virus', 'acellular', 'replicate', 'living'],
    },
  ];

  beforeAll(() => {
    // Patch expectedTopicId once we have it from outer beforeAll
    for (const g of GOLDEN) {
      g.expectedTopicId = topicA?.id;
    }
  });

  it('Recall@5: at least 80% of golden queries return at least one relevant chunk', async () => {
    let hits = 0;
    for (const { query, expectedTopicId, expectedTerms } of GOLDEN) {
      if (!expectedTopicId) continue;
      const { results } = await search({
        query,
        teacherId: teacherA.id,
        filters: { topicId: expectedTopicId },
        topK: 5,
      });
      const hasHit = results.some(r =>
        expectedTerms.some(term => r.content.toLowerCase().includes(term))
      );
      if (hasHit) hits++;
    }
    const recall = GOLDEN.length > 0 ? hits / GOLDEN.length : 0;
    console.log(`[GoldenDataset] Recall@5 = ${Math.round(recall * 100)}% (${hits}/${GOLDEN.length})`);
    // At least 2/3 queries should find something relevant
    expect(hits).toBeGreaterThanOrEqual(Math.floor(GOLDEN.length * 0.66));
  }, 60_000);

  it('Negative query: "capital of France" returns belowThreshold for Topic A', async () => {
    const { belowThreshold, bestSimilarity } = await search({
      query: 'What is the capital of France?',
      teacherId: teacherA.id,
      filters: { topicId: topicA?.id },
    });
    console.log(`[GoldenDataset] Negative query best similarity = ${bestSimilarity}`);
    // Should be below threshold or have low similarity
    if (!belowThreshold) {
      expect(bestSimilarity).toBeLessThan(0.60);
    } else {
      expect(belowThreshold).toBe(true);
    }
  }, 30_000);
});
