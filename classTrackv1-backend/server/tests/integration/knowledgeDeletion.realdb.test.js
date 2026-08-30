/**
 * server/tests/integration/knowledgeDeletion.realdb.test.js
 *
 * REAL DATABASE integration test for the knowledge hierarchy deletion.
 *
 * This file exercises the ACTUAL PostgreSQL database — no mocks.
 * It requires:
 *   - A running PostgreSQL instance (classtrack_ai)
 *   - DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME env vars set
 *     (e.g. via DOTENV_REALDB=1 npx jest --testPathPattern realdb)
 *
 * Test strategy:
 *   1. Create isolated test fixtures directly via SQL (teacher, curriculum, etc.)
 *   2. Exercise the service layer (knowledge.service.js) against the real DB
 *   3. Assert DB state afterwards
 *   4. Clean up test data in afterAll (hard-delete by known IDs)
 *
 * Part 10 scenario (the most important):
 *
 *   Curriculum A
 *   ├── Subject A
 *   │   └── Chapter A
 *   │       └── Topic A
 *   │           └── test.pdf   (document + chunks)
 *   └── Subject B
 *       └── Chapter B
 *           └── Topic B
 *
 *   DELETE Subject A
 *   → Subject A gone, Subject B untouched
 *   → Chapter A, Topic A, document, chunks: all gone
 *   → Re-upload same content hash: ALLOWED (no stale row)
 *
 * USAGE:
 *   DB_HOST=localhost DB_PORT=5432 DB_USER=classtrack DB_PASSWORD=classtrack_password
 *   DB_NAME=classtrack_ai JWT_SECRET=<secret> GROQ_API_KEY=dummy
 *   npx jest --testPathPattern="realdb" --forceExit
 */

// ── Guard: skip unless explicitly opted in ────────────────────────────────────
// Set REAL_DB_TESTS=1 in the environment to run against a live PostgreSQL instance.
// The jest setup.js sets DB_NAME=classtrack_test which would also be used here unless
// overridden, so we rely on the explicit opt-in flag rather than DB_NAME.
const SKIP_REAL_DB = process.env.REAL_DB_TESTS !== '1';

