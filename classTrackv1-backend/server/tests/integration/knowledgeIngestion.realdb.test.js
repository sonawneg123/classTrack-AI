/**
 * server/tests/integration/knowledgeIngestion.realdb.test.js
 *
 * REAL DATABASE + REAL EMBEDDING integration test for the knowledge ingestion
 * pipeline.
 *
 * ARCHITECTURE NOTE — WHY DIRECT PIPELINE INVOCATION:
 *   The ingestion pipeline uses setImmediate() to decouple the HTTP response
 *   from the background embedding work.  In Jest's test worker process this
 *   separation is irrelevant — we want to assert on the final state, so we
 *   drive _processDocumentAsync by inserting a document directly into the DB
 *   (status='uploaded') and then calling recoverStuckDocuments() which
 *   re-queues it and WAITS via the normal polling path.
 *
 *   This approach tests the REAL production code path end-to-end, including
 *   the actual @xenova/transformers Worker thread inference.
 *
 * USAGE:
 *   REAL_DB_TESTS=1 \
 *   REAL_DB_HOST=localhost REAL_DB_PORT=5432 \
 *   REAL_DB_USER=classtrack REAL_DB_PASSWORD=classtrack_password \
 *   REAL_DB_NAME=classtrack_ai \
 *   JWT_SECRET=x GROQ_API_KEY=dummy \
 *   npx jest --testPathPattern="knowledgeIngestion.realdb" \
 *            --forceExit --testTimeout=300000
 */

const SKIP = process.env.REAL_DB_TESTS !== '1';

