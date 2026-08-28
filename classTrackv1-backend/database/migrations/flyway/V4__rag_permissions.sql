-- =============================================================================
-- V4__rag_permissions.sql
--
-- Seeds the knowledge-base permission codes and teacher role assignments.
-- Idempotent (ON CONFLICT DO NOTHING).
-- =============================================================================

INSERT INTO permissions (code, description) VALUES
  ('knowledge:manage_own', 'Create, update, delete curricula/subjects/chapters/topics/documents owned by the current teacher'),
  ('knowledge:search',     'Perform vector similarity search across own knowledge base')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role, permission_code) VALUES
  ('teacher', 'knowledge:manage_own'),
  ('teacher', 'knowledge:search')
ON CONFLICT (role, permission_code) DO NOTHING;
