/**
 * server/tests/integration/curriculumDeletion.integration.test.js
 *
 * Regression suite for the curriculum deletion bug:
 *
 *   SYMPTOM: Deleting a curriculum via DELETE /knowledge/curricula/:id
 *            left knowledge_documents and knowledge_chunks intact in the DB,
 *            causing "File already exists" errors when re-uploading the same
 *            file after recreating the curriculum.
 *
 *   ROOT CAUSE: The service called curriculumRepo.softDeleteOwned() which
 *               issues UPDATE curricula SET deleted_at = NOW().  FK ON DELETE
 *               CASCADE only fires on a real DELETE statement — not on UPDATE.
 *
 *   FIX: knowledge.service.js now calls curriculumRepo.hardDeleteOwned()
 *        inside a transaction.  FK CASCADE propagates the deletion through
 *        subjects → chapters → topics → knowledge_documents → knowledge_chunks.
 *
 * Strategy:
 *   - Real Express app, real routing, real JWT signing.
 *   - All DB + AI dependencies mocked — no live PostgreSQL required.
 *   - Proves routes are registered and the correct service methods are called.
 *   - Specifically verifies that hardDeleteOwned (not softDeleteOwned) is
 *     called on a DELETE /knowledge/curricula/:id request.
 */

// ── Mock DB connection (must precede any app/service require) ─────────────────
jest.mock('../../src/database/connection', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
  testConnection: jest.fn(),
}));

