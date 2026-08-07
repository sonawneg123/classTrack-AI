-- ============================================================================
--  ClassTrack AI — Migration 002: Enterprise Identity & Access Management
--  MySQL 8.0+
--
--  ADDITIVE ONLY. Does not drop, rename, or alter the meaning of any
--  existing column. Safe to run against a database that already has data
--  from test.sql (v1/v2 schema).
--
--  Run:  mysql -u root -p classtrack_ai < database/migrations/002_auth_enterprise.sql
-- ============================================================================

USE classtrack_ai;

-- ----------------------------------------------------------------------------
-- Account-security columns on existing identity tables
-- Students authenticate by username (no email column), so email verification
-- applies only to admins and teachers, who authenticate by email.
--
-- NOTE: "ADD COLUMN IF NOT EXISTS" requires MySQL 8.0.29+. If you're on an
-- older 8.0.x patch version, remove "IF NOT EXISTS" and run each ALTER once.
-- ----------------------------------------------------------------------------
ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS email_verified_at    TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INT       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until          TIMESTAMP NULL DEFAULT NULL;

ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS email_verified_at    TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INT       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until          TIMESTAMP NULL DEFAULT NULL;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS failed_login_attempts INT       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until          TIMESTAMP NULL DEFAULT NULL;

-- ----------------------------------------------------------------------------
-- REFRESH_TOKENS
-- Only the SHA-256 hash of the raw refresh token is ever stored — the raw
-- value is shown to the client exactly once, at issuance. Supports token
-- rotation: each use issues a new token and marks this row as replaced,
-- which allows reuse-of-a-rotated-token to be detected as token theft.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    user_id             INT                 NOT NULL,
    user_role           ENUM('admin','teacher','student') NOT NULL,
    token_hash          CHAR(64)            NOT NULL UNIQUE,   -- SHA-256 hex digest
    issued_at           TIMESTAMP           DEFAULT CURRENT_TIMESTAMP,
    expires_at          TIMESTAMP           NOT NULL,
    revoked_at          TIMESTAMP           NULL DEFAULT NULL,
    replaced_by_token_id INT                NULL,
    ip_address          VARCHAR(45)         NULL,
    user_agent          VARCHAR(500)        NULL,
    CONSTRAINT fk_refresh_replaced_by FOREIGN KEY (replaced_by_token_id) REFERENCES refresh_tokens(id)
        ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_refresh_user       ON refresh_tokens(user_role, user_id);
CREATE INDEX idx_refresh_expires    ON refresh_tokens(expires_at);

-- ----------------------------------------------------------------------------
-- EMAIL_VERIFICATION_TOKENS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT                 NOT NULL,
    user_role   ENUM('admin','teacher') NOT NULL,  -- students have no email
    token_hash  CHAR(64)            NOT NULL UNIQUE,
    expires_at  TIMESTAMP           NOT NULL,
    used_at     TIMESTAMP           NULL DEFAULT NULL,
    created_at  TIMESTAMP           DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE INDEX idx_email_verify_user ON email_verification_tokens(user_role, user_id);

-- ----------------------------------------------------------------------------
-- PASSWORD_RESET_TOKENS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT                 NOT NULL,
    user_role   ENUM('admin','teacher','student') NOT NULL,
    token_hash  CHAR(64)            NOT NULL UNIQUE,
    expires_at  TIMESTAMP           NOT NULL,
    used_at     TIMESTAMP           NULL DEFAULT NULL,
    created_at  TIMESTAMP           DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE INDEX idx_password_reset_user ON password_reset_tokens(user_role, user_id);

-- ----------------------------------------------------------------------------
-- LOGIN_HISTORY
-- One row per login ATTEMPT (success or failure) — the audit trail an admin
-- or a user can use to spot suspicious activity.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_history (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT                 NULL,       -- NULL if the identifier didn't match any account
    user_role       ENUM('admin','teacher','student') NULL,
    identifier      VARCHAR(150)        NOT NULL,    -- the email or username that was submitted
    success         TINYINT(1)          NOT NULL,
    failure_reason  VARCHAR(100)        NULL,        -- 'invalid_credentials' | 'account_locked' | 'account_disabled' | 'email_not_verified'
    ip_address      VARCHAR(45)         NULL,
    user_agent      VARCHAR(500)        NULL,
    created_at      TIMESTAMP           DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE INDEX idx_login_history_user    ON login_history(user_role, user_id);
CREATE INDEX idx_login_history_created ON login_history(created_at);

-- ----------------------------------------------------------------------------
-- PERMISSIONS  +  ROLE_PERMISSIONS
-- Backs the new authorizePermissions() middleware, which checks a named
-- permission (e.g. "classroom:create") instead of a hard-coded role string.
-- The canonical mapping also lives in code (see
-- server/src/constants/permissions.constants.js) for zero-latency checks at
-- request time; these tables exist so the mapping is inspectable/auditable
-- and can be extended (e.g. per-user permission overrides) without a code
-- deploy in the future.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(100) NOT NULL UNIQUE,   -- e.g. 'classroom:create'
    description VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS role_permissions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    role            ENUM('admin','teacher','student') NOT NULL,
    permission_code VARCHAR(100) NOT NULL,
    UNIQUE KEY uq_role_permission (role, permission_code),
    CONSTRAINT fk_role_permission_code FOREIGN KEY (permission_code) REFERENCES permissions(code)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- Seed the permission catalogue (idempotent — INSERT IGNORE)
INSERT IGNORE INTO permissions (code, description) VALUES
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

-- Seed the role → permission mapping (idempotent)
INSERT IGNORE INTO role_permissions (role, permission_code) VALUES
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
