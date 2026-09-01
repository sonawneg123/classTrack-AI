-- =============================================================================
-- V19__profile_photos.sql
--
-- Profile Photo / Avatar support for Admin, Teacher, and Student accounts.
--
-- Design decisions:
--   - Each account table gets a single `avatar_path` column that stores a
--     relative path to the stored image file (e.g. 'uploads/avatars/abc123.jpg').
--   - The full URL is constructed by the application layer (never stored in DB).
--   - NULL means "no photo" → the frontend falls back to initials.
--   - No separate profile table is created; the column belongs to the account
--     row that owns it.
--   - The stored filename is server-generated (UUID-like) — never the original
--     filename, preventing path traversal.
--   - Easy to migrate to S3/object storage later: just change what the path
--     refers to (local → object key) without any schema change.
-- =============================================================================

-- ── admins ────────────────────────────────────────────────────────────────────
ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS avatar_path VARCHAR(500) NULL DEFAULT NULL;

-- ── teachers ─────────────────────────────────────────────────────────────────
ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS avatar_path VARCHAR(500) NULL DEFAULT NULL;

-- ── students ─────────────────────────────────────────────────────────────────
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS avatar_path VARCHAR(500) NULL DEFAULT NULL;