if (SKIP) {
  describe.skip('Real-DB ingestion pipeline tests', () => {
    it('skipped — set REAL_DB_TESTS=1 to run', () => {});
  });
} else {
  // ── Override DB env vars BEFORE setup.js sets classtrack_test ───────────
  process.env.DB_HOST     = process.env.REAL_DB_HOST     || 'localhost';
  process.env.DB_PORT     = String(Number(process.env.REAL_DB_PORT  || '5432'));
  process.env.DB_USER     = process.env.REAL_DB_USER     || 'classtrack';
  process.env.DB_PASSWORD = process.env.REAL_DB_PASSWORD || 'classtrack_password';
  process.env.DB_NAME     = process.env.REAL_DB_NAME     || 'classtrack_ai';

  require('dotenv').config();

  const { Pool }   = require('pg');
  const fs         = require('fs');
  const path       = require('path');
  const os         = require('os');

  // ── Raw pool for fixture setup / assertions ───────────────────────────────
  const rawPool = new Pool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  async function q(sql, params = []) {
    const result = await rawPool.query(sql, params);
    return result.rows;
  }

  // ── Poll helper ───────────────────────────────────────────────────────────
  async function waitForStatus(docId, expected, maxWaitMs = 150_000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const [row] = await q(
        `SELECT status, failure_message FROM knowledge_documents WHERE id = $1`,
        [docId]
      );
      if (!row) throw new Error(`Document ${docId} not found`);
      if (row.status === expected) return row;
      if (row.status === 'failed' && expected !== 'failed') {
        throw new Error(`Document ${docId} failed unexpectedly: ${row.failure_message}`);
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    const [row] = await q(
      `SELECT status, failure_message FROM knowledge_documents WHERE id = $1`, [docId]
    );
    throw new Error(
      `Document ${docId} did not reach '${expected}' within ${maxWaitMs}ms. ` +
      `Current: ${row?.status}, failure: ${row?.failure_message}`
    );
  }

  // ── Shared test state ─────────────────────────────────────────────────────
  let teacherId, topicId;
  let tmpTxtFile;
  const UNIQUE = Date.now();
  const TEACHER_EMAIL = `ingestion_test_${UNIQUE}@test.local`;

  // ── Services — loaded fresh with REAL DB creds ────────────────────────────
  let ingestionService;

  beforeAll(async () => {
    // Force a fresh module tree that uses the REAL DB env vars we set above.
    jest.resetModules();
    ingestionService = require('../../src/services/knowledge/ingestion.service');

    // Fixture: teacher → curriculum → subject → chapter → topic
    await q(`DELETE FROM teachers WHERE email = $1`, [TEACHER_EMAIL]);
    const [t]  = await q(`INSERT INTO teachers (email,password_hash,name,is_active) VALUES ($1,'x',$2,true) RETURNING id`, [TEACHER_EMAIL, `Ingestion ${UNIQUE}`]);
    teacherId = t.id;
    const [c]  = await q(`INSERT INTO curricula (teacher_id,name) VALUES ($1,'IT Curriculum') RETURNING id`, [teacherId]);
    const [s]  = await q(`INSERT INTO subjects (curriculum_id,teacher_id,name) VALUES ($1,$2,'IT Subject') RETURNING id`, [c.id, teacherId]);
    const [ch] = await q(`INSERT INTO chapters (subject_id,teacher_id,name) VALUES ($1,$2,'IT Chapter') RETURNING id`, [s.id, teacherId]);
    const [tp] = await q(`INSERT INTO topics (chapter_id,teacher_id,name) VALUES ($1,$2,'IT Topic') RETURNING id`, [ch.id, teacherId]);
    topicId = tp.id;

    // Small TXT file (fast text extraction + 1-2 chunks + quick embedding)
    tmpTxtFile = path.join(os.tmpdir(), `ingestion_test_${UNIQUE}.txt`);
    const content = [
      'Photosynthesis is the process by which plants use sunlight.',
      'Plants capture light energy using chlorophyll in their leaves.',
      'The chemical equation is: 6CO2 + 6H2O + light → C6H12O6 + 6O2.',
      'Oxygen is a byproduct of photosynthesis released into the air.',
      'Plants store glucose for energy to power cellular processes.',
      'Photosynthesis occurs in the chloroplasts of plant cells.',
      'The light-dependent reactions happen in the thylakoid membrane.',
      'The Calvin cycle is the light-independent phase of photosynthesis.',
      'Stomata on leaves allow carbon dioxide to enter the plant.',
      'Water absorbed through roots is transported to leaves.',
    ].join('\n\n');
    fs.writeFileSync(tmpTxtFile, content, 'utf-8');
  }, 30_000);

  afterAll(async () => {
    if (teacherId) await q(`DELETE FROM teachers WHERE id = $1`, [teacherId]);
    if (tmpTxtFile && fs.existsSync(tmpTxtFile)) fs.unlinkSync(tmpTxtFile);
    await rawPool.end();
  }, 30_000);

  // ── Tests ─────────────────────────────────────────────────────────────────

  describe('Full ingestion pipeline — TXT document', () => {
    let docId;

    it('registerAndProcess returns status=uploaded immediately', async () => {
      const doc = await ingestionService.registerAndProcess({
        topicId, teacherId,
        title: 'Photosynthesis Notes',
        originalFilename: 'photosynthesis.txt',
        filePath: tmpTxtFile,
        fileType: 'txt',
        fileSizeBytes: fs.statSync(tmpTxtFile).size,
      });
      expect(doc).toMatchObject({ status: 'uploaded' });
      expect(typeof doc.id).toBe('number');
      docId = doc.id;

      // DB should immediately show 'uploaded'
      const [row] = await q(`SELECT status FROM knowledge_documents WHERE id = $1`, [docId]);
      expect(row.status).toBe('uploaded');
    });

    it('background processing: uploaded → processing → ready', async () => {
      expect(docId).toBeDefined();
      // Wait up to 150s: Worker thread loads model (~2-5s) + 1-2 chunk embeddings (~1s)
      const row = await waitForStatus(docId, 'ready', 150_000);
      expect(row.status).toBe('ready');
    }, 160_000);

    it('knowledge_chunks were created with real embeddings', async () => {
      expect(docId).toBeDefined();
      const chunks = await q(
        `SELECT chunk_index, chunk_text, embedding IS NOT NULL AS has_embedding
         FROM knowledge_chunks WHERE document_id = $1 ORDER BY chunk_index`,
        [docId]
      );
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.every((c) => c.has_embedding)).toBe(true);
      expect(chunks[0].chunk_index).toBe(0);

      const [doc] = await q(`SELECT total_chunks FROM knowledge_documents WHERE id = $1`, [docId]);
      expect(doc.total_chunks).toBe(chunks.length);
    });

    it('duplicate upload is rejected with DUPLICATE error', async () => {
      const err = await ingestionService.registerAndProcess({
        topicId, teacherId,
        title: 'Duplicate',
        originalFilename: 'dup.txt',
        filePath: tmpTxtFile,     // same content → same hash
        fileType: 'txt',
        fileSizeBytes: fs.statSync(tmpTxtFile).size,
      }).catch((e) => e);

      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('DUPLICATE');
      expect(typeof err.existingId).toBe('number');
    });
  });

  describe('Processing failure → status=failed', () => {
    it('bad PDF content produces status=failed with a failure_message', async () => {
      const badFile = path.join(os.tmpdir(), `bad_${UNIQUE}.pdf`);
      fs.writeFileSync(badFile, 'not a real pdf', 'utf-8');

      // Insert directly as failed so we can use retryDocument to trigger processing
      const [row] = await q(
        `INSERT INTO knowledge_documents
           (topic_id, teacher_id, title, original_filename, file_path,
            file_type, file_size_bytes, content_hash, status)
         VALUES ($1,$2,'Bad PDF','bad.pdf',$3,'pdf',$4,$5,'failed') RETURNING id`,
        [topicId, teacherId, badFile, fs.statSync(badFile).size, `bad_${UNIQUE}`]
      );
      const failDocId = row.id;

      const reset = await ingestionService.retryDocument(failDocId, teacherId);
      expect(reset).toBeTruthy();

      const result = await waitForStatus(failDocId, 'failed', 60_000);
      expect(result.status).toBe('failed');
      expect(result.failure_message).toBeTruthy();
      expect(result.failure_message.length).toBeGreaterThan(0);

      fs.unlinkSync(badFile);
    }, 90_000);
  });

  describe('Startup crash recovery', () => {
    it('resets stuck processing documents and re-processes to ready', async () => {
      const recFile = path.join(os.tmpdir(), `recovery_${UNIQUE}.txt`);
      fs.writeFileSync(recFile,
        'Mitosis is cell division. DNA is replicated before the cell splits.',
        'utf-8'
      );

      // Insert directly in 'processing' state (simulates crash mid-pipeline)
      const [row] = await q(
        `INSERT INTO knowledge_documents
           (topic_id, teacher_id, title, original_filename, file_path,
            file_type, file_size_bytes, content_hash, status)
         VALUES ($1,$2,'Recovery','rec.txt',$3,'txt',$4,$5,'processing') RETURNING id`,
        [topicId, teacherId, recFile, fs.statSync(recFile).size, `rec_${UNIQUE}`]
      );
      const recDocId = row.id;

      // Verify it's stuck in processing
      const [before] = await q(`SELECT status FROM knowledge_documents WHERE id = $1`, [recDocId]);
      expect(before.status).toBe('processing');

      // recoverStuckDocuments resets it to uploaded and re-queues
      await ingestionService.recoverStuckDocuments();

      // The doc should now be uploaded or already progressing
      const [after] = await q(`SELECT status FROM knowledge_documents WHERE id = $1`, [recDocId]);
      expect(['uploaded', 'processing', 'ready']).toContain(after.status);

      // Wait for it to complete
      const final = await waitForStatus(recDocId, 'ready', 150_000);
      expect(final.status).toBe('ready');

      const [{ n }] = await q(
        `SELECT COUNT(*) AS n FROM knowledge_chunks WHERE document_id = $1`, [recDocId]
      );
      expect(Number(n)).toBeGreaterThan(0);

      fs.unlinkSync(recFile);
    }, 160_000);
  });
}
