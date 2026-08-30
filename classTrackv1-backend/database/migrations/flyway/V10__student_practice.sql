-- =============================================================================
-- V10__student_practice.sql
--
-- Sprint 6 — Student AI Practice Separation
--
-- Adds a 'practice' status to question_bank so student-generated practice
-- questions are semantically separate from teacher-managed questions that go
-- through the approval lifecycle.
--
-- Design decision:
--   Teacher questions: generated → pending_approval → approved → published
--                                                     ↘ rejected → archived
--   Student practice:  practice   (immediate, no approval lifecycle required)
--
-- This avoids student practice questions appearing in the teacher's approval
-- queue and prevents them from ever entering the official assignment pool
-- unless explicitly promoted by a future feature.
--
-- We ALTER the CHECK constraint by dropping and recreating it because
-- PostgreSQL does not support modifying a CHECK constraint inline.
-- =============================================================================

-- Drop existing CHECK constraint on status column
ALTER TABLE question_bank
  DROP CONSTRAINT IF EXISTS question_bank_status_check;

-- Re-add the CHECK constraint with 'practice' included
ALTER TABLE question_bank
  ADD CONSTRAINT question_bank_status_check
  CHECK (status IN (
    'generated', 'validated', 'pending_approval',
    'approved', 'published', 'rejected', 'archived',
    'practice'
  ));

-- ── Index for fast student practice retrieval ────────────────────────────────
-- Allows efficient "list all practice questions for student X on topic Y"
CREATE INDEX IF NOT EXISTS idx_qb_practice_student
  ON question_bank (created_by, topic_id)
  WHERE status = 'practice' AND created_by_role = 'student';

-- ── Seed: question:practice_generate permission ───────────────────────────────
-- Separate permission to generate student AI practice questions so that
-- it can be toggled independently from the teacher question:generate permission.

INSERT INTO permissions (code, description) VALUES
  ('question:practice_generate', 'Generate and attempt AI practice questions as a student')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role, permission_code) VALUES
  ('student', 'question:practice_generate')
ON CONFLICT (role, permission_code) DO NOTHING;
