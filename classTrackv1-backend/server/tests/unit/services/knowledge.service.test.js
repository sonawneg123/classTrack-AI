/**
 * server/tests/unit/services/knowledge.service.test.js
 *
 * Tests for KnowledgeService business logic — all repositories and the DB
 * pool mocked.
 *
 * Covers:
 *   - ownership guards
 *   - duplicate detection
 *   - retry / status enforcement
 *   - hard-delete cascade (curriculum, subject, chapter, topic)
 *   - physical file cleanup after successful delete
 *   - transaction rollback on delete failure
 *   - cross-teacher isolation
 */

// ── Mock DB pool (needed by knowledge.service for transactions) ───────────────
jest.mock('../../../src/database/connection', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
  testConnection: jest.fn(),
}));

jest.mock('../../../src/repositories/curriculum.repository', () => ({
  findOwnedById: jest.fn(),
  listByTeacher: jest.fn(),
  createForTeacher: jest.fn(),
  softDeleteOwned: jest.fn(),
  hardDeleteOwned: jest.fn(),
}));
jest.mock('../../../src/repositories/subject.repository', () => ({
  findOwnedById: jest.fn(),
  listByCurriculum: jest.fn(),
  createForTeacher: jest.fn(),
  softDeleteOwned: jest.fn(),
  hardDeleteOwned: jest.fn(),
}));
jest.mock('../../../src/repositories/chapter.repository', () => ({
  findOwnedById: jest.fn(),
  listBySubject: jest.fn(),
  createForTeacher: jest.fn(),
  softDeleteOwned: jest.fn(),
  hardDeleteOwned: jest.fn(),
}));
jest.mock('../../../src/repositories/topic.repository', () => ({
  findOwnedById: jest.fn(),
  listByChapter: jest.fn(),
  createForTeacher: jest.fn(),
  softDeleteOwned: jest.fn(),
  hardDeleteOwned: jest.fn(),
}));
jest.mock('../../../src/repositories/knowledgeDocument.repository', () => ({
  findOwnedById: jest.fn(),
  findByHash: jest.fn(),
  create: jest.fn(),
  setStatus: jest.fn(),
  resetForRetry: jest.fn(),
  softDeleteOwned: jest.fn(),
  listByTopic: jest.fn(),
  listFilePathsByCurriculum: jest.fn(),
  listFilePathsBySubject: jest.fn(),
  listFilePathsByChapter: jest.fn(),
  listFilePathsByTopic: jest.fn(),
  hardDeleteOwned: jest.fn(),
}));
jest.mock('../../../src/repositories/knowledgeChunk.repository', () => ({
  similaritySearch: jest.fn(),
}));
jest.mock('../../../src/services/knowledge/ingestion.service', () => ({
  registerAndProcess: jest.fn(),
  retryDocument: jest.fn(),
  recoverStuckDocuments: jest.fn(),
}));
jest.mock('../../../src/services/knowledge/retrieval.service', () => ({
  search: jest.fn(),
}));

// Mock fs.unlink used by _deletePhysicalFiles
const fs = require('fs');
jest.spyOn(fs, 'unlink').mockImplementation((fp, cb) => cb && cb(null));

const { pool } = require('../../../src/database/connection');
const knowledgeService = require('../../../src/services/knowledge/knowledge.service');
const curriculumRepo = require('../../../src/repositories/curriculum.repository');
const subjectRepo    = require('../../../src/repositories/subject.repository');
const chapterRepo    = require('../../../src/repositories/chapter.repository');
const topicRepo      = require('../../../src/repositories/topic.repository');
const docRepo        = require('../../../src/repositories/knowledgeDocument.repository');
const { registerAndProcess, retryDocument } = require('../../../src/services/knowledge/ingestion.service');
const { search } = require('../../../src/services/knowledge/retrieval.service');

// ── Shared mock client for transaction tests ──────────────────────────────────
let mockClient;

beforeEach(() => {
  jest.clearAllMocks();
  fs.unlink.mockImplementation((fp, cb) => cb && cb(null));

  mockClient = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(mockClient);
});

// ─── Curricula ────────────────────────────────────────────────────────────────

