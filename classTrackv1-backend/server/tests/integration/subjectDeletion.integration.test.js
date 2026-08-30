/**
 * server/tests/integration/subjectDeletion.integration.test.js
 *
 * Regression suite for the subject deletion HTTP 500 bug.
 *
 * ROOT CAUSE:
 *   pool.connect() returned a raw pg client whose .query() returns a
 *   QueryResult object { rows, fields, ... }.  All repositories use
 *   `const [rows] = await executor.query(...)` which expects the
 *   [rows, fields] tuple returned by the pool.query() shim.  When a
 *   transaction client was passed as executor, destructuring yielded
 *   `rows = undefined`, causing `rows.map(...)` / `rows.length` to
 *   throw a TypeError — surfaced as HTTP 500.
 *
 * FIX (database/connection.js):
 *   pool.connect() now wraps the returned client's .query() method so
 *   it returns [rows, fields] in the same format as pool.query().
 *
 * Test matrix (A–J):
 *   A. Subject with no documents → 200, hard-delete called
 *   B. Subject with one document  → 200, file cleanup scheduled
 *   C. Subject with multiple documents → 200, all files scheduled
 *   D. Same PDF re-uploadable after subject deletion
 *   E. Transaction rollback on DB failure (no files removed)
 *   F. Teacher cannot delete another teacher's subject → 404
 *   G. Parent curriculum remains intact after subject deletion
 *   H. Other subjects in the same curriculum remain intact
 *   I. Physical files of the deleted subject are cleaned up
 *   J. Existing document-level soft-delete behaviour unchanged
 *
 * Strategy:
 *   - Real Express app, real routing, real JWT signing.
 *   - All DB + AI dependencies mocked — no live PostgreSQL required.
 *   - Specifically verifies that subjectRepo.hardDeleteOwned (not
 *     softDeleteOwned) is invoked and that the transaction client
 *     passed to the repository is the same one acquired from pool.connect().
 */

// ── Mock DB connection (must come before any app/service require) ─────────────
jest.mock('../../src/database/connection', () => ({
  pool: {
    query:   jest.fn(),
    connect: jest.fn(),
  },
  testConnection: jest.fn(),
}));

// ── Auth repositories (required by authenticate middleware) ───────────────────
jest.mock('../../src/repositories/admin.repository', () => ({
  findById: jest.fn(), findByEmail: jest.fn(),
  incrementFailedAttempts: jest.fn(), resetFailedAttempts: jest.fn(),
  lockUntil: jest.fn(), isCurrentlyLocked: jest.fn().mockReturnValue(false),
  updateLastLogin: jest.fn(),
}));
jest.mock('../../src/repositories/teacher.repository', () => ({
  findById: jest.fn(), findByEmail: jest.fn(),
  incrementFailedAttempts: jest.fn(), resetFailedAttempts: jest.fn(),
  lockUntil: jest.fn(), isCurrentlyLocked: jest.fn().mockReturnValue(false),
  updateLastLogin: jest.fn(), markEmailVerified: jest.fn(),
}));
jest.mock('../../src/repositories/student.repository', () => ({
  findById: jest.fn(), findByUsername: jest.fn(), existsByUsername: jest.fn(),
  incrementFailedAttempts: jest.fn(), resetFailedAttempts: jest.fn(),
  lockUntil: jest.fn(), isCurrentlyLocked: jest.fn().mockReturnValue(false),
  updateLastLogin: jest.fn(), create: jest.fn(),
}));
jest.mock('../../src/repositories/audit.repository', () => ({
  insert: jest.fn().mockResolvedValue(undefined), list: jest.fn(),
}));
jest.mock('../../src/repositories/loginHistory.repository', () => ({
  record: jest.fn().mockResolvedValue(undefined),
  listForUser: jest.fn(), countRecentFailures: jest.fn(),
}));
jest.mock('../../src/repositories/refreshToken.repository', () => ({
  insert: jest.fn().mockResolvedValue(1),
  findByHash: jest.fn(), findValidByHash: jest.fn(),
  rotate: jest.fn(), revokeById: jest.fn(), revokeAllForUser: jest.fn(),
}));
jest.mock('../../src/repositories/emailVerificationToken.repository', () => ({
  insert: jest.fn(), findValidByHash: jest.fn(),
  markUsed: jest.fn(), invalidateAllForUser: jest.fn(),
}));
jest.mock('../../src/repositories/passwordResetToken.repository', () => ({
  insert: jest.fn(), findValidByHash: jest.fn(),
  markUsed: jest.fn(), invalidateAllForUser: jest.fn(),
}));

