-- =============================================================================
-- V7__student_view_own_permission.sql
--
-- Sprint 3 fix — Grants students the question:view_own permission so they can
-- fetch their own generated questions (all statuses) via GET /questions/my-questions.
--
-- Previously students only had question:view_approved (published questions only),
-- which meant their pending_approval / approved questions disappeared on page reload.
--
-- Idempotent (ON CONFLICT DO NOTHING).
-- =============================================================================

INSERT INTO role_permissions (role, permission_code) VALUES
  ('student', 'question:view_own')
ON CONFLICT (role, permission_code) DO NOTHING;
