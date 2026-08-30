-- =============================================================================
-- V9__quiz_results_permissions.sql
--
-- Sprint 5 — Teacher Quiz Result Visibility.
--
-- Seeds the question:view_results permission so teachers can view
-- student attempt data for questions/topics they own.
-- =============================================================================

INSERT INTO permissions (code, description) VALUES
  ('question:view_results', 'View student quiz attempt results for owned questions')
ON CONFLICT (code) DO NOTHING;

-- Teachers can view quiz results for their own questions/topics
INSERT INTO role_permissions (role, permission_code) VALUES
  ('teacher', 'question:view_results')
ON CONFLICT (role, permission_code) DO NOTHING;