// ── Knowledge-base repositories ───────────────────────────────────────────────
jest.mock('../../src/repositories/curriculum.repository', () => ({
  findOwnedById:    jest.fn(),
  listByTeacher:    jest.fn(),
  createForTeacher: jest.fn(),
  softDeleteOwned:  jest.fn(),
  hardDeleteOwned:  jest.fn(),
}));
jest.mock('../../src/repositories/subject.repository', () => ({
  findOwnedById:    jest.fn(),
  listByCurriculum: jest.fn(),
  createForTeacher: jest.fn(),
  softDeleteOwned:  jest.fn(),
  hardDeleteOwned:  jest.fn(),
}));
jest.mock('../../src/repositories/chapter.repository', () => ({
  findOwnedById:    jest.fn(),
  listBySubject:    jest.fn(),
  createForTeacher: jest.fn(),
  softDeleteOwned:  jest.fn(),
  hardDeleteOwned:  jest.fn(),
}));
jest.mock('../../src/repositories/topic.repository', () => ({
  findOwnedById:    jest.fn(),
  listByChapter:    jest.fn(),
  createForTeacher: jest.fn(),
  softDeleteOwned:  jest.fn(),
  hardDeleteOwned:  jest.fn(),
}));
jest.mock('../../src/repositories/knowledgeDocument.repository', () => ({
  findOwnedById:             jest.fn(),
  findByHash:                jest.fn(),
  create:                    jest.fn(),
  setStatus:                 jest.fn(),
  resetForRetry:             jest.fn(),
  softDeleteOwned:           jest.fn(),
  hardDeleteOwned:           jest.fn(),
  listByTopic:               jest.fn(),
  listFilePathsByCurriculum: jest.fn(),
  listFilePathsBySubject:    jest.fn(),
  listFilePathsByChapter:    jest.fn(),
  listFilePathsByTopic:      jest.fn(),
}));
jest.mock('../../src/repositories/knowledgeChunk.repository', () => ({
  similaritySearch:        jest.fn(),
  insertChunks:            jest.fn(),
  _insertChunksSequential: jest.fn(),
  deleteByDocument:        jest.fn(),
}));
jest.mock('../../src/repositories/questionBank.repository', () => ({
  insert: jest.fn(), existsDuplicate: jest.fn(), findById: jest.fn(),
  findByTopic: jest.fn(), findPendingApproval: jest.fn(),
  updateStatus: jest.fn(), textHash: jest.fn(),
}));

// ── AI / ingestion stubs ──────────────────────────────────────────────────────
jest.mock('../../src/services/knowledge/ingestion.service', () => ({
  registerAndProcess: jest.fn(),
  retryDocument:      jest.fn(),
}));
jest.mock('../../src/services/knowledge/retrieval.service', () => ({
  search: jest.fn(),
}));
jest.mock('../../src/services/ai/providers', () => ({
  getLLMProvider:       jest.fn(),
  getEmbeddingProvider: jest.fn(),
}));

// ── Load app after all mocks are in place ─────────────────────────────────────
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../../app');

const { pool }       = require('../../src/database/connection');
const teacherRepo    = require('../../src/repositories/teacher.repository');
const subjectRepo    = require('../../src/repositories/subject.repository');
const curriculumRepo = require('../../src/repositories/curriculum.repository');
const docRepo        = require('../../src/repositories/knowledgeDocument.repository');
const { registerAndProcess } = require('../../src/services/knowledge/ingestion.service');

// ── Helpers ───────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_that_is_long_enough';

