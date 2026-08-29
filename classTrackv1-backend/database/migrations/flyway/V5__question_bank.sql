-- =============================================================================
-- V5__question_bank.sql
--
-- Sprint 3 — Question Bank Foundation
--
-- Introduces the question_bank table and supporting lifecycle.
--
-- Design notes:
--   • question_type  — CHECK constraint (no separate lookup table needed).
--   • difficulty     — easy / medium / hard
--   • status         — full lifecycle from generated → published
--   • options        — JSONB only for MCQ (variable-length ordered list) and
--                      matching (pairs). For all scalar answer types, plain
--                      TEXT columns are used.
--   • marks          — NUMERIC(5,2) — supports decimal marks (e.g. 1.5).
--   • text_hash      — MD5 of normalised question text for fast deduplication.
--   • source_document_id / source_chunk_id — provenance, non-nullable.
--   • created_by / approved_by — polymorphic: role stored separately.
-- =============================================================================

-- ── question_bank ─────────────────────────────────────────────────────────────
CREATE TABLE question_bank (
  id                        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- ── Classification ────────────────────────────────────────────────────────
  question_type             TEXT         NOT NULL
    CHECK (question_type IN (
      'mcq','true_false','fill_blank','one_word',
      'short_answer','matching','scenario','descriptive'
    )),
  difficulty                TEXT         NOT NULL DEFAULT 'medium'
    CHECK (difficulty IN ('easy','medium','hard')),
  marks                     NUMERIC(5,2) NOT NULL DEFAULT 1.00
    CHECK (marks > 0),

  -- ── Content ───────────────────────────────────────────────────────────────
  question_text             TEXT         NOT NULL,
  -- JSONB for MCQ options (ordered array) and matching pairs;
  -- NULL for question types that do not require it.
  options                   JSONB        NULL,
  correct_answer            TEXT         NOT NULL,
  explanation               TEXT         NULL,

  -- ── Hierarchy provenance (who owns this question) ─────────────────────────
  curriculum_id             INTEGER      NOT NULL,
  subject_id                INTEGER      NOT NULL,
  chapter_id                INTEGER      NOT NULL,
  topic_id                  INTEGER      NOT NULL,

  -- ── Source traceability (which chunk was used) ────────────────────────────
  source_document_id        INTEGER      NOT NULL,
  source_chunk_id           INTEGER      NOT NULL,

  -- ── Generation metadata ───────────────────────────────────────────────────
  generation_model          VARCHAR(100) NOT NULL,
  generation_provider       VARCHAR(50)  NOT NULL DEFAULT 'groq',
  generation_prompt_version VARCHAR(20)  NOT NULL DEFAULT 'v1',

  -- ── Lifecycle status ──────────────────────────────────────────────────────
  -- generated → validated → pending_approval → approved → published
  -- Side paths: rejected, archived
  status                    TEXT         NOT NULL DEFAULT 'generated'
    CHECK (status IN (
      'generated','validated','pending_approval',
      'approved','published','rejected','archived'
    )),

  -- ── Actor columns ─────────────────────────────────────────────────────────
  -- created_by_role: 'teacher' or 'student'
  created_by                INTEGER      NOT NULL,
  created_by_role           TEXT         NOT NULL CHECK (created_by_role IN ('teacher','student')),
  approved_by               INTEGER      NULL DEFAULT NULL,   -- teacher id
  approved_at               TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  rejected_reason           TEXT         NULL,

  -- ── Duplicate detection ───────────────────────────────────────────────────
  -- MD5 of LOWER(TRIM(question_text)) for normalised equality check.
  text_hash                 CHAR(32)     NOT NULL,

  -- ── Timestamps ────────────────────────────────────────────────────────────
  created_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- ── Foreign keys ──────────────────────────────────────────────────────────
  CONSTRAINT fk_qb_curriculum
    FOREIGN KEY (curriculum_id) REFERENCES curricula(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_qb_subject
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_qb_chapter
    FOREIGN KEY (chapter_id) REFERENCES chapters(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_qb_topic
    FOREIGN KEY (topic_id) REFERENCES topics(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_qb_source_document
    FOREIGN KEY (source_document_id) REFERENCES knowledge_documents(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_qb_source_chunk
    FOREIGN KEY (source_chunk_id) REFERENCES knowledge_chunks(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Fast ownership/listing queries
CREATE INDEX idx_qb_topic_id        ON question_bank (topic_id);
CREATE INDEX idx_qb_chapter_id      ON question_bank (chapter_id);
CREATE INDEX idx_qb_subject_id      ON question_bank (subject_id);
CREATE INDEX idx_qb_curriculum_id   ON question_bank (curriculum_id);

-- Status-based queries (approval queue, pending list, published)
CREATE INDEX idx_qb_status          ON question_bank (status);
CREATE INDEX idx_qb_topic_status    ON question_bank (topic_id, status);

-- Lifecycle actor
CREATE INDEX idx_qb_created_by      ON question_bank (created_by, created_by_role);
CREATE INDEX idx_qb_approved_by     ON question_bank (approved_by) WHERE approved_by IS NOT NULL;

-- Duplicate detection — unique per (topic, normalised text)
-- Allows the same question text on different topics only.
CREATE UNIQUE INDEX idx_qb_dedup    ON question_bank (topic_id, text_hash);

-- Source provenance
CREATE INDEX idx_qb_source_doc      ON question_bank (source_document_id);
CREATE INDEX idx_qb_source_chunk    ON question_bank (source_chunk_id);
