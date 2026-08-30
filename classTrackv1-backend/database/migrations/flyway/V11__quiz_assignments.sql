-- =============================================================================
-- V11__quiz_assignments.sql
--
-- Sprint 7 — Teacher Quiz Assignment Workflow
--
-- Creates the three tables that model the quiz-assignment lifecycle:
--
--   quiz_assignments          — quiz header (teacher owns, assigned to classroom)
--   quiz_assignment_questions — join table: which published questions are in a quiz
--   quiz_assignment_attempts  — one row per student per attempt (retake-friendly)
--
-- Design decisions:
--   • Teacher creates quiz as 'draft', adds published questions, then publishes.
--   • Students see only 'published' quizzes in their classroom.
--   • allow_retake controls whether a student may start a new attempt after
--     submitting. Each submission is a NEW row (not upserted), preserving history.
--   • quiz_assignment_questions carries marks_override (NULL = use question.marks).
--   • quiz_assignment_attempts.attempt_number is 1-based; each new attempt
--     INSERTs with MAX(attempt_number) + 1 for the (quiz, student) pair.
--   • deleted_at on quiz_assignments enables soft-delete without losing history.
--
-- Does NOT touch:
--   • question_bank (questions must already be status='published')
--   • quiz_attempts (per-question tracking table from V8; still used for cross-view)
--   • tasks / submissions (file-submission assignments are separate)
-- =============================================================================

-- ── quiz_assignments ──────────────────────────────────────────────────────────
CREATE TABLE quiz_assignments (
  id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- ── Ownership ───────────────────────────────────────────────────────────────
  teacher_id            INTEGER      NOT NULL,
  classroom_id          INTEGER      NOT NULL,

  -- ── Content ─────────────────────────────────────────────────────────────────
  title                 VARCHAR(200) NOT NULL,
  instructions          TEXT         NULL,
  time_limit_minutes    INTEGER      NULL DEFAULT NULL
    CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0),
  due_date              TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,

  -- ── Lifecycle ───────────────────────────────────────────────────────────────
  -- draft → published → archived
  status                TEXT         NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),

  -- ── Behaviour flags ──────────────────────────────────────────────────────────
  allow_retake          BOOLEAN      NOT NULL DEFAULT FALSE,
  shuffle_questions     BOOLEAN      NOT NULL DEFAULT FALSE,

  -- ── Soft-delete ─────────────────────────────────────────────────────────────
  deleted_at            TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,

  -- ── Timestamps ──────────────────────────────────────────────────────────────
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- ── Foreign keys ────────────────────────────────────────────────────────────
  CONSTRAINT fk_qa_teacher
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT fk_qa_classroom
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- ── quiz_assignment_questions ─────────────────────────────────────────────────
-- Maps published questions into a quiz, with optional per-question marks override.
CREATE TABLE quiz_assignment_questions (
  id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  quiz_assignment_id    INTEGER      NOT NULL,
  question_id           INTEGER      NOT NULL,

  -- Position within the quiz (1-based; used for ordered display)
  order_index           INTEGER      NOT NULL DEFAULT 0,

  -- Optional per-question mark override. NULL = use question_bank.marks
  marks_override        NUMERIC(5,2) NULL DEFAULT NULL
    CHECK (marks_override IS NULL OR marks_override > 0),

  -- ── Constraints ─────────────────────────────────────────────────────────────
  CONSTRAINT uq_qaq_quiz_question
    UNIQUE (quiz_assignment_id, question_id),

  CONSTRAINT fk_qaq_quiz
    FOREIGN KEY (quiz_assignment_id) REFERENCES quiz_assignments(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT fk_qaq_question
    FOREIGN KEY (question_id) REFERENCES question_bank(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- ── quiz_assignment_attempts ──────────────────────────────────────────────────
-- Each student submission is a NEW row — previous attempts are preserved for history.
-- UNIQUE(quiz_assignment_id, student_id, attempt_number) ensures no duplicate numbers.
CREATE TABLE quiz_assignment_attempts (
  id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  quiz_assignment_id    INTEGER      NOT NULL,
  student_id            INTEGER      NOT NULL,

  -- Monotonically increasing per (quiz, student): 1 for first try, 2 for retake, etc.
  attempt_number        INTEGER      NOT NULL DEFAULT 1,

  -- in_progress while the student is answering; submitted once they submit.
  status                TEXT         NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'submitted')),

  -- Score and max_score are NULL until submission.
  score                 NUMERIC(8,2) NULL DEFAULT NULL,
  max_score             NUMERIC(8,2) NULL DEFAULT NULL,

  started_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  submitted_at          TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,

  -- ── Constraints ─────────────────────────────────────────────────────────────
  CONSTRAINT uq_qaa_quiz_student_attempt
    UNIQUE (quiz_assignment_id, student_id, attempt_number),

  CONSTRAINT fk_qaa_quiz
    FOREIGN KEY (quiz_assignment_id) REFERENCES quiz_assignments(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT fk_qaa_student
    FOREIGN KEY (student_id) REFERENCES students(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Teacher listing + ownership scoping
CREATE INDEX idx_qa_teacher_id        ON quiz_assignments (teacher_id);
CREATE INDEX idx_qa_classroom_id      ON quiz_assignments (classroom_id);
CREATE INDEX idx_qa_status            ON quiz_assignments (status);
-- Efficient "list all active quizzes for teacher X"
CREATE INDEX idx_qa_teacher_deleted   ON quiz_assignments (teacher_id, deleted_at);

-- Question-picker: find all questions in a quiz, ordered
CREATE INDEX idx_qaq_quiz_id          ON quiz_assignment_questions (quiz_assignment_id);
CREATE INDEX idx_qaq_question_id      ON quiz_assignment_questions (question_id);

-- Attempt lookups
CREATE INDEX idx_qaa_quiz_id          ON quiz_assignment_attempts (quiz_assignment_id);
CREATE INDEX idx_qaa_student_id       ON quiz_assignment_attempts (student_id);
-- "Latest attempt for student X in quiz Y" — most common query
CREATE INDEX idx_qaa_quiz_student     ON quiz_assignment_attempts (quiz_assignment_id, student_id);