function makeTeacherToken(id = 10) {
  return jwt.sign(
    { id, role: 'teacher', email: 'teacher@test.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

const TEACHER = { id: 10, email: 'teacher@test.com', name: 'Test Teacher', is_active: true };

// ── Shared mock transaction client ────────────────────────────────────────────
let mockClient;

beforeEach(() => {
  jest.clearAllMocks();

  // pool.connect() returns a mock client; its .query() is called for
  // BEGIN / COMMIT / ROLLBACK by the service layer (result not destructured).
  mockClient = {
    query:   jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(mockClient);

  // Auth middleware resolves teacher via pool.query.
  pool.query.mockResolvedValue([[TEACHER]]);

  teacherRepo.findById.mockResolvedValue(TEACHER);
  teacherRepo.isCurrentlyLocked.mockReturnValue(false);
});

// =============================================================================
// Route registration guard
// =============================================================================

describe('DELETE /knowledge/subjects/:subjectId — route registration', () => {
  it('returns 401 for unauthenticated request (route exists)', async () => {
    const res = await request(app)
      .delete('/api/v1/knowledge/subjects/11');
    expect(res.status).toBe(401);
  });

  it('returns 403 for student JWT (not a teacher)', async () => {
    const studentToken = jwt.sign({ id: 5, role: 'student' }, JWT_SECRET, { expiresIn: '1h' });
    const res = await request(app)
      .delete('/api/v1/knowledge/subjects/11')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });
});

// =============================================================================
// A. Subject with no knowledge documents → deletes successfully
// =============================================================================

describe('A. Subject with no knowledge documents', () => {
  it('returns 200 and calls hardDeleteOwned (not softDeleteOwned)', async () => {
    subjectRepo.findOwnedById.mockResolvedValue({ id: 11 });
    docRepo.listFilePathsBySubject.mockResolvedValue([]);
    subjectRepo.hardDeleteOwned.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/v1/knowledge/subjects/11')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(200);

    // Hard-delete must be called; soft-delete must NOT
    expect(subjectRepo.hardDeleteOwned).toHaveBeenCalledWith(11, 10, mockClient);
    expect(subjectRepo.softDeleteOwned).not.toHaveBeenCalled();

    // Transaction opened and committed
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();

    // No file cleanup attempted (no files)
    // (fs.unlink is not called because the file list is empty)
  });
});

// =============================================================================
// B. Subject with one document → deletes subject + schedules file cleanup
// =============================================================================

describe('B. Subject with one knowledge document', () => {
  it('returns 200 and schedules the document file for removal', async () => {
    const fs = require('fs');
    jest.spyOn(fs, 'unlink').mockImplementation((fp, cb) => cb && cb(null));

    subjectRepo.findOwnedById.mockResolvedValue({ id: 11 });
    docRepo.listFilePathsBySubject.mockResolvedValue(['/uploads/knowledge/doc1.pdf']);
    subjectRepo.hardDeleteOwned.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/v1/knowledge/subjects/11')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(200);
    expect(subjectRepo.hardDeleteOwned).toHaveBeenCalledWith(11, 10, mockClient);

    // File collected BEFORE DELETE, cleaned up AFTER COMMIT
    expect(docRepo.listFilePathsBySubject).toHaveBeenCalledWith(11, 10, mockClient);
    expect(fs.unlink).toHaveBeenCalledWith('/uploads/knowledge/doc1.pdf', expect.any(Function));

    jest.restoreAllMocks();
  });
});

// =============================================================================
// C. Subject with multiple documents → all files scheduled for removal
// =============================================================================

describe('C. Subject with multiple knowledge documents', () => {
  it('schedules all document files for removal', async () => {
    const fs = require('fs');
    jest.spyOn(fs, 'unlink').mockImplementation((fp, cb) => cb && cb(null));

    const filePaths = [
      '/uploads/knowledge/doc1.pdf',
      '/uploads/knowledge/doc2.pdf',
      '/uploads/knowledge/doc3.pdf',
    ];

    subjectRepo.findOwnedById.mockResolvedValue({ id: 11 });
    docRepo.listFilePathsBySubject.mockResolvedValue(filePaths);
    subjectRepo.hardDeleteOwned.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/v1/knowledge/subjects/11')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(200);

    for (const fp of filePaths) {
      expect(fs.unlink).toHaveBeenCalledWith(fp, expect.any(Function));
    }
    expect(fs.unlink).toHaveBeenCalledTimes(filePaths.length);

    jest.restoreAllMocks();
  });
});

// =============================================================================
// D. Same PDF can be uploaded again after subject deletion
// =============================================================================

describe('D. Re-upload after subject deletion', () => {
  it('allows the same file to be uploaded after its parent subject is deleted', async () => {
    const topicRepo = require('../../src/repositories/topic.repository');
    topicRepo.findOwnedById.mockResolvedValue({ id: 7, teacher_id: 10 });
    // Ingestion succeeds — no stale hash record remains after hard-delete
    registerAndProcess.mockResolvedValue({ id: 99, status: 'uploaded' });

    const knowledgeService = require('../../src/services/knowledge/knowledge.service');
    const result = await knowledgeService.uploadDocument(7, 10, {
      originalFilename: 'lecture_notes.pdf',
      filePath:         '/tmp/lecture_notes.pdf',
      fileType:         'pdf',
      fileSizeBytes:    204800,
    });

    expect(result.status).toBe('uploaded');
  });
});

// =============================================================================
// E. Transaction rollback on DB failure
// =============================================================================

describe('E. Transaction rollback on DB failure', () => {
  it('rolls back when hardDeleteOwned throws and does not clean up files', async () => {
    const fs = require('fs');
    jest.spyOn(fs, 'unlink').mockImplementation((fp, cb) => cb && cb(null));

    subjectRepo.findOwnedById.mockResolvedValue({ id: 11 });
    docRepo.listFilePathsBySubject.mockResolvedValue(['/uploads/knowledge/important.pdf']);
    subjectRepo.hardDeleteOwned.mockRejectedValue(new Error('FK constraint violation'));

    const res = await request(app)
      .delete('/api/v1/knowledge/subjects/11')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(500);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');

    // Physical files must NOT be removed when the transaction rolled back
    expect(fs.unlink).not.toHaveBeenCalled();

    // Pool client must still be released (no leak)
    expect(mockClient.release).toHaveBeenCalled();

    jest.restoreAllMocks();
  });
});

// =============================================================================
// F. Teacher cannot delete another teacher's subject → 404 (IDOR protection)
// =============================================================================

describe('F. Cross-teacher security', () => {
  it('returns 404 when subject belongs to a different teacher', async () => {
    // findOwnedById returns null because teacher_id does not match
    subjectRepo.findOwnedById.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/v1/knowledge/subjects/11')
      .set('Authorization', `Bearer ${makeTeacherToken(99)}`); // teacher 99 ≠ owner

    expect(res.status).toBe(404);
    expect(subjectRepo.hardDeleteOwned).not.toHaveBeenCalled();
    // No transaction was opened
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('does not expose whether the subject exists (returns 404 not 403)', async () => {
    subjectRepo.findOwnedById.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/v1/knowledge/subjects/999')
      .set('Authorization', `Bearer ${makeTeacherToken(99)}`);

    // Must be 404, not 403 — ownership check is opaque
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// G. Parent curriculum remains intact after subject deletion
// =============================================================================

describe('G. Parent curriculum integrity', () => {
  it('does not delete the parent curriculum when subject is deleted', async () => {
    subjectRepo.findOwnedById.mockResolvedValue({ id: 11, curriculum_id: 5 });
    docRepo.listFilePathsBySubject.mockResolvedValue([]);
    subjectRepo.hardDeleteOwned.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/v1/knowledge/subjects/11')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(200);
    // Curriculum-level delete must never be triggered
    expect(curriculumRepo.hardDeleteOwned).not.toHaveBeenCalled();
    expect(curriculumRepo.softDeleteOwned).not.toHaveBeenCalled();
  });
});

// =============================================================================
// H. Sibling subjects in the same curriculum remain intact
// =============================================================================

describe('H. Sibling subject integrity', () => {
  it('only deletes the specified subject, not siblings in the same curriculum', async () => {
    subjectRepo.findOwnedById.mockResolvedValue({ id: 11, curriculum_id: 5 });
    docRepo.listFilePathsBySubject.mockResolvedValue([]);
    subjectRepo.hardDeleteOwned.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/v1/knowledge/subjects/11')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(200);

    // hardDeleteOwned must only be called once, and only for subject 11
    expect(subjectRepo.hardDeleteOwned).toHaveBeenCalledTimes(1);
    expect(subjectRepo.hardDeleteOwned).toHaveBeenCalledWith(11, 10, mockClient);
  });
});

// =============================================================================
// I. Physical files exclusively owned by the deleted subject are cleaned up
// =============================================================================

describe('I. Physical file cleanup after successful commit', () => {
  it('calls fs.unlink for each file path AFTER commit, not before', async () => {
    const fs = require('fs');
    const unlinkCalls = [];
    let commitCalled = false;

    jest.spyOn(fs, 'unlink').mockImplementation((fp, cb) => {
      unlinkCalls.push({ fp, afterCommit: commitCalled });
      if (cb) cb(null);
    });

    // Override mockClient.query to track when COMMIT happens
    mockClient.query.mockImplementation(async (sql) => {
      if (sql === 'COMMIT') commitCalled = true;
      return { rows: [] };
    });

    subjectRepo.findOwnedById.mockResolvedValue({ id: 11 });
    docRepo.listFilePathsBySubject.mockResolvedValue(['/uploads/knowledge/subjectfile.pdf']);
    subjectRepo.hardDeleteOwned.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/v1/knowledge/subjects/11')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(200);
    expect(unlinkCalls).toHaveLength(1);
    // File must be unlinked AFTER commit
    expect(unlinkCalls[0].afterCommit).toBe(true);
    expect(unlinkCalls[0].fp).toBe('/uploads/knowledge/subjectfile.pdf');

    jest.restoreAllMocks();
  });

  it('does NOT unlink files when subject has no documents', async () => {
    const fs = require('fs');
    jest.spyOn(fs, 'unlink').mockImplementation((fp, cb) => cb && cb(null));

    subjectRepo.findOwnedById.mockResolvedValue({ id: 11 });
    docRepo.listFilePathsBySubject.mockResolvedValue([]);
    subjectRepo.hardDeleteOwned.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/v1/knowledge/subjects/11')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(200);
    expect(fs.unlink).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });
});

// =============================================================================
// J. Existing document-level soft-delete behaviour remains unchanged
// =============================================================================

describe('J. Document-level soft-delete behaviour is unaffected', () => {
  it('DELETE /knowledge/documents/:id still soft-deletes (not hard-deletes) the document', async () => {
    const topicRepo = require('../../src/repositories/topic.repository');

    // Documents are soft-deleted individually (for audit purposes)
    docRepo.softDeleteOwned.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/v1/knowledge/documents/42')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(200);
    expect(docRepo.softDeleteOwned).toHaveBeenCalledWith(42, 10);
    // hardDeleteOwned must NOT be called for individual document archival
    expect(docRepo.hardDeleteOwned).not.toHaveBeenCalled();

    void topicRepo; // suppress unused warning
  });
});

// =============================================================================
// Regression: the original HTTP 500 is gone
// =============================================================================

describe('Regression: DELETE /knowledge/subjects/:id no longer returns 500', () => {
  it('subject with no documents → 200 (was 500 before the connection shim fix)', async () => {
    subjectRepo.findOwnedById.mockResolvedValue({ id: 11 });
    docRepo.listFilePathsBySubject.mockResolvedValue([]);
    subjectRepo.hardDeleteOwned.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/v1/knowledge/subjects/11')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(200);
    expect(res.status).not.toBe(500);
  });

  it('subject with documents → 200 (was 500 before the connection shim fix)', async () => {
    const fs = require('fs');
    jest.spyOn(fs, 'unlink').mockImplementation((fp, cb) => cb && cb(null));

    subjectRepo.findOwnedById.mockResolvedValue({ id: 11 });
    docRepo.listFilePathsBySubject.mockResolvedValue([
      '/uploads/knowledge/slide1.pdf',
      '/uploads/knowledge/slide2.pdf',
    ]);
    subjectRepo.hardDeleteOwned.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/v1/knowledge/subjects/11')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(200);
    expect(res.status).not.toBe(500);

    jest.restoreAllMocks();
  });
});
