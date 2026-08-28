-- =============================================================================
-- V1__initial_schema.sql
--
-- ClassTrack AI — initial PostgreSQL schema.
--
-- Migrated from MySQL database.sql:
--   AUTO_INCREMENT          → GENERATED ALWAYS AS IDENTITY
--   TINYINT(1)              → BOOLEAN
--   TIMESTAMP NULL DEFAULT  → TIMESTAMP WITH TIME ZONE NULL
--   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
--                           → TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
--   ON UPDATE CURRENT_TIMESTAMP
--                           → handled by application layer (updated_at columns
--                             set in updateById). No database trigger added to
--                             keep the schema portable and the migration simple.
--   ENGINE=InnoDB           → removed (PostgreSQL has no storage engines)
--   CHARSET/COLLATE clauses → removed (PostgreSQL uses DB-level encoding)
--   ENUM(...)               → CHECK constraints (inline where small, or TEXT)
--   JSON                    → JSONB
--   LONGTEXT                → TEXT
--   DECIMAL(6,2)            → NUMERIC(8,2) (standard SQL, identical semantics)
--   CHAR(64)                → CHAR(64) (identical)
--   CHAR(8)                 → CHAR(8)  (identical)
--
-- pgvector extension (CREATE EXTENSION IF NOT EXISTS vector) is enabled in
-- database/init/01_extensions.sql which runs before Flyway on first container
-- start. No vector tables are created in this migration — that belongs to a
-- future RAG sprint.
-- =============================================================================

-- ── permissions ───────────────────────────────────────────────────────────────
CREATE TABLE permissions (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  CONSTRAINT uq_permissions_code UNIQUE (code)
);

