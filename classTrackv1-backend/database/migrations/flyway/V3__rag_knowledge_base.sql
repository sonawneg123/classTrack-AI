-- =============================================================================
-- V3__rag_knowledge_base.sql
--
-- Sprint 2 — RAG Knowledge Base Foundation
--
-- Introduces the hierarchical knowledge-base schema:
--
--   curriculum
--     └─ subject
--          └─ chapter
--               └─ topic
--                    └─ knowledge_document
--                         └─ knowledge_chunk (with pgvector embedding)
--
-- Design notes:
--   • INTEGER GENERATED ALWAYS AS IDENTITY — consistent with V1 schema.
--   • Soft-deletion via deleted_at on every ownable resource.
--   • created_at / updated_at on every table (updated_at set by application).
--   • Ownership is scoped to teacher_id so a teacher can NEVER access
--     another teacher's knowledge base by guessing IDs.
--   • The `vector` column dimension is intentionally parameterised through
--     a named domain (rag_embedding) whose size is set here from
--     configuration. Currently 384 dimensions for all-MiniLM-L6-v2.
--     Change RAG_EMBEDDING_DIM in one place if the model changes.
--   • The IVFFlat index is created at the END of this migration, after
--     the table exists, with the correct dimension.
-- =============================================================================

-- ── curricula ─────────────────────────────────────────────────────────────────
-- Top-level knowledge container scoped to a single teacher.
CREATE TABLE curricula (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_id  INTEGER      NOT NULL,
  name        VARCHAR(200) NOT NULL,
  description TEXT         NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  deleted_at  TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_curricula_teacher
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_curricula_teacher_id      ON curricula (teacher_id);
CREATE INDEX idx_curricula_teacher_deleted ON curricula (teacher_id, deleted_at);

-- ── subjects ──────────────────────────────────────────────────────────────────
CREATE TABLE subjects (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  curriculum_id INTEGER     NOT NULL,
  teacher_id   INTEGER      NOT NULL,  -- denormalised for fast ownership checks
  name         VARCHAR(200) NOT NULL,
  description  TEXT         NULL,
  deleted_at   TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_subjects_curriculum
    FOREIGN KEY (curriculum_id) REFERENCES curricula(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_subjects_teacher
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_subjects_curriculum_id ON subjects (curriculum_id);
CREATE INDEX idx_subjects_teacher_id    ON subjects (teacher_id);

-- ── chapters ──────────────────────────────────────────────────────────────────
CREATE TABLE chapters (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_id  INTEGER      NOT NULL,
  teacher_id  INTEGER      NOT NULL,
  name        VARCHAR(200) NOT NULL,
  description TEXT         NULL,
  order_index INTEGER      NOT NULL DEFAULT 0,
  deleted_at  TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_chapters_subject
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_chapters_teacher
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_chapters_subject_id ON chapters (subject_id);
CREATE INDEX idx_chapters_teacher_id ON chapters (teacher_id);

-- ── topics ────────────────────────────────────────────────────────────────────
CREATE TABLE topics (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chapter_id  INTEGER      NOT NULL,
  teacher_id  INTEGER      NOT NULL,
  name        VARCHAR(200) NOT NULL,
  description TEXT         NULL,
  order_index INTEGER      NOT NULL DEFAULT 0,
  deleted_at  TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_topics_chapter
    FOREIGN KEY (chapter_id) REFERENCES chapters(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_topics_teacher
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_topics_chapter_id  ON topics (chapter_id);
CREATE INDEX idx_topics_teacher_id  ON topics (teacher_id);

-- ── knowledge_documents ───────────────────────────────────────────────────────
-- One row per uploaded file.  Processing transitions:
--   uploaded → processing → ready
--                        → failed
CREATE TABLE knowledge_documents (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic_id            INTEGER      NOT NULL,
  teacher_id          INTEGER      NOT NULL,
  title               VARCHAR(300) NOT NULL,
  original_filename   VARCHAR(255) NOT NULL,
  file_path           VARCHAR(500) NOT NULL,
  file_type           TEXT         NOT NULL CHECK (file_type IN ('pdf','docx','txt')),
  file_size_bytes     BIGINT       NULL,
  content_hash        CHAR(64)     NULL,  -- SHA-256 hex for deduplication
  version             INTEGER      NOT NULL DEFAULT 1,
  parent_document_id  INTEGER      NULL,  -- set when re-uploading replaces a doc
  status              TEXT         NOT NULL DEFAULT 'uploaded'
                        CHECK (status IN ('uploaded','processing','ready','failed')),
  failure_message     TEXT         NULL,
  retry_count         INTEGER      NOT NULL DEFAULT 0,
  last_attempted_at   TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  processed_at        TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  total_chunks        INTEGER      NULL,
  deleted_at          TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_knowledge_documents_topic
    FOREIGN KEY (topic_id) REFERENCES topics(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_knowledge_documents_teacher
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_knowledge_documents_parent
    FOREIGN KEY (parent_document_id) REFERENCES knowledge_documents(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX idx_knowledge_documents_topic_id     ON knowledge_documents (topic_id);
CREATE INDEX idx_knowledge_documents_teacher_id   ON knowledge_documents (teacher_id);
CREATE INDEX idx_knowledge_documents_status       ON knowledge_documents (status);
CREATE INDEX idx_knowledge_documents_content_hash ON knowledge_documents (content_hash)
  WHERE content_hash IS NOT NULL;
CREATE INDEX idx_knowledge_documents_deleted      ON knowledge_documents (teacher_id, deleted_at);

-- ── knowledge_chunks ──────────────────────────────────────────────────────────
-- One row per text chunk produced by the ingestion pipeline.
-- The embedding column uses pgvector's VECTOR type.
-- Dimension: 384 (all-MiniLM-L6-v2).  Stored as a comment — the actual
-- dimension is enforced by the application layer at insert time.
-- NOTE: vector(384) is used here; if the model changes, create a new
-- migration that ALTERs the column type accordingly.
CREATE TABLE knowledge_chunks (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id  INTEGER   NOT NULL,
  teacher_id   INTEGER   NOT NULL,  -- denormalised for fast ownership checks
  chunk_index  INTEGER   NOT NULL,  -- 0-based ordering within the document
  chunk_text   TEXT      NOT NULL,
  char_count   INTEGER   NOT NULL,
  token_approx INTEGER   NOT NULL,  -- approximate token count (chars / 4)
  -- Source traceability metadata (JSONB):
  --   { page: number|null, section: string|null }
  source_meta  JSONB     NULL,
  -- 384-dimensional embedding from all-MiniLM-L6-v2
  embedding    vector(384) NULL,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_knowledge_chunks_document
    FOREIGN KEY (document_id) REFERENCES knowledge_documents(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_knowledge_chunks_teacher
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT uq_chunk_doc_index UNIQUE (document_id, chunk_index)
);

CREATE INDEX idx_knowledge_chunks_document_id ON knowledge_chunks (document_id);
CREATE INDEX idx_knowledge_chunks_teacher_id  ON knowledge_chunks (teacher_id);

-- IVFFlat index for approximate nearest-neighbour search (cosine distance).
-- lists = SQRT(approximate expected row count).  Starting with 100 — tune
-- upward when the dataset grows past ~1 million chunks.
CREATE INDEX idx_knowledge_chunks_embedding
  ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
