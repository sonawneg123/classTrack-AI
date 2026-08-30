-- =============================================================================
-- V8__quiz_attempts.sql
--
-- Sprint 4 — Student Quiz Attempt persistence.
--
-- Records each student's answer attempt on a published question.
--
-- Design notes:
--   • One row per (student, question) — the student may reattempt; the row
--     is upserted (updated in place) rather than inserting a new row each
--     time.  This keeps the table compact and makes "latest score" trivial.
--   • is_correct is NULL for descriptive/short_answer/scenario questions
--     where a string comparison cannot determine correctness — those types
--     require human review (no AI evaluation in this sprint).
--   • score: 1 point when is_correct = TRUE, 0 when FALSE, NULL when
--     type is free-text.
--   • attempt_count tracks how many times the student has reattempted.
--   • first_attempted_at / last_attempted_at allow time-based analytics.
-- =============================================================================

CREATE TABLE quiz_attempts (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- ── Ownership ─────────────────────────────────────────────────────────────
  student_id          INTEGER      NOT NULL,
  question_id         INTEGER      NOT NULL,

  -- ── Answer ────────────────────────────────────────────────────────────────
  student_answer      TEXT         NOT NULL,

  -- ── Result ────────────────────────────────────────────────────────────────
  -- NULL for free-text types (short_answer, descriptive, scenario, fill_blank)
  is_correct          BOOLEAN      NULL DEFAULT NULL,
  score               NUMERIC(5,2) NULL DEFAULT NULL,

  -- ── Metadata ──────────────────────────────────────────────────────────────
  attempt_count       INTEGER      NOT NULL DEFAULT 1,
  first_attempted_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_attempted_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- ── Constraints ───────────────────────────────────────────────────────────
  CONSTRAINT uq_quiz_attempts_student_question
    UNIQUE (student_id, question_id),

  CONSTRAINT fk_quiz_attempts_student
    FOREIGN KEY (student_id) REFERENCES students(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT fk_quiz_attempts_question
    FOREIGN KEY (question_id) REFERENCES question_bank(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- Fast lookup for "did this student attempt this question?"
CREATE INDEX idx_quiz_attempts_student_id   ON quiz_attempts (student_id);
CREATE INDEX idx_quiz_attempts_question_id  ON quiz_attempts (question_id);
-- Fast lookup for "all attempts by this student on this topic"
-- (joined with question_bank.topic_id in the service layer)
CREATE INDEX idx_quiz_attempts_student_question ON quiz_attempts (student_id, question_id);


-- =============================================================================
-- V8 — Seed: question:attempt permission
-- =============================================================================

INSERT INTO permissions (code, description) VALUES
  ('question:attempt', 'Submit an answer attempt for a published question')
ON CONFLICT (code) DO NOTHING;

-- Students can attempt published questions
INSERT INTO role_permissions (role, permission_code) VALUES
  ('student', 'question:attempt')
ON CONFLICT (role, permission_code) DO NOTHING;
