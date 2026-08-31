-- =============================================================================
-- V14__practice_sessions.sql
--
-- Sprint 3 Phase 1 — Practice Session tracking
--
-- A practice_session represents one "Generate + Answer" lifecycle.
-- The student clicks "Generate Practice", gets N questions, answers them,
-- and the session completes.  Mastery is calculated at SESSION level.
--
-- Design decisions:
--   • status: 'active' while the student is answering, 'completed' once
--     completeSession() is called (or all questions are answered).
--   • topic_id / student_id index enables fast mastery lookup.
--   • completed_at is NULL until the session is explicitly completed.
--   • Sessions with zero answered questions are valid (empty session edge case).
-- =============================================================================

CREATE TABLE practice_sessions (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- ── Ownership ──────────────────────────────────────────────────────────────
  student_id    INTEGER      NOT NULL,
  topic_id      INTEGER      NOT NULL,

  -- ── Status ─────────────────────────────────────────────────────────────────
  status        TEXT         NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'completed')),

  -- ── Session metadata ───────────────────────────────────────────────────────
  question_type TEXT         NULL,    -- 'mcq', 'true_false', etc. at generation time
  difficulty    TEXT         NULL,    -- 'easy', 'medium', 'hard' at generation time
  question_count INTEGER     NOT NULL DEFAULT 0,

  -- ── Timestamps ─────────────────────────────────────────────────────────────
  started_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- ── Foreign keys ───────────────────────────────────────────────────────────
  CONSTRAINT fk_ps_student
    FOREIGN KEY (student_id) REFERENCES students(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT fk_ps_topic
    FOREIGN KEY (topic_id) REFERENCES topics(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- Fast lookup for "all sessions for student X on topic Y"
CREATE INDEX idx_ps_student_topic
  ON practice_sessions (student_id, topic_id);

-- Fast lookup for "all sessions for a student" (mastery recalc)
CREATE INDEX idx_ps_student_id
  ON practice_sessions (student_id);

-- Fast lookup for completed sessions (mastery calculation)
CREATE INDEX idx_ps_status
  ON practice_sessions (status)
  WHERE status = 'completed';

-- =============================================================================
-- Permissions: practice:session_manage (students)
-- =============================================================================

INSERT INTO permissions (code, description) VALUES
  ('practice:session_manage', 'Create and complete AI practice sessions')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role, permission_code) VALUES
  ('student', 'practice:session_manage')
ON CONFLICT (role, permission_code) DO NOTHING;
