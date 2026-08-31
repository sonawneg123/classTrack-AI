-- =============================================================================
-- V18__teacher_registration_codes.sql
--
-- Teacher Self-Registration System
--
-- 1. Adds mobile_number to the teachers table (mirrors V17 student pattern).
-- 2. Adds teacher_registration_codes table for admin-issued codes that gate
--    teacher self-registration.
--
-- Security design:
--   - Only the SHA-256 hash of each code is stored; the raw code is shown
--     to the admin exactly once at creation time and cannot be recovered.
--   - Codes have an expiry timestamp, a revoked flag, and a used_at timestamp.
--   - A code is consumed on first successful use (single-use by default).
--   - Codes are NOT linked to a specific classroom — teacher registers first,
--     admin assigns classroom afterwards (safer, preserves existing
--     single-teacher-per-classroom architecture).
-- =============================================================================

-- ── 1. Add mobile_number to teachers ─────────────────────────────────────────
ALTER TABLE teachers
  ADD COLUMN mobile_number VARCHAR(20) NULL DEFAULT NULL;

-- Partial unique index — only enforces uniqueness when non-NULL
CREATE UNIQUE INDEX uq_teachers_mobile_number
  ON teachers (mobile_number)
  WHERE mobile_number IS NOT NULL;

-- Covering index for mobile-based lookups
CREATE INDEX idx_teachers_mobile_number
  ON teachers (mobile_number)
  WHERE mobile_number IS NOT NULL;

-- ── 2. teacher_registration_codes ────────────────────────────────────────────
CREATE TABLE teacher_registration_codes (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code_hash   CHAR(64)     NOT NULL,         -- SHA-256 of the raw code (hex, 64 chars)
  created_by  INTEGER      NOT NULL,         -- admins.id
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at     TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  used_by     INTEGER      NULL DEFAULT NULL, -- teachers.id of the teacher who consumed it
  is_revoked  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_teacher_reg_code_hash UNIQUE (code_hash),
  CONSTRAINT fk_teacher_reg_code_admin
    FOREIGN KEY (created_by) REFERENCES admins(id)
    ON DELETE CASCADE ON UPDATE CASCADE
  -- used_by references teachers(id) — omitted FK to avoid chicken-and-egg
  -- (the teacher row doesn't exist yet at code-creation time). The value is
  -- set server-side after successful registration; application-layer referential
  -- integrity is sufficient for this audit field.
);

CREATE INDEX idx_teacher_reg_codes_created_by ON teacher_registration_codes (created_by);
CREATE INDEX idx_teacher_reg_codes_expires_at ON teacher_registration_codes (expires_at);
