-- =============================================================================
-- V17__student_email_mobile.sql
--
-- P1 — Student Registration
--
-- Adds email and mobile_number to the students table so students can
-- self-register with a real identity (email + mobile) rather than only
-- with a teacher-assigned username + classroom code.
--
-- Design decisions:
--   1. Both columns are NULLABLE so existing rows (registered via the old
--      username+classCode flow) remain valid without a backfill.
--   2. UNIQUE constraints are partial (WHERE ... IS NOT NULL) so that
--      multiple legacy NULL rows do not violate uniqueness.
--   3. email is stored in lower-case (normalized at app layer).
--   4. mobile_number is stored in E.164 format (+<country><number>, no
--      spaces or dashes). Normalization is done at the service layer before
--      insert.  E.164 is the single canonical storage form — digits-only
--      variants (09...) and spaced forms (+91 98...) must be normalized
--      before comparison so duplicate registrations are reliably detected.
--
-- No backfill required:
--   Existing students have username+classroom_id as their identity and can
--   still log in via username.  New students registering via the P1 form
--   will have email+mobile set and can log in via email.
-- =============================================================================

-- Make classroom_id nullable so P1-registered students (who join without a
-- classroom code) are valid.  Existing rows already have a non-NULL value so
-- this ALTER is backward-safe.
ALTER TABLE students
  ALTER COLUMN classroom_id DROP NOT NULL,
  ADD COLUMN email         VARCHAR(150) NULL DEFAULT NULL,
  ADD COLUMN mobile_number VARCHAR(20)  NULL DEFAULT NULL;

-- Partial unique index on email — only enforces uniqueness when non-NULL
CREATE UNIQUE INDEX uq_students_email
  ON students (email)
  WHERE email IS NOT NULL;

-- Partial unique index on mobile — only enforces uniqueness when non-NULL
CREATE UNIQUE INDEX uq_students_mobile_number
  ON students (mobile_number)
  WHERE mobile_number IS NOT NULL;

-- Covering index for email-based login lookups
CREATE INDEX idx_students_email
  ON students (email)
  WHERE email IS NOT NULL;
