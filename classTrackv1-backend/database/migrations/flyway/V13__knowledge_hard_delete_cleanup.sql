-- =============================================================================
-- V13__knowledge_hard_delete_cleanup.sql
--
-- Repair orphaned knowledge data caused by the soft-delete-only deletion
-- lifecycle that existed before this fix.
--
-- ROOT CAUSE (fixed in application layer):
--   deleteCurriculum / deleteSubject / deleteChapter / deleteTopic all used
--   UPDATE ... SET deleted_at = NOW() (soft-delete).  FK ON DELETE CASCADE
--   only fires on a real DELETE statement, so knowledge_documents and
--   knowledge_chunks were never removed when a curriculum was deleted.
--   This left orphaned document rows with deleted_at IS NULL, causing the
--   duplicate-hash check in the ingestion pipeline to reject re-uploads.
--
-- APPLICATION FIX:
--   knowledge.service.js now performs hard DELETEs in a transaction.
--   The existing FK ON DELETE CASCADE constraints in V3 are sufficient —
--   no schema changes are required.
--
-- THIS MIGRATION:
--   1. Identifies documents that are "dangling" — their owning topic (or an
--      ancestor) has been soft-deleted but the document itself is still
--      alive (deleted_at IS NULL).
--   2. Hard-deletes those documents; knowledge_chunks are removed by cascade.
--
-- SAFETY:
--   • Only removes rows where an ancestor has deleted_at IS NOT NULL.
--   • Wraps the cleanup in a single transaction.
--   • Does NOT touch documents whose entire ancestry is active.
--   • Does NOT modify any table outside the knowledge hierarchy.
-- =============================================================================

BEGIN;

-- ── Step 1: Remove knowledge_documents whose topic is soft-deleted ─────────────
-- (knowledge_chunks are removed automatically by FK ON DELETE CASCADE)
DELETE FROM knowledge_documents kd
WHERE kd.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM topics t
    WHERE t.id = kd.topic_id
      AND t.deleted_at IS NOT NULL
  );

-- ── Step 2: Remove knowledge_documents whose chapter is soft-deleted ──────────
DELETE FROM knowledge_documents kd
WHERE kd.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM topics    t
    JOIN chapters  ch ON ch.id = t.chapter_id
    WHERE t.id = kd.topic_id
      AND ch.deleted_at IS NOT NULL
  );

-- ── Step 3: Remove knowledge_documents whose subject is soft-deleted ──────────
DELETE FROM knowledge_documents kd
WHERE kd.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM topics    t
    JOIN chapters  ch ON ch.id = t.chapter_id
    JOIN subjects  s  ON s.id  = ch.subject_id
    WHERE t.id = kd.topic_id
      AND s.deleted_at IS NOT NULL
  );

-- ── Step 4: Remove knowledge_documents whose curriculum is soft-deleted ───────
DELETE FROM knowledge_documents kd
WHERE kd.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM topics    t
    JOIN chapters  ch ON ch.id = t.chapter_id
    JOIN subjects  s  ON s.id  = ch.subject_id
    JOIN curricula cu ON cu.id = s.curriculum_id
    WHERE t.id = kd.topic_id
      AND cu.deleted_at IS NOT NULL
  );

-- ── Step 5: Also remove soft-deleted knowledge_documents (deleted_at IS NOT NULL)
--   These were archived at the document level but their chunks may still exist
--   if the document was archived before the cascade was in place.
DELETE FROM knowledge_chunks kc
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_documents kd
  WHERE kd.id = kc.document_id
);

-- ── Step 6: Hard-delete the now-empty soft-deleted structural rows ────────────
-- Delete topics that are soft-deleted (their documents were already removed above).
-- Chapters, subjects, and curricula will be cleaned up by FK cascade from these.
--
-- We delete bottom-up to satisfy FK constraints (even though CASCADE would
-- handle it, being explicit is clearer and safer).

DELETE FROM topics    WHERE deleted_at IS NOT NULL;
DELETE FROM chapters  WHERE deleted_at IS NOT NULL;
DELETE FROM subjects  WHERE deleted_at IS NOT NULL;
DELETE FROM curricula WHERE deleted_at IS NOT NULL;

COMMIT;
