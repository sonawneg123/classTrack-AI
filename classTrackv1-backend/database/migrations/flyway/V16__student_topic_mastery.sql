-- =============================================================================
-- V16__student_topic_mastery.sql
--
-- Sprint 3 Phase 1 — Student Topic Mastery
--
-- One row per (student_id, topic_id).  Updated atomically after each completed
-- practice session.
--
-- Mastery fields stored (persist only what is not trivially derivable):
--   mastery_score       — rolling average accuracy (0.0–1.0)
--   sessions_completed  — count of completed sessions
--   questions_attempted — total questions answered across all sessions
--   questions_correct   — total correct answers across all sessions
--   consecutive_correct — current streak of correct answers (for threshold checks)
--   consecutive_incorrect — current streak of incorrect answers (for difficulty hints)
--   last_session_at     — when mastery was last updated
--
-- Design decisions:
--   • UNIQUE (student_id, topic_id) — enforced at DB level, not just service.
--   • mastery_score is a NUMERIC(5,4) to represent percentages precisely.
--   • current_difficulty is NOT persisted — it is derived at read time.
--   • Atomic updates via INSERT ... ON CONFLICT DO UPDATE (upsert).
--   • Concurrency safety: uses FOR UPDATE locking in the mastery update service.
-- =============================================================================

CREATE TABLE student_topic_mastery (
  id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- ── Ownership ──────────────────────────────────────────────────────────────
  student_id            INTEGER      NOT NULL,
  topic_id              INTEGER      NOT NULL,

  -- ── Mastery metrics ────────────────────────────────────────────────────────
  mastery_score         NUMERIC(5,4) NOT NULL DEFAULT 0.0000
                        CHECK (mastery_score >= 0.0 AND mastery_score <= 1.0),
  sessions_completed    INTEGER      NOT NULL DEFAULT 0
                        CHECK (sessions_completed >= 0),
  questions_attempted   INTEGER      NOT NULL DEFAULT 0
                        CHECK (questions_attempted >= 0),
  questions_correct     INTEGER      NOT NULL DEFAULT 0
                        CHECK (questions_correct >= 0),
  consecutive_correct   INTEGER      NOT NULL DEFAULT 0
                        CHECK (consecutive_correct >= 0),
  consecutive_incorrect INTEGER      NOT NULL DEFAULT 0
                        CHECK (consecutive_incorrect >= 0),

  -- ── Timestamps ─────────────────────────────────────────────────────────────
  last_session_at       TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- ── Constraints ────────────────────────────────────────────────────────────
  CONSTRAINT uq_student_topic_mastery
    UNIQUE (student_id, topic_id),

  CONSTRAINT fk_stm_student
    FOREIGN KEY (student_id) REFERENCES students(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT fk_stm_topic
    FOREIGN KEY (topic_id) REFERENCES topics(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- Fast lookup for "what is student X's mastery for topic Y?"
CREATE INDEX idx_stm_student_id ON student_topic_mastery (student_id);
CREATE INDEX idx_stm_topic_id   ON student_topic_mastery (topic_id);

-- =============================================================================
-- Permissions: practice:mastery_view (students)
-- =============================================================================

INSERT INTO permissions (code, description) VALUES
  ('practice:mastery_view', 'View own topic mastery scores')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role, permission_code) VALUES
  ('student', 'practice:mastery_view')
ON CONFLICT (role, permission_code) DO NOTHING;
