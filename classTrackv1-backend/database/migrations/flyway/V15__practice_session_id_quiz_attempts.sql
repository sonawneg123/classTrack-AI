-- =============================================================================
-- V15__practice_session_id_quiz_attempts.sql
--
-- Sprint 3 Phase 1 — Link quiz_attempts to practice_sessions (nullable).
--
-- BACKWARD-COMPATIBLE: practice_session_id is nullable so all existing
-- quiz_attempts (from quiz assignments, standalone attempts) continue to work
-- exactly as before.  Only attempts created via practice sessions will carry
-- a non-null practice_session_id.
--
-- The UNIQUE constraint on (student_id, question_id) is preserved — upsert
-- behavior is unchanged.  The session id is best-effort on the attempt row;
-- if a student reattempts the same question in a later session the attempt row
-- is updated but practice_session_id may point to the original session.
-- =============================================================================

ALTER TABLE quiz_attempts
  ADD COLUMN IF NOT EXISTS practice_session_id INTEGER NULL DEFAULT NULL;

-- Foreign key: ON DELETE SET NULL so deleting a session does not lose the
-- attempt data (the attempt is still a valid performance record).
ALTER TABLE quiz_attempts
  ADD CONSTRAINT fk_qa_practice_session
    FOREIGN KEY (practice_session_id) REFERENCES practice_sessions(id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Index: look up all attempts for a practice session quickly
CREATE INDEX IF NOT EXISTS idx_qa_practice_session_id
  ON quiz_attempts (practice_session_id)
  WHERE practice_session_id IS NOT NULL;
