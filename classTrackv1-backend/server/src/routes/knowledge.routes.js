/**
 * server/src/routes/knowledge.routes.js
 *
 * Knowledge Base API — all routes require:
 *   - authenticate (valid JWT)
 *   - authorizeRoles('teacher')
 *   - authorizePermissions(PERMISSIONS.KNOWLEDGE_MANAGE_OWN)
 *     (or KNOWLEDGE_SEARCH for the search endpoint)
 *
 * Route map:
 *
 *   Curricula
 *     GET    /knowledge/curricula
 *     POST   /knowledge/curricula
 *     GET    /knowledge/curricula/:curriculumId
 *     DELETE /knowledge/curricula/:curriculumId
 *
 *   Subjects
 *     GET    /knowledge/curricula/:curriculumId/subjects
 *     POST   /knowledge/curricula/:curriculumId/subjects
 *     DELETE /knowledge/subjects/:subjectId
 *
 *   Chapters
 *     GET    /knowledge/subjects/:subjectId/chapters
 *     POST   /knowledge/subjects/:subjectId/chapters
 *     DELETE /knowledge/chapters/:chapterId
 *
 *   Topics
 *     GET    /knowledge/chapters/:chapterId/topics
 *     POST   /knowledge/chapters/:chapterId/topics
 *     DELETE /knowledge/topics/:topicId
 *
 *   Documents
 *     GET    /knowledge/topics/:topicId/documents
 *     POST   /knowledge/topics/:topicId/documents  (multipart)
 *     GET    /knowledge/documents/:documentId/status
 *     POST   /knowledge/documents/:documentId/retry
 *     DELETE /knowledge/documents/:documentId
 *
 *   Search
 *     POST   /knowledge/search
 */
const { Router } = require('express');
const controller  = require('../controllers/knowledge.controller');
const validator   = require('../validators/knowledge.validator');
const validate    = require('../middleware/validate.middleware');
const { authenticate, authorizeRoles, authorizePermissions } = require('../middleware/auth.middleware');
const { PERMISSIONS } = require('../constants/permissions.constants');
const { knowledgeUpload, validateKnowledgeFileSignature } = require('../middleware/knowledgeUpload.middleware');

const router = Router();
router.use(authenticate, authorizeRoles('teacher'));

const MANAGE = authorizePermissions(PERMISSIONS.KNOWLEDGE_MANAGE_OWN);
const SEARCH  = authorizePermissions(PERMISSIONS.KNOWLEDGE_SEARCH);

// ── Curricula ─────────────────────────────────────────────────────────────────
router.get('/curricula',                         MANAGE, controller.listCurricula);
router.post('/curricula',                        MANAGE, validate(validator.createCurriculum), controller.createCurriculum);
router.get('/curricula/:curriculumId',           MANAGE, validate(validator.curriculumIdParam), controller.getCurriculum);
router.delete('/curricula/:curriculumId',        MANAGE, validate(validator.curriculumIdParam), controller.deleteCurriculum);

// ── Subjects ──────────────────────────────────────────────────────────────────
router.get('/curricula/:curriculumId/subjects',  MANAGE, validate(validator.curriculumIdParam), controller.listSubjects);
router.post('/curricula/:curriculumId/subjects', MANAGE, validate(validator.createSubject), controller.createSubject);
router.delete('/subjects/:subjectId',            MANAGE, validate(validator.subjectIdParam), controller.deleteSubject);

// ── Chapters ──────────────────────────────────────────────────────────────────
router.get('/subjects/:subjectId/chapters',      MANAGE, validate(validator.subjectIdParam), controller.listChapters);
router.post('/subjects/:subjectId/chapters',     MANAGE, validate(validator.createChapter), controller.createChapter);
router.delete('/chapters/:chapterId',            MANAGE, validate(validator.chapterIdParam), controller.deleteChapter);

// ── Topics ────────────────────────────────────────────────────────────────────
router.get('/chapters/:chapterId/topics',        MANAGE, validate(validator.chapterIdParam), controller.listTopics);
router.post('/chapters/:chapterId/topics',       MANAGE, validate(validator.createTopic), controller.createTopic);
router.delete('/topics/:topicId',                MANAGE, validate(validator.topicIdParam), controller.deleteTopic);

// ── Documents ─────────────────────────────────────────────────────────────────
router.get('/topics/:topicId/documents',
  MANAGE,
  validate(validator.topicIdParam),
  controller.listDocuments
);

router.post('/topics/:topicId/documents',
  MANAGE,
  knowledgeUpload.single('file'),
  validateKnowledgeFileSignature,
  validate(validator.uploadDocument),
  controller.uploadDocument
);

router.get('/documents/:documentId/status',
  MANAGE,
  validate(validator.documentIdParam),
  controller.getDocumentStatus
);

router.post('/documents/:documentId/retry',
  MANAGE,
  validate(validator.documentIdParam),
  controller.retryDocument
);

router.delete('/documents/:documentId',
  MANAGE,
  validate(validator.documentIdParam),
  controller.archiveDocument
);

// ── Search ────────────────────────────────────────────────────────────────────
router.post('/search',
  SEARCH,
  validate(validator.searchKnowledge),
  controller.search
);

module.exports = router;
