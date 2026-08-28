/**
 * server/tests/unit/services/knowledge.service.test.js
 *
 * Tests for KnowledgeService business logic — all repositories mocked.
 * Covers: ownership guards, duplicate detection, retry, status enforcement.
 */
jest.mock('../../../src/repositories/curriculum.repository', () => ({
  findOwnedById: jest.fn(),
  listByTeacher: jest.fn(),
  createForTeacher: jest.fn(),
  softDeleteOwned: jest.fn(),
}));
jest.mock('../../../src/repositories/subject.repository', () => ({
  findOwnedById: jest.fn(),
  listByCurriculum: jest.fn(),
  createForTeacher: jest.fn(),
  softDeleteOwned: jest.fn(),
}));
jest.mock('../../../src/repositories/chapter.repository', () => ({
  findOwnedById: jest.fn(),
  listBySubject: jest.fn(),
  createForTeacher: jest.fn(),
  softDeleteOwned: jest.fn(),
}));
jest.mock('../../../src/repositories/topic.repository', () => ({
  findOwnedById: jest.fn(),
  listByChapter: jest.fn(),
  createForTeacher: jest.fn(),
  softDeleteOwned: jest.fn(),
}));
jest.mock('../../../src/repositories/knowledgeDocument.repository', () => ({
  findOwnedById: jest.fn(),
  findByHash: jest.fn(),
  create: jest.fn(),
  setStatus: jest.fn(),
  resetForRetry: jest.fn(),
  softDeleteOwned: jest.fn(),
  listByTopic: jest.fn(),
}));
jest.mock('../../../src/repositories/knowledgeChunk.repository', () => ({
  similaritySearch: jest.fn(),
}));
jest.mock('../../../src/services/knowledge/ingestion.service', () => ({
  registerAndProcess: jest.fn(),
  retryDocument: jest.fn(),
}));
jest.mock('../../../src/services/knowledge/retrieval.service', () => ({
  search: jest.fn(),
}));

const knowledgeService = require('../../../src/services/knowledge/knowledge.service');
const curriculumRepo = require('../../../src/repositories/curriculum.repository');
const subjectRepo    = require('../../../src/repositories/subject.repository');
const chapterRepo    = require('../../../src/repositories/chapter.repository');
const topicRepo      = require('../../../src/repositories/topic.repository');
const docRepo        = require('../../../src/repositories/knowledgeDocument.repository');
const { registerAndProcess, retryDocument } = require('../../../src/services/knowledge/ingestion.service');
const { search } = require('../../../src/services/knowledge/retrieval.service');

beforeEach(() => jest.clearAllMocks());

// ── Curricula ─────────────────────────────────────────────────────────────────
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
  it('throws 404 when curriculum not found', async () => {
    curriculumRepo.softDeleteOwned.mockResolvedValue(false);
    await expect(knowledgeService.deleteCurriculum(999, 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('does not throw when successfully deleted', async () => {
    curriculumRepo.softDeleteOwned.mockResolvedValue(true);
    await expect(knowledgeService.deleteCurriculum(1, 1)).resolves.not.toThrow();
  });
});

// ── Subjects ──────────────────────────────────────────────────────────────────
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

// ── Chapters ──────────────────────────────────────────────────────────────────
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

// ── Topics ────────────────────────────────────────────────────────────────────
describe('knowledgeService.createTopic', () => {
  it('requires chapter to be owned', async () => {
    chapterRepo.findOwnedById.mockResolvedValue(null);
    await expect(
      knowledgeService.createTopic(99, 1, { name: 'Topic A' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── Documents ─────────────────────────────────────────────────────────────────
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

// ── Search ────────────────────────────────────────────────────────────────────
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

// ── Cross-teacher isolation ───────────────────────────────────────────────────
describe('cross-teacher access rejection', () => {
  it('teacher 2 cannot access teacher 1 curriculum', async () => {
    curriculumRepo.findOwnedById.mockResolvedValue(null); // not owned by teacher 2
    await expect(knowledgeService.getCurriculum(1, 2)).rejects.toMatchObject({ statusCode: 404 });
    // confirm teacher_id=2 was passed through
    expect(curriculumRepo.findOwnedById).toHaveBeenCalledWith(1, 2);
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
});
