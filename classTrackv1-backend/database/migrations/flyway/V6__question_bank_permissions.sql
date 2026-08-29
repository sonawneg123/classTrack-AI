-- =============================================================================
-- V6__question_bank_permissions.sql
--
-- Sprint 3 — Seeds question-bank permission codes.
-- Idempotent (ON CONFLICT DO NOTHING).
-- =============================================================================

-- ── New permission codes ──────────────────────────────────────────────────────
INSERT INTO permissions (code, description) VALUES
  ('question:generate',       'Request question generation from the knowledge base'),
  ('question:view_own',       'View questions generated from own knowledge base'),
  ('question:view_approved',  'View approved/published questions accessible to the student'),
  ('question:approve',        'Approve or reject generated questions'),
  ('question:publish',        'Publish approved questions for student access'),
  ('question:archive',        'Archive a question from the question bank')
ON CONFLICT (code) DO NOTHING;

-- ── Role assignments ──────────────────────────────────────────────────────────

-- Teachers: can manage the full lifecycle
INSERT INTO role_permissions (role, permission_code) VALUES
  ('teacher', 'question:generate'),
  ('teacher', 'question:view_own'),
  ('teacher', 'question:approve'),
  ('teacher', 'question:publish'),
  ('teacher', 'question:archive')
ON CONFLICT (role, permission_code) DO NOTHING;

-- Students: can request generation and view published questions
INSERT INTO role_permissions (role, permission_code) VALUES
  ('student', 'question:generate'),
  ('student', 'question:view_approved')
ON CONFLICT (role, permission_code) DO NOTHING;
