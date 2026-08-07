-- =====================================================================
-- ClassTrack AI — complete database schema
-- Reverse-engineered from the current backend codebase (no schema.sql /
-- database.sql existed in this repository — this file was built entirely
-- by reading every repository, service, validator, controller, route,
-- and both existing migrations). Every column is evidenced from actual
-- code usage; anywhere evidence was incomplete, that's called out
-- explicitly in the Verification Report rather than silently guessed.
--
-- This file is a from-scratch build. It does not replace or reference
-- database/migrations/002_auth_enterprise.sql or 003_classroom_management.sql
-- as incremental steps — it produces their end-state directly, merged
-- with the base tables those migrations ALTERed.
-- =====================================================================

DROP DATABASE IF EXISTS classtrack_ai;
CREATE DATABASE classtrack_ai
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE classtrack_ai;

-- ---------------------------------------------------------------------
-- NOTE ON "roles": there is no `roles` lookup table anywhere in this
-- codebase. Role separation is structural — admins, teachers, and
-- students are three separate tables, not one `users` table with a role
-- column. `role_permissions.role` (below) is a plain ENUM of the three
-- role names, not a foreign key to a roles table, because no such table
-- is ever created or queried anywhere in the backend. Deviating from the
-- example table order given in the request for this reason — it does not
-- exist in this repository.
-- ---------------------------------------------------------------------

-- =====================================================================
-- permissions — CORRECTED to match 002_auth_enterprise.sql verbatim
-- (an earlier draft of this file incorrectly added a created_at column
-- that does not exist in the real migration — fixed here)
-- =====================================================================
CREATE TABLE permissions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(100)   NOT NULL,
  description VARCHAR(255)   NULL,
  UNIQUE KEY uq_permissions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- role_permissions — CORRECTED to match 002_auth_enterprise.sql verbatim.
-- An earlier draft of this file incorrectly modeled this as
-- permission_id INT FOREIGN KEY REFERENCES permissions(id). The real
-- migration references permissions BY CODE STRING
-- (permission_code VARCHAR(100) REFERENCES permissions(code)), not by
-- numeric id, and has no created_at column. Fixed here.
-- =====================================================================
CREATE TABLE role_permissions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  role            ENUM('admin','teacher','student') NOT NULL,
  permission_code VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_role_permission (role, permission_code),
  CONSTRAINT fk_role_permission_code
    FOREIGN KEY (permission_code) REFERENCES permissions(code)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- admins