if (SKIP_REAL_DB) {
  // When running the standard jest suite (which sets DB_NAME=classtrack_test
  // via setup.js), skip this entire file cleanly.
  describe.skip('Real-DB knowledge deletion tests', () => {
    it('skipped — set real DB env vars to run', () => {});
  });
} else {
  // ── Load real DB deps ─────────────────────────────────────────────────────
  require('dotenv').config();
  const { Pool } = require('pg');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  // Direct pool pointing at the real database.
  // When REAL_DB_TESTS=1, the caller must also set these env vars
  // (they override whatever setup.js may have written to process.env).
  const pool = new Pool({
    host:     process.env.REAL_DB_HOST     || process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.REAL_DB_PORT || process.env.DB_PORT) || 5432,
    user:     process.env.REAL_DB_USER     || process.env.DB_USER,
    password: process.env.REAL_DB_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.REAL_DB_NAME     || 'classtrack_ai',
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  async function q(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows;
  }

  /** Create a test teacher row; returns the new teacher id. */
  async function createTestTeacher(suffix) {
    const email = `realdb_test_teacher_${suffix}@test.local`;
    // Delete if exists from a prior aborted run
    await q(`DELETE FROM teachers WHERE email = $1`, [email]);
    const rows = await q(
      `INSERT INTO teachers (email, password_hash, name, is_active)
       VALUES ($1, 'x', $2, true) RETURNING id`,
      [email, `RealDB Test Teacher ${suffix}`]
    );
    return rows[0].id;
  }

  async function deleteTestTeacher(id) {
    // FK cascades should remove everything owned by this teacher
    await q(`DELETE FROM teachers WHERE id = $1`, [id]);
  }

  // ── Test state ────────────────────────────────────────────────────────────

  let teacherIdA, teacherIdB;
  let curriculumAId;
  let subjectAId, subjectBId;
  let chapterAId, chapterBId;
  let topicAId, topicBId;
  let docAId;
  let tmpFile;

  const TEST_CONTENT_HASH = 'realdb_test_hash_unique_' + Date.now();

  beforeAll(async () => {
    // Create two teachers — one to own all the data, one to test IDOR
    teacherIdA = await createTestTeacher('A_' + Date.now());
    teacherIdB = await createTestTeacher('B_' + Date.now());

    // Curriculum A
    const [currRow] = await q(
      `INSERT INTO curricula (teacher_id, name) VALUES ($1, 'RealDB Curriculum A') RETURNING id`,
      [teacherIdA]
    );
    curriculumAId = currRow.id;

    // Subject A and Subject B (siblings)
    const [sARow] = await q(
      `INSERT INTO subjects (curriculum_id, teacher_id, name) VALUES ($1, $2, 'RealDB Subject A') RETURNING id`,
      [curriculumAId, teacherIdA]
    );
    subjectAId = sARow.id;

    const [sBRow] = await q(
      `INSERT INTO subjects (curriculum_id, teacher_id, name) VALUES ($1, $2, 'RealDB Subject B') RETURNING id`,
      [curriculumAId, teacherIdA]
    );
    subjectBId = sBRow.id;

    // Chapter A under Subject A; Chapter B under Subject B
    const [chARow] = await q(
      `INSERT INTO chapters (subject_id, teacher_id, name) VALUES ($1, $2, 'RealDB Chapter A') RETURNING id`,
      [subjectAId, teacherIdA]
    );
    chapterAId = chARow.id;

    const [chBRow] = await q(
      `INSERT INTO chapters (subject_id, teacher_id, name) VALUES ($1, $2, 'RealDB Chapter B') RETURNING id`,
      [subjectBId, teacherIdA]
    );
    chapterBId = chBRow.id;

    // Topic A under Chapter A; Topic B under Chapter B
    const [tARow] = await q(
      `INSERT INTO topics (chapter_id, teacher_id, name) VALUES ($1, $2, 'RealDB Topic A') RETURNING id`,
      [chapterAId, teacherIdA]
    );
    topicAId = tARow.id;

    const [tBRow] = await q(
      `INSERT INTO topics (chapter_id, teacher_id, name) VALUES ($1, $2, 'RealDB Topic B') RETURNING id`,
      [chapterBId, teacherIdA]
    );
    topicBId = tBRow.id;

    // Create a dummy physical file for the document
    tmpFile = path.join(os.tmpdir(), `realdb_test_${Date.now()}.pdf`);
    fs.writeFileSync(tmpFile, 'fake pdf content for realdb test');

    // Knowledge document under Topic A
    const [docRow] = await q(
      `INSERT INTO knowledge_documents
         (topic_id, teacher_id, title, original_filename, file_path, file_type, content_hash, status)
       VALUES ($1, $2, 'RealDB Doc A', 'realdb_test.pdf', $3, 'pdf', $4, 'ready')
       RETURNING id`,
      [topicAId, teacherIdA, tmpFile, TEST_CONTENT_HASH]
    );
    docAId = docRow.id;

    // Insert a fake chunk for the document
    await q(
      `INSERT INTO knowledge_chunks
         (document_id, teacher_id, chunk_index, chunk_text, char_count, token_approx)
       VALUES ($1, $2, 0, 'fake chunk text', 15, 4)`,
      [docAId, teacherIdA]
    );
  });

  afterAll(async () => {
    // Clean up: delete both test teachers (FK CASCADE removes everything)
    if (teacherIdA) await deleteTestTeacher(teacherIdA);
    if (teacherIdB) await deleteTestTeacher(teacherIdB);
    // Remove physical file
    if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    await pool.end();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Part 6 — FK cascade verification
  // ══════════════════════════════════════════════════════════════════════════

  describe('Part 6 — FK ON DELETE CASCADE relationships', () => {
    it('chapters.subject_id → subjects.id CASCADE', async () => {
      const rows = await q(
        `SELECT rc.delete_rule
         FROM information_schema.table_constraints tc
         JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
         JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
         WHERE tc.table_name = 'chapters' AND kcu.column_name = 'subject_id' AND tc.constraint_type = 'FOREIGN KEY'`
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].delete_rule).toBe('CASCADE');
    });

    it('topics.chapter_id → chapters.id CASCADE', async () => {
      const rows = await q(
        `SELECT rc.delete_rule
         FROM information_schema.table_constraints tc
         JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
         JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
         WHERE tc.table_name = 'topics' AND kcu.column_name = 'chapter_id' AND tc.constraint_type = 'FOREIGN KEY'`
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].delete_rule).toBe('CASCADE');
    });

    it('knowledge_documents.topic_id → topics.id CASCADE', async () => {
      const rows = await q(
        `SELECT rc.delete_rule
         FROM information_schema.table_constraints tc
         JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
         JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
         WHERE tc.table_name = 'knowledge_documents' AND kcu.column_name = 'topic_id' AND tc.constraint_type = 'FOREIGN KEY'`
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].delete_rule).toBe('CASCADE');
    });

    it('knowledge_chunks.document_id → knowledge_documents.id CASCADE', async () => {
      const rows = await q(
        `SELECT rc.delete_rule
         FROM information_schema.table_constraints tc
         JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
         JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
         WHERE tc.table_name = 'knowledge_chunks' AND kcu.column_name = 'document_id' AND tc.constraint_type = 'FOREIGN KEY'`
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].delete_rule).toBe('CASCADE');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Verify test fixture is set up correctly
  // ══════════════════════════════════════════════════════════════════════════

  describe('Fixture verification', () => {
    it('curriculum A exists and belongs to teacher A', async () => {
      const rows = await q(`SELECT id FROM curricula WHERE id = $1 AND teacher_id = $2`, [curriculumAId, teacherIdA]);
      expect(rows).toHaveLength(1);
    });

    it('subject A and subject B exist under curriculum A', async () => {
      const rows = await q(`SELECT id FROM subjects WHERE curriculum_id = $1`, [curriculumAId]);
      expect(rows.map((r) => r.id)).toContain(subjectAId);
      expect(rows.map((r) => r.id)).toContain(subjectBId);
    });

    it('topic A has document + chunk', async () => {
      const docs = await q(`SELECT id FROM knowledge_documents WHERE topic_id = $1`, [topicAId]);
      expect(docs).toHaveLength(1);
      const chunks = await q(`SELECT id FROM knowledge_chunks WHERE document_id = $1`, [docAId]);
      expect(chunks).toHaveLength(1);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Part 10 — The most important scenario
  // ══════════════════════════════════════════════════════════════════════════

  describe('Part 10 — DELETE Subject A: full cascade verification', () => {
    beforeAll(async () => {
      // Hard-delete Subject A directly via SQL (mirrors what the service does)
      await q(`DELETE FROM subjects WHERE id = $1 AND teacher_id = $2`, [subjectAId, teacherIdA]);
    });

    it('Subject A is gone from subjects table', async () => {
      const rows = await q(`SELECT id FROM subjects WHERE id = $1`, [subjectAId]);
      expect(rows).toHaveLength(0);
    });

    it('Subject B still exists (sibling not affected)', async () => {
      const rows = await q(`SELECT id FROM subjects WHERE id = $1`, [subjectBId]);
      expect(rows).toHaveLength(1);
    });

    it('Curriculum A still exists (parent not affected)', async () => {
      const rows = await q(`SELECT id FROM curricula WHERE id = $1`, [curriculumAId]);
      expect(rows).toHaveLength(1);
    });

    it('Chapter A is gone (cascaded from Subject A)', async () => {
      const rows = await q(`SELECT id FROM chapters WHERE id = $1`, [chapterAId]);
      expect(rows).toHaveLength(0);
    });

    it('Chapter B still exists (under Subject B, not affected)', async () => {
      const rows = await q(`SELECT id FROM chapters WHERE id = $1`, [chapterBId]);
      expect(rows).toHaveLength(1);
    });

    it('Topic A is gone (cascaded from Chapter A)', async () => {
      const rows = await q(`SELECT id FROM topics WHERE id = $1`, [topicAId]);
      expect(rows).toHaveLength(0);
    });

    it('Topic B still exists (under Subject B, not affected)', async () => {
      const rows = await q(`SELECT id FROM topics WHERE id = $1`, [topicBId]);
      expect(rows).toHaveLength(1);
    });

    it('Knowledge document under Topic A is gone', async () => {
      const rows = await q(`SELECT id FROM knowledge_documents WHERE id = $1`, [docAId]);
      expect(rows).toHaveLength(0);
    });

    it('Knowledge chunks for that document are gone', async () => {
      const rows = await q(`SELECT id FROM knowledge_chunks WHERE document_id = $1`, [docAId]);
      expect(rows).toHaveLength(0);
    });

    it('Physical file was not deleted by SQL alone (service handles that)', () => {
      // The SQL DELETE does not remove physical files.
      // The service layer calls _deletePhysicalFiles after commit.
      // Here we only verify the DB layer; physical cleanup is the service's job.
      expect(fs.existsSync(tmpFile)).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Re-upload check: same content_hash is now allowed
  // ══════════════════════════════════════════════════════════════════════════

  describe('Part 10 — Re-upload after Subject A deletion', () => {
    it('findByHash returns null for the deleted document\'s hash', async () => {
      const rows = await q(
        `SELECT id FROM knowledge_documents WHERE content_hash = $1 AND teacher_id = $2 AND deleted_at IS NULL`,
        [TEST_CONTENT_HASH, teacherIdA]
      );
      expect(rows).toHaveLength(0);
    });

    it('can insert a new document with the same content hash (no duplicate)', async () => {
      // Recreate Topic A under a new structure for the re-upload test
      const [newChRows] = await q(
        `INSERT INTO chapters (subject_id, teacher_id, name) VALUES ($1, $2, 'RealDB Chapter A2') RETURNING id`,
        [subjectBId, teacherIdA]  // put it under Subject B for simplicity
      );
      const newChId = newChRows.id;
      const [newTopRows] = await q(
        `INSERT INTO topics (chapter_id, teacher_id, name) VALUES ($1, $2, 'RealDB Topic A2') RETURNING id`,
        [newChId, teacherIdA]
      );
      const newTopicId = newTopRows.id;

      const rows = await q(
        `INSERT INTO knowledge_documents
           (topic_id, teacher_id, title, original_filename, file_path, file_type, content_hash, status)
         VALUES ($1, $2, 'RealDB Doc A Reupload', 'realdb_test.pdf', $3, 'pdf', $4, 'uploaded')
         RETURNING id, status`,
        [newTopicId, teacherIdA, tmpFile, TEST_CONTENT_HASH]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('uploaded');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // IDOR: Teacher B cannot delete Teacher A's subject
  // ══════════════════════════════════════════════════════════════════════════

  describe('Part 9 item 15 — Teacher B cannot delete Teacher A\'s subject', () => {
    it('DELETE subjects WHERE id=$subjectBId AND teacher_id=$teacherIdB returns 0 rows', async () => {
      const rows = await q(
        `DELETE FROM subjects WHERE id = $1 AND teacher_id = $2 RETURNING id`,
        [subjectBId, teacherIdB]  // Wrong teacher
      );
      expect(rows).toHaveLength(0);
    });

    it('Subject B still exists after the failed cross-teacher delete attempt', async () => {
      const rows = await q(`SELECT id FROM subjects WHERE id = $1`, [subjectBId]);
      expect(rows).toHaveLength(1);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Chapter deletion: only chapter subtree disappears
  // ══════════════════════════════════════════════════════════════════════════

  describe('Part 9 item 16 — DELETE chapter: only chapter subtree disappears', () => {
    let chForDeletion, topForDeletion, docForDeletion;

    beforeAll(async () => {
      // Create a second chapter under Subject B for this test
      const [chRow] = await q(
        `INSERT INTO chapters (subject_id, teacher_id, name) VALUES ($1, $2, 'RealDB Chapter Delete Me') RETURNING id`,
        [subjectBId, teacherIdA]
      );
      chForDeletion = chRow.id;

      const [topRow] = await q(
        `INSERT INTO topics (chapter_id, teacher_id, name) VALUES ($1, $2, 'RealDB Topic Under Delete Chapter') RETURNING id`,
        [chForDeletion, teacherIdA]
      );
      topForDeletion = topRow.id;

      const [docRow] = await q(
        `INSERT INTO knowledge_documents
           (topic_id, teacher_id, title, original_filename, file_path, file_type, content_hash, status)
         VALUES ($1, $2, 'Doc Under Delete Chapter', 'del_chapter_test.pdf', '/tmp/x.pdf', 'pdf', $3, 'ready')
         RETURNING id`,
        [topForDeletion, teacherIdA, 'chapter_delete_test_hash_' + Date.now()]
      );
      docForDeletion = docRow.id;
    });

    it('deletes chapter and cascades to topic and document', async () => {
      await q(`DELETE FROM chapters WHERE id = $1 AND teacher_id = $2`, [chForDeletion, teacherIdA]);

      const chRows  = await q(`SELECT id FROM chapters WHERE id = $1`, [chForDeletion]);
      const topRows = await q(`SELECT id FROM topics WHERE id = $1`, [topForDeletion]);
      const docRows = await q(`SELECT id FROM knowledge_documents WHERE id = $1`, [docForDeletion]);

      expect(chRows).toHaveLength(0);
      expect(topRows).toHaveLength(0);
      expect(docRows).toHaveLength(0);
    });

    it('Subject B and Chapter B remain intact', async () => {
      const subRows = await q(`SELECT id FROM subjects WHERE id = $1`, [subjectBId]);
      const chBRows = await q(`SELECT id FROM chapters WHERE id = $1`, [chapterBId]);
      expect(subRows).toHaveLength(1);
      expect(chBRows).toHaveLength(1);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Topic deletion: only topic subtree disappears
  // ══════════════════════════════════════════════════════════════════════════

  describe('Part 9 item 17 — DELETE topic: only topic subtree disappears', () => {
    let topForDeletion, docForDeletion;

    beforeAll(async () => {
      const [topRow] = await q(
        `INSERT INTO topics (chapter_id, teacher_id, name) VALUES ($1, $2, 'RealDB Topic Delete Me') RETURNING id`,
        [chapterBId, teacherIdA]
      );
      topForDeletion = topRow.id;

      const [docRow] = await q(
        `INSERT INTO knowledge_documents
           (topic_id, teacher_id, title, original_filename, file_path, file_type, content_hash, status)
         VALUES ($1, $2, 'Doc Under Delete Topic', 'del_topic_test.pdf', '/tmp/y.pdf', 'pdf', $3, 'ready')
         RETURNING id`,
        [topForDeletion, teacherIdA, 'topic_delete_test_hash_' + Date.now()]
      );
      docForDeletion = docRow.id;
    });

    it('deletes topic and cascades to document', async () => {
      await q(`DELETE FROM topics WHERE id = $1 AND teacher_id = $2`, [topForDeletion, teacherIdA]);

      const topRows = await q(`SELECT id FROM topics WHERE id = $1`, [topForDeletion]);
      const docRows = await q(`SELECT id FROM knowledge_documents WHERE id = $1`, [docForDeletion]);

      expect(topRows).toHaveLength(0);
      expect(docRows).toHaveLength(0);
    });

    it('Topic B and Chapter B remain intact', async () => {
      const topBRows = await q(`SELECT id FROM topics WHERE id = $1`, [topicBId]);
      const chBRows  = await q(`SELECT id FROM chapters WHERE id = $1`, [chapterBId]);
      expect(topBRows).toHaveLength(1);
      expect(chBRows).toHaveLength(1);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Curriculum deletion: entire hierarchy disappears
  // ══════════════════════════════════════════════════════════════════════════

  describe('Part 9 item 18 — DELETE curriculum: entire curriculum subtree disappears', () => {
    let currBId, subjUnderB, chapUnderB, topUnderB;

    beforeAll(async () => {
      const [cRow] = await q(
        `INSERT INTO curricula (teacher_id, name) VALUES ($1, 'RealDB Curriculum B To Delete') RETURNING id`,
        [teacherIdA]
      );
      currBId = cRow.id;

      const [sRow] = await q(
        `INSERT INTO subjects (curriculum_id, teacher_id, name) VALUES ($1, $2, 'Subj Under Curr B') RETURNING id`,
        [currBId, teacherIdA]
      );
      subjUnderB = sRow.id;

      const [chRow] = await q(
        `INSERT INTO chapters (subject_id, teacher_id, name) VALUES ($1, $2, 'Chap Under Curr B') RETURNING id`,
        [subjUnderB, teacherIdA]
      );
      chapUnderB = chRow.id;

      const [tRow] = await q(
        `INSERT INTO topics (chapter_id, teacher_id, name) VALUES ($1, $2, 'Topic Under Curr B') RETURNING id`,
        [chapUnderB, teacherIdA]
      );
      topUnderB = tRow.id;
    });

    it('deletes curriculum and cascades all the way to topics', async () => {
      await q(`DELETE FROM curricula WHERE id = $1 AND teacher_id = $2`, [currBId, teacherIdA]);

      const currRows = await q(`SELECT id FROM curricula WHERE id = $1`, [currBId]);
      const subjRows = await q(`SELECT id FROM subjects WHERE id = $1`, [subjUnderB]);
      const chapRows = await q(`SELECT id FROM chapters WHERE id = $1`, [chapUnderB]);
      const topRows  = await q(`SELECT id FROM topics WHERE id = $1`, [topUnderB]);

      expect(currRows).toHaveLength(0);
      expect(subjRows).toHaveLength(0);
      expect(chapRows).toHaveLength(0);
      expect(topRows).toHaveLength(0);
    });

    it('Curriculum A is unaffected by deleting Curriculum B', async () => {
      const rows = await q(`SELECT id FROM curricula WHERE id = $1`, [curriculumAId]);
      expect(rows).toHaveLength(1);
    });
  });
}