-- ── role_permissions ──────────────────────────────────────────────────────────
CREATE TABLE role_permissions (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role            TEXT NOT NULL CHECK (role IN ('admin','teacher','student')),
  permission_code VARCHAR(100) NOT NULL,
  CONSTRAINT uq_role_permission UNIQUE (role, permission_code),
  CONSTRAINT fk_role_permission_code
    FOREIGN KEY (permission_code) REFERENCES permissions(code)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- ── admins ────────────────────────────────────────────────────────────────────
CREATE TABLE admins (
  id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                  VARCHAR(100) NOT NULL,
  email                 VARCHAR(150) NOT NULL,
  password_hash         VARCHAR(255) NOT NULL,
  is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
  email_verified_at     TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  failed_login_attempts INTEGER      NOT NULL DEFAULT 0,
  locked_until          TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  last_login_at         TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_admins_email UNIQUE (email)
);

-- ── teachers ──────────────────────────────────────────────────────────────────
CREATE TABLE teachers (
  id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                  VARCHAR(100) NOT NULL,
  email                 VARCHAR(150) NOT NULL,
  password_hash         VARCHAR(255) NOT NULL,
  created_by            INTEGER      NULL DEFAULT NULL,
  is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
  email_verified_at     TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  failed_login_attempts INTEGER      NOT NULL DEFAULT 0,
  locked_until          TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  last_login_at         TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_teachers_email UNIQUE (email),
  CONSTRAINT fk_teachers_created_by
    FOREIGN KEY (created_by) REFERENCES admins(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX idx_teachers_created_by ON teachers (created_by);

-- ── classrooms ────────────────────────────────────────────────────────────────
-- NOTE: created_by is a polymorphic column (admins.id OR teachers.id) —
-- no foreign key constraint is possible; see database.sql comment for details.
CREATE TABLE classrooms (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  subject     VARCHAR(100) NULL DEFAULT NULL,
  section     VARCHAR(50)  NULL DEFAULT NULL,
  class_code  CHAR(8)      NOT NULL,
  teacher_id  INTEGER      NOT NULL,
  created_by  INTEGER      NULL DEFAULT NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  deleted_at  TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_classrooms_class_code UNIQUE (class_code),
  CONSTRAINT fk_classrooms_teacher
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_classrooms_teacher_id             ON classrooms (teacher_id);
CREATE INDEX idx_classrooms_teacher_deleted        ON classrooms (teacher_id, deleted_at);
CREATE INDEX idx_classrooms_teacher_active_deleted ON classrooms (teacher_id, is_active, deleted_at);

-- ── students ──────────────────────────────────────────────────────────────────
CREATE TABLE students (
  id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username              VARCHAR(30)  NOT NULL,
  name                  VARCHAR(100) NOT NULL,
  password_hash         VARCHAR(255) NOT NULL,
  classroom_id          INTEGER      NOT NULL,
  is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
  failed_login_attempts INTEGER      NOT NULL DEFAULT 0,
  locked_until          TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  last_login_at         TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_students_username UNIQUE (username),
  CONSTRAINT fk_students_classroom
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_students_classroom_id ON students (classroom_id);

-- ── tasks ─────────────────────────────────────────────────────────────────────
-- Title uniqueness within a classroom is NOT a DB-level UNIQUE KEY because
-- a partial/filtered unique index is used instead — allowing title reuse
-- after soft-delete. Enforced at the application layer (existsDuplicateTitle).
CREATE TABLE tasks (
  id                       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  classroom_id             INTEGER      NOT NULL,
  teacher_id               INTEGER      NOT NULL,
  title                    VARCHAR(200) NOT NULL,
  description              TEXT         NULL,
  instructions             TEXT         NULL,
  max_score                NUMERIC(8,2) NOT NULL DEFAULT 100.00,
  due_date                 DATE         NULL DEFAULT NULL,
  task_date                DATE         NULL DEFAULT NULL,
  is_active                BOOLEAN      NOT NULL DEFAULT TRUE,
  ai_evaluation_enabled    BOOLEAN      NOT NULL DEFAULT TRUE,
  allowed_file_types       JSONB        NULL DEFAULT NULL,
  late_submission_allowed  BOOLEAN      NOT NULL DEFAULT FALSE,
  max_file_size_mb         INTEGER      NULL DEFAULT NULL,
  archived_at              TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  deleted_at               TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  created_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_tasks_classroom
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tasks_teacher
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_tasks_classroom_id     ON tasks (classroom_id);
CREATE INDEX idx_tasks_teacher_id       ON tasks (teacher_id);
CREATE INDEX idx_tasks_classroom_active ON tasks (classroom_id, is_active);
CREATE INDEX idx_tasks_teacher_deleted  ON tasks (teacher_id, deleted_at);
CREATE INDEX idx_tasks_classroom_deleted ON tasks (classroom_id, deleted_at);
CREATE INDEX idx_tasks_archived         ON tasks (teacher_id, archived_at);

-- ── submissions ───────────────────────────────────────────────────────────────
CREATE TABLE submissions (
  id                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id              INTEGER      NOT NULL,
  student_id           INTEGER      NOT NULL,
  attempt_number       INTEGER      NOT NULL DEFAULT 1,
  file_path            VARCHAR(500) NULL DEFAULT NULL,
  original_filename    VARCHAR(255) NULL DEFAULT NULL,
  file_type            VARCHAR(50)  NULL DEFAULT NULL,
  typed_text           TEXT         NULL,
  extracted_text       TEXT         NULL,
  status               TEXT         NOT NULL DEFAULT 'submitted'
                         CHECK (status IN ('submitted','analyzing','analyzed','failed')),
  ai_score             NUMERIC(8,2) NULL DEFAULT NULL,
  ai_summary           TEXT         NULL,
  ai_strengths         JSONB        NULL,
  ai_improvements      JSONB        NULL,
  teacher_score        NUMERIC(8,2) NULL DEFAULT NULL,
  teacher_feedback     TEXT         NULL,
  score_overridden_by  INTEGER      NULL DEFAULT NULL,
  submitted_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  analyzed_at          TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_submissions_task
    FOREIGN KEY (task_id) REFERENCES tasks(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_submissions_student
    FOREIGN KEY (student_id) REFERENCES students(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_submissions_overridden_by
    FOREIGN KEY (score_overridden_by) REFERENCES teachers(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX idx_submissions_task_id     ON submissions (task_id);
CREATE INDEX idx_submissions_student_id  ON submissions (student_id);
CREATE INDEX idx_submissions_task_student ON submissions (task_id, student_id);
CREATE INDEX idx_submissions_status      ON submissions (status);

-- ── submission_versions ───────────────────────────────────────────────────────
CREATE TABLE submission_versions (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id       INTEGER      NOT NULL,
  attempt_number      INTEGER      NOT NULL,
  file_path           VARCHAR(500) NULL DEFAULT NULL,
  original_filename   VARCHAR(255) NULL DEFAULT NULL,
  file_type           VARCHAR(50)  NULL DEFAULT NULL,
  typed_text          TEXT         NULL,
  extracted_text      TEXT         NULL,
  ai_score            NUMERIC(8,2) NULL DEFAULT NULL,
  ai_summary          TEXT         NULL,
  ai_strengths        JSONB        NULL,
  ai_improvements     JSONB        NULL,
  teacher_score       NUMERIC(8,2) NULL DEFAULT NULL,
  teacher_feedback    TEXT         NULL,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_submission_versions_submission
    FOREIGN KEY (submission_id) REFERENCES submissions(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_submission_versions_submission_id      ON submission_versions (submission_id);
CREATE INDEX idx_submission_versions_submission_attempt ON submission_versions (submission_id, attempt_number);

-- ── notifications ─────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient_type VARCHAR(20)  NOT NULL,
  recipient_id   INTEGER      NOT NULL,
  classroom_id   INTEGER      NULL DEFAULT NULL,
  task_id        INTEGER      NULL DEFAULT NULL,
  type           VARCHAR(50)  NOT NULL,
  title          VARCHAR(255) NOT NULL,
  message        TEXT         NULL,
  is_read        BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_notifications_classroom
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notifications_task
    FOREIGN KEY (task_id) REFERENCES tasks(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_notifications_recipient        ON notifications (recipient_type, recipient_id);
CREATE INDEX idx_notifications_recipient_unread ON notifications (recipient_type, recipient_id, is_read);
CREATE INDEX idx_notifications_classroom_id     ON notifications (classroom_id);
CREATE INDEX idx_notifications_task_id          ON notifications (task_id);

-- ── refresh_tokens ────────────────────────────────────────────────────────────
CREATE TABLE refresh_tokens (
  id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id               INTEGER  NOT NULL,
  user_role             TEXT     NOT NULL CHECK (user_role IN ('admin','teacher','student')),
  token_hash            CHAR(64) NOT NULL,
  issued_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked_at            TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  replaced_by_token_id  INTEGER  NULL DEFAULT NULL,
  ip_address            VARCHAR(45)  NULL DEFAULT NULL,
  user_agent            VARCHAR(500) NULL DEFAULT NULL,
  CONSTRAINT uq_refresh_tokens_token_hash UNIQUE (token_hash),
  CONSTRAINT fk_refresh_replaced_by
    FOREIGN KEY (replaced_by_token_id) REFERENCES refresh_tokens(id)
    ON DELETE SET NULL
);

CREATE INDEX idx_refresh_user    ON refresh_tokens (user_role, user_id);
CREATE INDEX idx_refresh_expires ON refresh_tokens (expires_at);

-- ── email_verification_tokens ─────────────────────────────────────────────────
CREATE TABLE email_verification_tokens (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INTEGER  NOT NULL,
  user_role   TEXT     NOT NULL CHECK (user_role IN ('admin','teacher')),
  token_hash  CHAR(64) NOT NULL,
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at     TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_evt_token_hash UNIQUE (token_hash)
);

CREATE INDEX idx_evt_user ON email_verification_tokens (user_role, user_id);

-- ── password_reset_tokens ─────────────────────────────────────────────────────
CREATE TABLE password_reset_tokens (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INTEGER  NOT NULL,
  user_role   TEXT     NOT NULL CHECK (user_role IN ('admin','teacher','student')),
  token_hash  CHAR(64) NOT NULL,
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at     TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_prt_token_hash UNIQUE (token_hash)
);

CREATE INDEX idx_prt_user ON password_reset_tokens (user_role, user_id);

-- ── login_history ─────────────────────────────────────────────────────────────
CREATE TABLE login_history (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        INTEGER  NULL DEFAULT NULL,
  user_role      TEXT     NULL CHECK (user_role IN ('admin','teacher','student')),
  identifier     VARCHAR(150) NOT NULL,
  success        BOOLEAN  NOT NULL,
  failure_reason VARCHAR(100) NULL DEFAULT NULL,
  ip_address     VARCHAR(45)  NULL DEFAULT NULL,
  user_agent     VARCHAR(500) NULL DEFAULT NULL,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_history_user    ON login_history (user_role, user_id);
CREATE INDEX idx_login_history_created ON login_history (created_at);

-- ── audit_logs ────────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_type  VARCHAR(20)  NOT NULL,
  actor_id    INTEGER      NULL DEFAULT NULL,
  action      VARCHAR(100) NOT NULL,
  target_type VARCHAR(50)  NULL DEFAULT NULL,
  target_id   INTEGER      NULL DEFAULT NULL,
  details     JSONB        NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);
CREATE INDEX idx_audit_logs_actor      ON audit_logs (actor_type, actor_id);
CREATE INDEX idx_audit_logs_target     ON audit_logs (target_type, target_id);