-- Base columns (id, name, email, password_hash, is_active, created_at,
-- last_login_at) proven by: seed.js's `INSERT INTO admins (name, email,
-- password_hash)`, auth.service.js login/lockout logic, auth.controller
-- getMe's _toProfile reading is_active/created_at/last_login_at.
-- email_verified_at, failed_login_attempts, locked_until proven verbatim
-- by 002_auth_enterprise.sql's ALTER TABLE admins.
-- No created_by column: seed.js never sets one for admins, and no
-- repository query ever reads admins.created_by.
-- =====================================================================
CREATE TABLE admins (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  name                  VARCHAR(100)  NOT NULL,
  email                 VARCHAR(150)  NOT NULL,
  password_hash         VARCHAR(255)  NOT NULL,
  is_active             TINYINT(1)    NOT NULL DEFAULT 1,
  email_verified_at     TIMESTAMP     NULL DEFAULT NULL,
  failed_login_attempts INT           NOT NULL DEFAULT 0,
  locked_until          TIMESTAMP     NULL DEFAULT NULL,
  last_login_at         TIMESTAMP     NULL DEFAULT NULL,
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- teachers
-- Base columns proven the same way as admins. created_by proven by
-- admin.service.js's createTeacher (`created_by: adminId`) — but proven
-- NULLABLE by seed.js's `INSERT INTO teachers (name, email, password_hash)`,
-- which never sets it.
-- =====================================================================
CREATE TABLE teachers (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  name                  VARCHAR(100)  NOT NULL,
  email                 VARCHAR(150)  NOT NULL,
  password_hash         VARCHAR(255)  NOT NULL,
  created_by            INT           NULL DEFAULT NULL,
  is_active             TINYINT(1)    NOT NULL DEFAULT 1,
  email_verified_at     TIMESTAMP     NULL DEFAULT NULL,
  failed_login_attempts INT           NOT NULL DEFAULT 0,
  locked_until          TIMESTAMP     NULL DEFAULT NULL,
  last_login_at         TIMESTAMP     NULL DEFAULT NULL,
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_teachers_email (email),
  KEY idx_teachers_created_by (created_by),
  CONSTRAINT fk_teachers_created_by
    FOREIGN KEY (created_by) REFERENCES admins(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- classrooms
-- name/subject/section/class_code/teacher_id/is_active/created_at proven
-- by admin.service.js createClassroom, seed.js, classroom.repository.js.
-- class_code proven CHAR(8) by generateCode.util.js (fixed 8-character
-- alphabet-based code). deleted_at proven verbatim by
-- 003_classroom_management.sql.
--
-- ** created_by is a KNOWN LIMITATION, not proven as a clean FK: **
-- admin.service.js sets created_by = adminId; teacher.service.js sets
-- created_by = teacherId. The SAME column holds either an admins.id or a
-- teachers.id depending on who created the classroom, and there is no
-- companion "created_by_role" column anywhere in the code to disambiguate
-- which table it points to. This cannot be given a real FOREIGN KEY
-- constraint without picking one table arbitrarily (which would be
-- guessing) or breaking inserts from the other role. Left as a plain,
-- unconstrained INT column — flagged explicitly per your instruction not
-- to guess.
-- =====================================================================
CREATE TABLE classrooms (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150)  NOT NULL,
  subject     VARCHAR(100)  NULL DEFAULT NULL,
  section     VARCHAR(50)   NULL DEFAULT NULL,
  class_code  CHAR(8)       NOT NULL,
  teacher_id  INT           NOT NULL,
  created_by  INT           NULL DEFAULT NULL COMMENT 'Polymorphic: admins.id or teachers.id — see comment above. No FK by design.',
  is_active   TINYINT(1)    NOT NULL DEFAULT 1,
  deleted_at  TIMESTAMP     NULL DEFAULT NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_classrooms_class_code (class_code),
  KEY idx_classrooms_teacher_id (teacher_id),
  KEY idx_classrooms_teacher_deleted (teacher_id, deleted_at),
  KEY idx_classrooms_teacher_active_deleted (teacher_id, is_active, deleted_at),
  CONSTRAINT fk_classrooms_teacher
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- students
-- username/name/password_hash/classroom_id proven by seed.js and
-- auth.service.js studentLogin/studentRegister. username UNIQUE proven
-- by studentLogin's lookup-by-username. No email column: students
-- authenticate by username only (confirmed repeatedly across
-- auth.validator.js and auth.service.js). failed_login_attempts/
-- locked_until proven by 002's ALTER TABLE students. No
-- email_verified_at for students — 002's ALTER TABLE students explicitly
-- omits it (email verification is admin/teacher only).
-- =====================================================================
CREATE TABLE students (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  username              VARCHAR(30)   NOT NULL,
  name                  VARCHAR(100)  NOT NULL,
  password_hash         VARCHAR(255)  NOT NULL,
  classroom_id          INT           NOT NULL,
  is_active             TINYINT(1)    NOT NULL DEFAULT 1,
  failed_login_attempts INT           NOT NULL DEFAULT 0,
  locked_until          TIMESTAMP     NULL DEFAULT NULL,
  last_login_at         TIMESTAMP     NULL DEFAULT NULL,
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_students_username (username),
  KEY idx_students_classroom_id (classroom_id),
  CONSTRAINT fk_students_classroom
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- tasks
-- All columns proven directly from teacher.service.js's createTask
-- (classroom_id, teacher_id, title, description, instructions, max_score,
-- due_date, task_date) and teacher.validator.js's length limits.
-- is_active proven by task.repository.js's toggleTaskActive/WHERE clauses
-- — reused as the "published" flag for Task Management (Publish/Unpublish
-- set it explicitly rather than toggle it; the existing toggle-active
-- endpoint is unchanged and still works the same way).
--
-- Added for Teacher Task Management (this change):
-- deleted_at             — soft delete, same pattern as classrooms.deleted_at
-- ai_evaluation_enabled  — per-task AI evaluation toggle
-- allowed_file_types     — JSON array of allowed extensions for this task's
--                          submissions (a teacher-chosen subset of the
--                          platform-wide types already enforced by
--                          upload.middleware.js's ALLOWED_MIME; NULL means
--                          "use the platform default", not "no restriction")
--
-- Title uniqueness within a classroom is intentionally NOT a DB-level
-- UNIQUE KEY: MySQL has no partial/filtered unique index, so a plain
-- UNIQUE(classroom_id, title) would incorrectly block reusing a title
-- after the original task was soft-deleted. Enforced at the application
-- layer instead (existsDuplicateTitle), same reasoning as
-- classrooms.existsDuplicate.
-- =====================================================================
CREATE TABLE tasks (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  classroom_id           INT           NOT NULL,
  teacher_id             INT           NOT NULL,
  title                  VARCHAR(200)  NOT NULL,
  description            TEXT          NULL,
  instructions           TEXT          NULL,
  max_score              DECIMAL(6,2)  NOT NULL DEFAULT 100.00,
  due_date               DATE          NULL DEFAULT NULL,
  task_date              DATE          NULL DEFAULT NULL,
  is_active              TINYINT(1)    NOT NULL DEFAULT 1 COMMENT 'Doubles as the "published" flag — 1=published/visible to students, 0=unpublished/draft.',
  ai_evaluation_enabled  TINYINT(1)    NOT NULL DEFAULT 1,
  allowed_file_types     JSON          NULL DEFAULT NULL COMMENT 'e.g. ["pdf","docx"] — NULL means platform default applies.',
  deleted_at             TIMESTAMP     NULL DEFAULT NULL,
  created_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tasks_classroom_id (classroom_id),
  KEY idx_tasks_teacher_id (teacher_id),
  KEY idx_tasks_classroom_active (classroom_id, is_active),
  KEY idx_tasks_teacher_deleted (teacher_id, deleted_at),
  KEY idx_tasks_classroom_deleted (classroom_id, deleted_at),
  CONSTRAINT fk_tasks_classroom
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tasks_teacher
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- submissions
-- task_id/student_id/file_path/original_filename/file_type/typed_text
-- proven by submission.repository.js's create() INSERT column list.
-- status ENUM values proven by exact literal strings used throughout:
-- 'submitted', 'analyzing', 'analyzed', 'failed'.
-- ai_score/ai_summary/ai_strengths/ai_improvements/teacher_score/
-- teacher_feedback proven by submission_versions' identical column set
-- and admin.repository.js's dashboard query
-- (AVG(COALESCE(teacher_score, ai_score))).
-- score_overridden_by proven by teacher.service.js's overrideScore.
--
-- ** INFERRED, NOT DIRECTLY PROVEN: ** create()'s INSERT lists only 6
-- columns — status/submitted_at/attempt_number are never set explicitly
-- there, so for that INSERT to succeed against NOT NULL columns, these
-- MUST have database-level defaults. The values below are the only
-- defaults consistent with the rest of the codebase (resetForResubmit
-- later explicitly sets status back to 'submitted' and submitted_at to
-- NOW(), confirming those are the "fresh submission" values) — but the
-- exact DEFAULT clause is inferred, not read verbatim from a schema file.
-- =====================================================================
CREATE TABLE submissions (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  task_id              INT           NOT NULL,
  student_id           INT           NOT NULL,
  attempt_number       INT           NOT NULL DEFAULT 1,
  file_path            VARCHAR(500)  NULL DEFAULT NULL,
  original_filename    VARCHAR(255)  NULL DEFAULT NULL,
  file_type            VARCHAR(50)   NULL DEFAULT NULL,
  typed_text           LONGTEXT      NULL,
  extracted_text       LONGTEXT      NULL,
  status               ENUM('submitted','analyzing','analyzed','failed') NOT NULL DEFAULT 'submitted',
  ai_score             DECIMAL(6,2)  NULL DEFAULT NULL,
  ai_summary           TEXT          NULL,
  ai_strengths         JSON          NULL,
  ai_improvements      JSON          NULL,
  teacher_score        DECIMAL(6,2)  NULL DEFAULT NULL,
  teacher_feedback     TEXT          NULL,
  score_overridden_by  INT           NULL DEFAULT NULL,
  submitted_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  analyzed_at          TIMESTAMP     NULL DEFAULT NULL,
  created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_submissions_task_id (task_id),
  KEY idx_submissions_student_id (student_id),
  KEY idx_submissions_task_student (task_id, student_id),
  KEY idx_submissions_status (status),
  CONSTRAINT fk_submissions_task
    FOREIGN KEY (task_id) REFERENCES tasks(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_submissions_student
    FOREIGN KEY (student_id) REFERENCES students(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_submissions_overridden_by
    FOREIGN KEY (score_overridden_by) REFERENCES teachers(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- submission_versions
-- Every column proven verbatim from submission.repository.js's history
-- INSERT. created_at is NOT directly proven by any explicit column in
-- that INSERT — added for consistency with every other table's audit
-- trail, and because getSubmissionHistory's ordering only ever sorts by
-- attempt_number, not a timestamp, so this column is not exercised by
-- any query but is a reasonable, low-risk inclusion. Flagged as such.
-- =====================================================================
CREATE TABLE submission_versions (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  submission_id       INT           NOT NULL,
  attempt_number      INT           NOT NULL,
  file_path           VARCHAR(500)  NULL DEFAULT NULL,
  original_filename   VARCHAR(255)  NULL DEFAULT NULL,
  file_type           VARCHAR(50)   NULL DEFAULT NULL,
  typed_text          LONGTEXT      NULL,
  extracted_text      LONGTEXT      NULL,
  ai_score            DECIMAL(6,2)  NULL DEFAULT NULL,
  ai_summary          TEXT          NULL,
  ai_strengths        JSON          NULL,
  ai_improvements     JSON          NULL,
  teacher_score       DECIMAL(6,2)  NULL DEFAULT NULL,
  teacher_feedback    TEXT          NULL,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Not directly proven by any query — see comment above.',
  KEY idx_submission_versions_submission_id (submission_id),
  KEY idx_submission_versions_submission_attempt (submission_id, attempt_number),
  CONSTRAINT fk_submission_versions_submission
    FOREIGN KEY (submission_id) REFERENCES submissions(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- notifications
-- recipient_id/classroom_id/task_id/type/title/message/is_read/created_at
-- proven by notification.repository.js's insertOne/bulkInsert.
--
-- recipient_type: only the literal 'student' is ever actually observed
-- being passed at any call site read during this review; insertOne takes
-- a generic `recipientType` parameter (not hardcoded), implying admin/
-- teacher recipients are architecturally supported, but no call site
-- proving that was found. Modeled as VARCHAR(20) rather than a closed
-- ENUM('student') to avoid asserting a closed set that isn't proven.
-- type (e.g. 'task_posted'): same reasoning — open-ended, not a proven
-- closed set. VARCHAR, not ENUM.
-- =====================================================================
CREATE TABLE notifications (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  recipient_type VARCHAR(20)   NOT NULL COMMENT 'Only ''student'' is proven by evidence; column kept open per code design — see comment above.',
  recipient_id   INT           NOT NULL,
  classroom_id   INT           NULL DEFAULT NULL,
  task_id        INT           NULL DEFAULT NULL,
  type           VARCHAR(50)   NOT NULL,
  title          VARCHAR(255)  NOT NULL,
  message        TEXT          NULL,
  is_read        TINYINT(1)    NOT NULL DEFAULT 0,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notifications_recipient (recipient_type, recipient_id),
  KEY idx_notifications_recipient_unread (recipient_type, recipient_id, is_read),
  KEY idx_notifications_classroom_id (classroom_id),
  KEY idx_notifications_task_id (task_id),
  CONSTRAINT fk_notifications_classroom
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notifications_task
    FOREIGN KEY (task_id) REFERENCES tasks(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- refresh_tokens — CORRECTED to match 002_auth_enterprise.sql verbatim.
-- An earlier draft of this file fabricated a family_id column that does
-- not exist anywhere in the real code, and omitted the real ip_address/
-- user_agent columns (confirmed present via refreshToken.repository.js's
-- actual insert() INSERT statement). The real rotation mechanism is a
-- linked chain via replaced_by_token_id, not a family grouping column.
-- Fixed here.
-- =====================================================================
CREATE TABLE refresh_tokens (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  user_id               INT           NOT NULL,
  user_role             ENUM('admin','teacher','student') NOT NULL,
  token_hash            CHAR(64)      NOT NULL,
  issued_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at            TIMESTAMP     NOT NULL,
  revoked_at            TIMESTAMP     NULL DEFAULT NULL,
  replaced_by_token_id  INT           NULL DEFAULT NULL,
  ip_address            VARCHAR(45)   NULL DEFAULT NULL,
  user_agent            VARCHAR(500)  NULL DEFAULT NULL,
  UNIQUE KEY uq_refresh_tokens_token_hash (token_hash),
  KEY idx_refresh_user (user_role, user_id),
  KEY idx_refresh_expires (expires_at),
  CONSTRAINT fk_refresh_replaced_by
    FOREIGN KEY (replaced_by_token_id) REFERENCES refresh_tokens(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- email_verification_tokens — proven verbatim from 002_auth_enterprise.sql
-- =====================================================================
CREATE TABLE email_verification_tokens (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT           NOT NULL,
  user_role   ENUM('admin','teacher') NOT NULL,
  token_hash  CHAR(64)      NOT NULL,
  expires_at  TIMESTAMP     NOT NULL,
  used_at     TIMESTAMP     NULL DEFAULT NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_evt_token_hash (token_hash),
  KEY idx_evt_user (user_role, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- password_reset_tokens — proven verbatim from 002_auth_enterprise.sql
-- =====================================================================
CREATE TABLE password_reset_tokens (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT           NOT NULL,
  user_role   ENUM('admin','teacher','student') NOT NULL,
  token_hash  CHAR(64)      NOT NULL,
  expires_at  TIMESTAMP     NOT NULL,
  used_at     TIMESTAMP     NULL DEFAULT NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_prt_token_hash (token_hash),
  KEY idx_prt_user (user_role, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- login_history — CORRECTED to match 002_auth_enterprise.sql verbatim.
-- An earlier draft of this file used wrong column names
-- (email_or_username/reason instead of the real identifier/
-- failure_reason), wrongly made user_role NOT NULL (it's nullable —
-- login attempts against a nonexistent account still get logged, with
-- user_role NULL), and had the wrong user_agent length. Fixed here.
-- =====================================================================
CREATE TABLE login_history (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  user_id            INT           NULL DEFAULT NULL,
  user_role          ENUM('admin','teacher','student') NULL,
  identifier         VARCHAR(150)  NOT NULL,
  success            TINYINT(1)    NOT NULL,
  failure_reason     VARCHAR(100)  NULL DEFAULT NULL,
  ip_address         VARCHAR(45)   NULL DEFAULT NULL,
  user_agent         VARCHAR(500)  NULL DEFAULT NULL,
  created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_login_history_user (user_role, user_id),
  KEY idx_login_history_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- audit_logs
-- actor_type/actor_id/action/target_type/target_id/details proven by
-- audit.repository.js's insert(). created_at + the need for an index on
-- it proven by that same repository's list method
-- ('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?').
-- No FK on actor_id/target_id: this table logs events from admins,
-- teachers, AND students against many different target types — a single
-- polymorphic integer column cannot be validly foreign-keyed to more
-- than one table, same reasoning as classrooms.created_by above.
-- =====================================================================
CREATE TABLE audit_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  actor_type  VARCHAR(20)   NOT NULL,
  actor_id    INT           NULL DEFAULT NULL,
  action      VARCHAR(100)  NOT NULL,
  target_type VARCHAR(50)   NULL DEFAULT NULL,
  target_id   INT           NULL DEFAULT NULL,
  details     JSON          NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_logs_created_at (created_at),
  KEY idx_audit_logs_actor (actor_type, actor_id),
  KEY idx_audit_logs_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- permissions + role_permissions seed data — CORRECTED to match
-- 002_auth_enterprise.sql verbatim. An earlier draft of this file used
-- only 8 of the real 15 permission codes and referenced permissions by
-- numeric id instead of by code string. Cross-verified against both the
-- migration and server/src/constants/permissions.constants.js (the
-- in-code fast-path copy of this same data), which match each other
-- exactly. Fixed here.
-- =====================================================================
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
  ('audit:view',             'View platform audit logs');

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
  ('student', 'report:view_own');
