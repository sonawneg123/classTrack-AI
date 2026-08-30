-- =============================================================================
-- V12__quiz_assignment_permissions.sql
--
-- Sprint 7 — Quiz Assignment RBAC Permissions
--
-- Seeds three permissions for the quiz assignment workflow:
--
--   quiz:create        — teacher: create a new quiz assignment draft
--   quiz:manage_own    — teacher: edit / publish / archive / view results for own quizzes
--   quiz:attempt       — student: see and submit attempts for assigned quizzes
--
-- Role assignments:
--   teacher → quiz:create, quiz:manage_own
--   student → quiz:attempt
--
-- Idempotent (ON CONFLICT DO NOTHING) — safe to re-run.
-- =============================================================================

INSERT INTO permissions (code, description) VALUES
  ('quiz:create',      'Create a new quiz assignment draft'),
  ('quiz:manage_own',  'Edit, publish, archive, and view results for owned quiz assignments'),
  ('quiz:attempt',     'View and submit attempts for assigned quizzes')
ON CONFLICT (code) DO NOTHING;

-- Teacher permissions
INSERT INTO role_permissions (role, permission_code) VALUES
  ('teacher', 'quiz:create'),
  ('teacher', 'quiz:manage_own')
ON CONFLICT (role, permission_code) DO NOTHING;

-- Student permissions
INSERT INTO role_permissions (role, permission_code) VALUES
  ('student', 'quiz:attempt')
ON CONFLICT (role, permission_code) DO NOTHING;
