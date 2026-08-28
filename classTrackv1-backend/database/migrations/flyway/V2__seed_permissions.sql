-- =============================================================================
-- V2__seed_permissions.sql
--
-- Seeds the permissions catalogue and role→permission mapping.
-- Uses INSERT ... ON CONFLICT DO NOTHING so this migration is idempotent
-- (safe to re-run; the unique constraint on permissions.code and on
-- role_permissions(role, permission_code) prevents duplicates).
-- =============================================================================

INSERT INTO permissions (code, description) VALUES
  ('platform:manage',        'Full administrative control of the platform'),
  ('teacher:create',         'Create teacher accounts'),
  ('teacher:manage',         'Enable/disable teachers, reset their passwords'),
  ('classroom:create',       'Create classrooms'),
  ('classroom:manage_any',   'Manage any classroom on the platform'),
  ('classroom:manage_own',   'Manage classrooms owned by the current teacher'),
  ('task:create',            'Post a task to a classroom'),
  ('task:manage_own',        'Edit/hide tasks the current teacher created'),
  ('submission:grade',       'Override AI scores and grade submissions'),
  ('submission:view_own',    'View the current student''s own submissions'),
  ('submission:submit',      'Submit work for a task'),
  ('student:manage',         'Reset a student''s password (teacher/admin)'),
  ('report:view_any',        'View or export reports for any classroom'),
  ('report:view_own',        'View or export the current user''s own report'),
  ('audit:view',             'View platform audit logs')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role, permission_code) VALUES
  ('admin', 'platform:manage'),
  ('admin', 'teacher:create'),
  ('admin', 'teacher:manage'),
  ('admin', 'classroom:create'),
  ('admin', 'classroom:manage_any'),
  ('admin', 'report:view_any'),
  ('admin', 'audit:view'),

  ('teacher', 'classroom:manage_own'),
  ('teacher', 'task:create'),
  ('teacher', 'task:manage_own'),
  ('teacher', 'submission:grade'),
  ('teacher', 'student:manage'),
  ('teacher', 'report:view_own'),

  ('student', 'submission:submit'),
  ('student', 'submission:view_own'),
  ('student', 'report:view_own')
ON CONFLICT (role, permission_code) DO NOTHING;