describe('knowledgeService.getCurriculum', () => {
  it('throws 404 when curriculum not found or not owned', async () => {
    curriculumRepo.findOwnedById.mockResolvedValue(null);
    await expect(knowledgeService.getCurriculum(999, 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns curriculum when owned', async () => {
    const c = { id: 1, name: 'Bio 101' };
    curriculumRepo.findOwnedById.mockResolvedValue(c);
    await expect(knowledgeService.getCurriculum(1, 1)).resolves.toEqual(c);
  });
});

describe('knowledgeService.deleteCurriculum', () => {
  it('throws 404 when curriculum not found (ownership check)', async () => {
    curriculumRepo.findOwnedById.mockResolvedValue(null);
    await expect(knowledgeService.deleteCurriculum(999, 1)).rejects.toMatchObject({ statusCode: 404 });
    // Transaction must not have been opened
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('hard-deletes and collects file paths inside a transaction', async () => {
    curriculumRepo.findOwnedById.mockResolvedValue({ id: 1, name: 'Sci' });
    docRepo.listFilePathsByCurriculum.mockResolvedValue(['/uploads/a.pdf', '/uploads/b.pdf']);
    curriculumRepo.hardDeleteOwned.mockResolvedValue(true);

    await knowledgeService.deleteCurriculum(1, 1);

    // Transaction lifecycle
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();

    // Hard-delete was called (not soft-delete)
    expect(curriculumRepo.hardDeleteOwned).toHaveBeenCalledWith(1, 1, mockClient);
    expect(curriculumRepo.softDeleteOwned).not.toHaveBeenCalled();

    // Physical files scheduled for removal
    expect(fs.unlink).toHaveBeenCalledWith('/uploads/a.pdf', expect.any(Function));
    expect(fs.unlink).toHaveBeenCalledWith('/uploads/b.pdf', expect.any(Function));
  });

  it('rolls back and re-throws when hard-delete returns false inside transaction', async () => {
    curriculumRepo.findOwnedById.mockResolvedValue({ id: 1 });
    docRepo.listFilePathsByCurriculum.mockResolvedValue([]);
    curriculumRepo.hardDeleteOwned.mockResolvedValue(false);

    await expect(knowledgeService.deleteCurriculum(1, 1)).rejects.toMatchObject({ statusCode: 404 });

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it('rolls back and re-throws when DB throws during deletion', async () => {
    curriculumRepo.findOwnedById.mockResolvedValue({ id: 1 });
    docRepo.listFilePathsByCurriculum.mockResolvedValue(['/uploads/x.pdf']);
    curriculumRepo.hardDeleteOwned.mockRejectedValue(new Error('DB error'));

    await expect(knowledgeService.deleteCurriculum(1, 1)).rejects.toThrow('DB error');

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
    // Physical file must NOT be removed when the transaction failed
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it('does not call soft-delete at all', async () => {
    curriculumRepo.findOwnedById.mockResolvedValue({ id: 1 });
    docRepo.listFilePathsByCurriculum.mockResolvedValue([]);
    curriculumRepo.hardDeleteOwned.mockResolvedValue(true);

    await knowledgeService.deleteCurriculum(1, 1);

    expect(curriculumRepo.softDeleteOwned).not.toHaveBeenCalled();
  });
});

// ─── Subjects ─────────────────────────────────────────────────────────────────

describe('knowledgeService.createSubject', () => {
  it('requires curriculum to exist and be owned', async () => {
    curriculumRepo.findOwnedById.mockResolvedValue(null);
    await expect(
      knowledgeService.createSubject(99, 1, { name: 'Math' })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(subjectRepo.createForTeacher).not.toHaveBeenCalled();
  });

  it('creates subject when curriculum is owned', async () => {
    curriculumRepo.findOwnedById.mockResolvedValue({ id: 1 });
    subjectRepo.createForTeacher.mockResolvedValue({ id: 5, name: 'Math' });
    const result = await knowledgeService.createSubject(1, 2, { name: 'Math' });
    expect(result).toEqual({ id: 5, name: 'Math' });
  });
});

describe('knowledgeService.deleteSubject', () => {
  it('throws 404 when subject not found', async () => {
    subjectRepo.findOwnedById.mockResolvedValue(null);
    await expect(knowledgeService.deleteSubject(99, 1)).rejects.toMatchObject({ statusCode: 404 });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('hard-deletes subject with file cleanup', async () => {
    subjectRepo.findOwnedById.mockResolvedValue({ id: 2 });
    docRepo.listFilePathsBySubject.mockResolvedValue(['/uploads/s.pdf']);
    subjectRepo.hardDeleteOwned.mockResolvedValue(true);

    await knowledgeService.deleteSubject(2, 1);

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(subjectRepo.hardDeleteOwned).toHaveBeenCalledWith(2, 1, mockClient);
    expect(subjectRepo.softDeleteOwned).not.toHaveBeenCalled();
    expect(fs.unlink).toHaveBeenCalledWith('/uploads/s.pdf', expect.any(Function));
  });

  it('rolls back on DB error', async () => {
    subjectRepo.findOwnedById.mockResolvedValue({ id: 2 });
    docRepo.listFilePathsBySubject.mockResolvedValue([]);
    subjectRepo.hardDeleteOwned.mockRejectedValue(new Error('constraint violation'));

    await expect(knowledgeService.deleteSubject(2, 1)).rejects.toThrow('constraint violation');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });
});

// ─── Chapters ─────────────────────────────────────────────────────────────────

describe('knowledgeService.createChapter', () => {
  it('requires subject to be owned', async () => {
    subjectRepo.findOwnedById.mockResolvedValue(null);
    await expect(
      knowledgeService.createChapter(99, 1, { name: 'Chapter 1' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('creates chapter when subject is owned', async () => {
    subjectRepo.findOwnedById.mockResolvedValue({ id: 1 });
    chapterRepo.createForTeacher.mockResolvedValue({ id: 3, name: 'Chapter 1' });
    const result = await knowledgeService.createChapter(1, 2, { name: 'Chapter 1' });
    expect(result.name).toBe('Chapter 1');
  });
});

describe('knowledgeService.deleteChapter', () => {
  it('throws 404 when chapter not found', async () => {
    chapterRepo.findOwnedById.mockResolvedValue(null);
    await expect(knowledgeService.deleteChapter(99, 1)).rejects.toMatchObject({ statusCode: 404 });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('hard-deletes chapter with file cleanup', async () => {
    chapterRepo.findOwnedById.mockResolvedValue({ id: 3 });
    docRepo.listFilePathsByChapter.mockResolvedValue(['/uploads/c1.pdf', '/uploads/c2.pdf']);
    chapterRepo.hardDeleteOwned.mockResolvedValue(true);

    await knowledgeService.deleteChapter(3, 1);

    expect(chapterRepo.hardDeleteOwned).toHaveBeenCalledWith(3, 1, mockClient);
    expect(chapterRepo.softDeleteOwned).not.toHaveBeenCalled();
    expect(fs.unlink).toHaveBeenCalledTimes(2);
  });

  it('rolls back on DB error', async () => {
    chapterRepo.findOwnedById.mockResolvedValue({ id: 3 });
    docRepo.listFilePathsByChapter.mockResolvedValue([]);
    chapterRepo.hardDeleteOwned.mockRejectedValue(new Error('tx error'));

    await expect(knowledgeService.deleteChapter(3, 1)).rejects.toThrow('tx error');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(fs.unlink).not.toHaveBeenCalled();
  });
});

// ─── Topics ───────────────────────────────────────────────────────────────────

describe('knowledgeService.createTopic', () => {
  it('requires chapter to be owned', async () => {
    chapterRepo.findOwnedById.mockResolvedValue(null);
    await expect(
      knowledgeService.createTopic(99, 1, { name: 'Topic A' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('knowledgeService.deleteTopic', () => {
  it('throws 404 when topic not found', async () => {
    topicRepo.findOwnedById.mockResolvedValue(null);
    await expect(knowledgeService.deleteTopic(99, 1)).rejects.toMatchObject({ statusCode: 404 });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('hard-deletes topic with file cleanup', async () => {
    topicRepo.findOwnedById.mockResolvedValue({ id: 4 });
    docRepo.listFilePathsByTopic.mockResolvedValue(['/uploads/t1.pdf']);
    topicRepo.hardDeleteOwned.mockResolvedValue(true);

    await knowledgeService.deleteTopic(4, 1);

    expect(topicRepo.hardDeleteOwned).toHaveBeenCalledWith(4, 1, mockClient);
    expect(topicRepo.softDeleteOwned).not.toHaveBeenCalled();
    expect(fs.unlink).toHaveBeenCalledWith('/uploads/t1.pdf', expect.any(Function));
  });

  it('rolls back on DB error, does not delete files', async () => {
    topicRepo.findOwnedById.mockResolvedValue({ id: 4 });
    docRepo.listFilePathsByTopic.mockResolvedValue(['/uploads/t1.pdf']);
    topicRepo.hardDeleteOwned.mockRejectedValue(new Error('tx error'));

    await expect(knowledgeService.deleteTopic(4, 1)).rejects.toThrow('tx error');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(fs.unlink).not.toHaveBeenCalled();
  });
});

// ─── Documents ────────────────────────────────────────────────────────────────

describe('knowledgeService.uploadDocument', () => {
  it('throws 404 when topic not owned', async () => {
    topicRepo.findOwnedById.mockResolvedValue(null);
    await expect(
      knowledgeService.uploadDocument(99, 1, {
        originalFilename: 'test.pdf', filePath: '/tmp/test.pdf',
        fileType: 'pdf', fileSizeBytes: 1024,
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 409 on duplicate document', async () => {
    topicRepo.findOwnedById.mockResolvedValue({ id: 1 });
    const dupError = new Error('Duplicate document: …');
    dupError.code = 'DUPLICATE';
    registerAndProcess.mockRejectedValue(dupError);
    await expect(
      knowledgeService.uploadDocument(1, 1, {
        originalFilename: 'dup.pdf', filePath: '/tmp/dup.pdf',
        fileType: 'pdf', fileSizeBytes: 1024,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('registers and processes the document when valid', async () => {
    topicRepo.findOwnedById.mockResolvedValue({ id: 1 });
    registerAndProcess.mockResolvedValue({ id: 7, status: 'uploaded' });
    const result = await knowledgeService.uploadDocument(1, 1, {
      title: 'My Doc', originalFilename: 'doc.pdf',
      filePath: '/tmp/doc.pdf', fileType: 'pdf', fileSizeBytes: 500,
    });
    expect(result).toEqual({ id: 7, status: 'uploaded' });
    expect(registerAndProcess).toHaveBeenCalledWith(
      expect.objectContaining({ topicId: 1, teacherId: 1, title: 'My Doc', fileType: 'pdf' })
    );
  });
});

describe('knowledgeService.retryFailedDocument', () => {
  it('throws 404 when document not found', async () => {
    docRepo.findOwnedById.mockResolvedValue(null);
    await expect(knowledgeService.retryFailedDocument(99, 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 400 when document is not in failed status', async () => {
    docRepo.findOwnedById.mockResolvedValue({ id: 1, status: 'processing' });
    await expect(knowledgeService.retryFailedDocument(1, 1)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('calls retryDocument when status is failed', async () => {
    docRepo.findOwnedById.mockResolvedValue({ id: 1, status: 'failed' });
    retryDocument.mockResolvedValue({ id: 1, retry_count: 1 });
    const result = await knowledgeService.retryFailedDocument(1, 1);
    expect(result.retry_count).toBe(1);
    expect(retryDocument).toHaveBeenCalledWith(1, 1);
  });
});

describe('knowledgeService.archiveDocument', () => {
  it('uses soft-delete (preserves record for audit)', async () => {
    docRepo.softDeleteOwned.mockResolvedValue(true);
    await knowledgeService.archiveDocument(5, 1);
    expect(docRepo.softDeleteOwned).toHaveBeenCalledWith(5, 1);
  });

  it('throws 404 when document not found', async () => {
    docRepo.softDeleteOwned.mockResolvedValue(false);
    await expect(knowledgeService.archiveDocument(99, 1)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ─── Search ───────────────────────────────────────────────────────────────────

describe('knowledgeService.searchKnowledgeBase', () => {
  it('delegates to retrieval service', async () => {
    const mockResults = { results: [{ chunkId: 1, text: 'hello', similarity: 0.9 }] };
    search.mockResolvedValue(mockResults);
    const result = await knowledgeService.searchKnowledgeBase({
      query: 'photosynthesis', teacherId: 1, topK: 5, filters: {},
    });
    expect(result).toEqual(mockResults);
    expect(search).toHaveBeenCalledWith({
      query: 'photosynthesis', teacherId: 1, topK: 5, filters: {},
    });
  });
});

// ─── Cross-teacher isolation ───────────────────────────────────────────────────

describe('cross-teacher access rejection', () => {
  it('teacher 2 cannot access teacher 1 curriculum', async () => {
    curriculumRepo.findOwnedById.mockResolvedValue(null);
    await expect(knowledgeService.getCurriculum(1, 2)).rejects.toMatchObject({ statusCode: 404 });
    expect(curriculumRepo.findOwnedById).toHaveBeenCalledWith(1, 2);
  });

  it('teacher 2 cannot delete teacher 1 curriculum', async () => {
    curriculumRepo.findOwnedById.mockResolvedValue(null); // ownership guard fails
    await expect(knowledgeService.deleteCurriculum(1, 2)).rejects.toMatchObject({ statusCode: 404 });
    // Must not have even opened a DB connection
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('teacher 2 cannot upload to teacher 1 topic', async () => {
    topicRepo.findOwnedById.mockResolvedValue(null);
    await expect(
      knowledgeService.uploadDocument(1, 2, {
        originalFilename: 'x.pdf', filePath: '/tmp/x.pdf',
        fileType: 'pdf', fileSizeBytes: 100,
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(topicRepo.findOwnedById).toHaveBeenCalledWith(1, 2);
  });

  it('teacher 2 cannot delete teacher 1 subject', async () => {
    subjectRepo.findOwnedById.mockResolvedValue(null);
    await expect(knowledgeService.deleteSubject(1, 2)).rejects.toMatchObject({ statusCode: 404 });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('teacher 2 cannot delete teacher 1 chapter', async () => {
    chapterRepo.findOwnedById.mockResolvedValue(null);
    await expect(knowledgeService.deleteChapter(1, 2)).rejects.toMatchObject({ statusCode: 404 });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('teacher 2 cannot delete teacher 1 topic', async () => {
    topicRepo.findOwnedById.mockResolvedValue(null);
    await expect(knowledgeService.deleteTopic(1, 2)).rejects.toMatchObject({ statusCode: 404 });
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

// ─── Duplicate-file protection after delete ───────────────────────────────────

describe('duplicate detection after curriculum deletion', () => {
  it('allows same file upload after curriculum is deleted (no stale hash)', async () => {
    // After deletion, findByHash returns null (document is gone from DB)
    topicRepo.findOwnedById.mockResolvedValue({ id: 10 });
    registerAndProcess.mockResolvedValue({ id: 20, status: 'uploaded' });

    const result = await knowledgeService.uploadDocument(10, 1, {
      originalFilename: '803020012.pdf',
      filePath: '/tmp/803020012.pdf',
      fileType: 'pdf',
      fileSizeBytes: 102400,
    });

    expect(result).toEqual({ id: 20, status: 'uploaded' });
    expect(registerAndProcess).toHaveBeenCalled();
  });

  it('still rejects duplicate uploads when original genuinely exists', async () => {
    topicRepo.findOwnedById.mockResolvedValue({ id: 10 });
    const dupError = new Error('Duplicate document: identical content already exists as "Bio Notes" (ID 5).');
    dupError.code = 'DUPLICATE';
    registerAndProcess.mockRejectedValue(dupError);

    await expect(
      knowledgeService.uploadDocument(10, 1, {
        originalFilename: '803020012.pdf',
        filePath: '/tmp/803020012.pdf',
        fileType: 'pdf',
        fileSizeBytes: 102400,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ─── Multiple files under curriculum ─────────────────────────────────────────

describe('deleteCurriculum with multiple documents', () => {
  it('removes all files when curriculum has many documents', async () => {
    const FILES = ['/uploads/a.pdf', '/uploads/b.pdf', '/uploads/c.pdf', '/uploads/d.pdf'];
    curriculumRepo.findOwnedById.mockResolvedValue({ id: 1 });
    docRepo.listFilePathsByCurriculum.mockResolvedValue(FILES);
    curriculumRepo.hardDeleteOwned.mockResolvedValue(true);

    await knowledgeService.deleteCurriculum(1, 1);

    expect(fs.unlink).toHaveBeenCalledTimes(4);
    FILES.forEach((fp) => {
      expect(fs.unlink).toHaveBeenCalledWith(fp, expect.any(Function));
    });
  });

  it('completes successfully when curriculum has no documents', async () => {
    curriculumRepo.findOwnedById.mockResolvedValue({ id: 1 });
    docRepo.listFilePathsByCurriculum.mockResolvedValue([]);
    curriculumRepo.hardDeleteOwned.mockResolvedValue(true);

    await expect(knowledgeService.deleteCurriculum(1, 1)).resolves.not.toThrow();
    expect(fs.unlink).not.toHaveBeenCalled();
  });
});