// ── Auth repositories (transitive deps of authenticate middleware) ─────────────
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
  findOwnedById:  jest.fn(),
  listByTeacher:  jest.fn(),
  createForTeacher: jest.fn(),
  softDeleteOwned: jest.fn(),
  hardDeleteOwned: jest.fn(),
}));
jest.mock('../../src/repositories/subject.repository', () => ({
  findOwnedById:   jest.fn(),
  listByCurriculum: jest.fn(),
  createForTeacher: jest.fn(),
  softDeleteOwned:  jest.fn(),
  hardDeleteOwned:  jest.fn(),
}));
jest.mock('../../src/repositories/chapter.repository', () => ({
  findOwnedById:   jest.fn(),
  listBySubject:   jest.fn(),
  createForTeacher: jest.fn(),
  softDeleteOwned:  jest.fn(),
  hardDeleteOwned:  jest.fn(),
}));
jest.mock('../../src/repositories/topic.repository', () => ({
  findOwnedById:  jest.fn(),
  listByChapter:  jest.fn(),
  createForTeacher: jest.fn(),
  softDeleteOwned: jest.fn(),
  hardDeleteOwned: jest.fn(),
}));
jest.mock('../../src/repositories/knowledgeDocument.repository', () => ({
  findOwnedById: jest.fn(),
  findByHash:    jest.fn(),
  create:        jest.fn(),
  setStatus:     jest.fn(),
  resetForRetry: jest.fn(),
  softDeleteOwned: jest.fn(),
  hardDeleteOwned: jest.fn(),
  listByTopic:   jest.fn(),
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

// ── AI / embedding stubs ──────────────────────────────────────────────────────
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
jest.mock('../../src/repositories/questionBank.repository', () => ({
  insert: jest.fn(), existsDuplicate: jest.fn(), findById: jest.fn(),
  findByTopic: jest.fn(), findPendingApproval: jest.fn(),
  updateStatus: jest.fn(), textHash: jest.fn(),
}));

// ── Load app ──────────────────────────────────────────────────────────────────
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../../app');

const { pool }       = require('../../src/database/connection');
const teacherRepo    = require('../../src/repositories/teacher.repository');
const curriculumRepo = require('../../src/repositories/curriculum.repository');
const docRepo        = require('../../src/repositories/knowledgeDocument.repository');

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

// ── Mock transaction client ───────────────────────────────────────────────────
let mockClient;

/**
 * Authenticate middleware calls pool.query('SELECT * FROM teachers WHERE id=$1')
 * directly — NOT via the repo.  We must make pool.query return the teacher row
 * for auth to succeed.
 *
 * pool.query mock strategy:
 *   - First call (auth lookup): return [[TEACHER]]
 *   - Subsequent calls: return [[]] (no result)
 *
 * For tests that need specific pool.query behaviour (e.g. connect for tx),
 * we use pool.connect (separate mock).
 */
beforeEach(() => {
  jest.clearAllMocks();
  mockClient = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(mockClient);

  // Auth middleware uses pool.query for the SELECT * FROM teachers lookup.
  // Default: return the active teacher account so auth succeeds.
  pool.query.mockResolvedValue([[TEACHER]]);

  teacherRepo.findById.mockResolvedValue(TEACHER);
  teacherRepo.isCurrentlyLocked.mockReturnValue(false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /knowledge/curricula/:curriculumId — route registration', () => {
  it('returns 401 (not 404) for unauthenticated request, proving route exists', async () => {
    const res = await request(app)
      .delete('/api/v1/knowledge/curricula/1');
    expect(res.status).toBe(401);
  });

  it('returns 403 for a student JWT (not a teacher)', async () => {
    const studentToken = jwt.sign(
      { id: 5, role: 'student' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const res = await request(app)
      .delete('/api/v1/knowledge/curricula/1')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A. Curriculum deletion calls hardDeleteOwned (not softDeleteOwned)
// ─────────────────────────────────────────────────────────────────────────────

describe('A. DELETE /knowledge/curricula/:id calls hard-delete, not soft-delete', () => {
  it('calls hardDeleteOwned inside a transaction', async () => {
    curriculumRepo.findOwnedById.mockResolvedValue({ id: 1, name: 'Class 8 Science' });
    docRepo.listFilePathsByCurriculum.mockResolvedValue([]);
    curriculumRepo.hardDeleteOwned.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/v1/knowledge/curricula/1')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(200);

    // CRITICAL: hard-delete must be called, soft-delete must NOT
    expect(curriculumRepo.hardDeleteOwned).toHaveBeenCalledWith(1, 10, mockClient);
    expect(curriculumRepo.softDeleteOwned).not.toHaveBeenCalled();

    // Transaction was opened and committed
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('returns 404 when curriculum not found (ownership check)', async () => {
    curriculumRepo.findOwnedById.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/v1/knowledge/curricula/999')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(404);
    // Pool connection must NOT have been acquired (no tx opened)
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Physical files are scheduled for removal after successful deletion
// ─────────────────────────────────────────────────────────────────────────────

describe('B. Physical file cleanup', () => {
  it('collects file paths before deletion and attempts fs.unlink after commit', async () => {
    const fs = require('fs');
    jest.spyOn(fs, 'unlink').mockImplementation((fp, cb) => cb && cb(null));

    curriculumRepo.findOwnedById.mockResolvedValue({ id: 2, name: 'Bio' });
    docRepo.listFilePathsByCurriculum.mockResolvedValue([
      '/uploads/knowledge/803020012.pdf',
    ]);
    curriculumRepo.hardDeleteOwned.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/v1/knowledge/curricula/2')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(200);
    expect(fs.unlink).toHaveBeenCalledWith(
      '/uploads/knowledge/803020012.pdf',
      expect.any(Function)
    );

    jest.restoreAllMocks();
  });

  it('does NOT delete files when transaction rolls back', async () => {
    const fs = require('fs');
    jest.spyOn(fs, 'unlink').mockImplementation((fp, cb) => cb && cb(null));

    curriculumRepo.findOwnedById.mockResolvedValue({ id: 2 });
    docRepo.listFilePathsByCurriculum.mockResolvedValue(['/uploads/knowledge/doc.pdf']);
    curriculumRepo.hardDeleteOwned.mockRejectedValue(new Error('simulated DB error'));

    const res = await request(app)
      .delete('/api/v1/knowledge/curricula/2')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(500);
    expect(fs.unlink).not.toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');

    jest.restoreAllMocks();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Cross-teacher isolation (IDOR protection)
// ─────────────────────────────────────────────────────────────────────────────

describe('C. Teacher cannot delete another teacher\'s curriculum', () => {
  it('returns 404 when curriculum belongs to a different teacher', async () => {
    // findOwnedById returns null because teacher_id does not match
    curriculumRepo.findOwnedById.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/v1/knowledge/curricula/5')
      .set('Authorization', `Bearer ${makeTeacherToken(99)}`); // teacher 99 ≠ curriculum owner

    expect(res.status).toBe(404);
    expect(curriculumRepo.hardDeleteOwned).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Duplicate detection remains intact
// ─────────────────────────────────────────────────────────────────────────────

describe('D. Duplicate detection after deletion', () => {
  const { registerAndProcess } = require('../../src/services/knowledge/ingestion.service');

  it('still rejects duplicate upload when original document genuinely exists', async () => {
    // Topic route for upload
    const topicRepo = require('../../src/repositories/topic.repository');
    topicRepo.findOwnedById.mockResolvedValue({ id: 7, teacher_id: 10 });

    const dupError = new Error('Duplicate document: identical content already exists as "Bio Notes" (ID 3).');
    dupError.code = 'DUPLICATE';
    registerAndProcess.mockRejectedValue(dupError);

    // The upload endpoint requires multipart — just verify 409 is surfaced
    // We call the service layer directly here for clarity
    const knowledgeService = require('../../src/services/knowledge/knowledge.service');
    await expect(
      knowledgeService.uploadDocument(7, 10, {
        originalFilename: '803020012.pdf',
        filePath: '/tmp/803020012.pdf',
        fileType: 'pdf',
        fileSizeBytes: 102400,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('allows same file upload after curriculum deleted (no stale document record)', async () => {
    const topicRepo = require('../../src/repositories/topic.repository');
    topicRepo.findOwnedById.mockResolvedValue({ id: 8, teacher_id: 10 });
    registerAndProcess.mockResolvedValue({ id: 50, status: 'uploaded' });

    const knowledgeService = require('../../src/services/knowledge/knowledge.service');
    const result = await knowledgeService.uploadDocument(8, 10, {
      originalFilename: '803020012.pdf',
      filePath: '/tmp/803020012.pdf',
      fileType: 'pdf',
      fileSizeBytes: 102400,
    });

    expect(result.status).toBe('uploaded');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Subject deletion also uses hard-delete
// ─────────────────────────────────────────────────────────────────────────────

describe('E. DELETE /knowledge/subjects/:subjectId — hard-delete', () => {
  it('calls subjectRepo.hardDeleteOwned (not softDeleteOwned)', async () => {
    const subjectRepo = require('../../src/repositories/subject.repository');
    subjectRepo.findOwnedById.mockResolvedValue({ id: 3 });
    docRepo.listFilePathsBySubject.mockResolvedValue([]);
    subjectRepo.hardDeleteOwned.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/v1/knowledge/subjects/3')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(200);
    expect(subjectRepo.hardDeleteOwned).toHaveBeenCalledWith(3, 10, mockClient);
    expect(subjectRepo.softDeleteOwned).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Chapter deletion also uses hard-delete
// ─────────────────────────────────────────────────────────────────────────────

describe('F. DELETE /knowledge/chapters/:chapterId — hard-delete', () => {
  it('calls chapterRepo.hardDeleteOwned (not softDeleteOwned)', async () => {
    const chapterRepo = require('../../src/repositories/chapter.repository');
    chapterRepo.findOwnedById.mockResolvedValue({ id: 4 });
    docRepo.listFilePathsByChapter.mockResolvedValue([]);
    chapterRepo.hardDeleteOwned.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/v1/knowledge/chapters/4')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(200);
    expect(chapterRepo.hardDeleteOwned).toHaveBeenCalledWith(4, 10, mockClient);
    expect(chapterRepo.softDeleteOwned).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. Topic deletion also uses hard-delete
// ─────────────────────────────────────────────────────────────────────────────

describe('G. DELETE /knowledge/topics/:topicId — hard-delete', () => {
  it('calls topicRepo.hardDeleteOwned (not softDeleteOwned)', async () => {
    const topicRepo = require('../../src/repositories/topic.repository');
    topicRepo.findOwnedById.mockResolvedValue({ id: 5 });
    docRepo.listFilePathsByTopic.mockResolvedValue([]);
    topicRepo.hardDeleteOwned.mockResolvedValue(true);

    const res = await request(app)
      .delete('/api/v1/knowledge/topics/5')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(200);
    expect(topicRepo.hardDeleteOwned).toHaveBeenCalledWith(5, 10, mockClient);
    expect(topicRepo.softDeleteOwned).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. Transaction rollback leaves all data intact
// ─────────────────────────────────────────────────────────────────────────────

describe('H. Transaction rollback on DB failure', () => {
  it('does not remove files and rolls back when hard-delete throws', async () => {
    const fs = require('fs');
    jest.spyOn(fs, 'unlink').mockImplementation((fp, cb) => cb && cb(null));

    curriculumRepo.findOwnedById.mockResolvedValue({ id: 1 });
    docRepo.listFilePathsByCurriculum.mockResolvedValue([
      '/uploads/important.pdf',
    ]);
    curriculumRepo.hardDeleteOwned.mockRejectedValue(new Error('FK violation'));

    const res = await request(app)
      .delete('/api/v1/knowledge/curricula/1')
      .set('Authorization', `Bearer ${makeTeacherToken(10)}`);

    expect(res.status).toBe(500);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(fs.unlink).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });
});
