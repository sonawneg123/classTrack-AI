/**
 * server/setup-db.js
 *
 * One-shot PostgreSQL schema bootstrap (without Flyway).
 * Safe to re-run — CREATE TABLE IF NOT EXISTS / INSERT ... ON CONFLICT.
 *
 * This script is the manual alternative to running Flyway.
 * Flyway is the recommended approach for production (see docker-compose.yml).
 *
 * Run:
 *   cd classTrackv1-backend/server
 *   node setup-db.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const cfg = {
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT) || 5432,
  user:     process.env.DB_USER     || 'classtrack',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
};

if (!cfg.database) {
  console.error('ERROR: DB_NAME is not set in .env');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Schema DDL — identical to V1__initial_schema.sql but with IF NOT EXISTS
// ---------------------------------------------------------------------------
const CREATE_TABLES = `

-- ── permissions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  CONSTRAINT uq_permissions_code UNIQUE (code)
);

-- ── role_permissions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role            TEXT NOT NULL CHECK (role IN ('admin','teacher','student')),
  permission_code VARCHAR(100) NOT NULL,
  CONSTRAINT uq_role_permission UNIQUE (role, permission_code),
  CONSTRAINT fk_role_permission_code
    FOREIGN KEY (permission_code) REFERENCES permissions(code)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- ── admins ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
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

-- ── teachers ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teachers (
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

CREATE INDEX IF NOT EXISTS idx_teachers_created_by ON teachers (created_by);

-- ── classrooms ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classrooms (
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

CREATE INDEX IF NOT EXISTS idx_classrooms_teacher_id             ON classrooms (teacher_id);
CREATE INDEX IF NOT EXISTS idx_classrooms_teacher_deleted        ON classrooms (teacher_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_classrooms_teacher_active_deleted ON classrooms (teacher_id, is_active, deleted_at);

-- ── students ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
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

CREATE INDEX IF NOT EXISTS idx_students_classroom_id ON students (classroom_id);

-- ── tasks ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
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

CREATE INDEX IF NOT EXISTS idx_tasks_classroom_id      ON tasks (classroom_id);
CREATE INDEX IF NOT EXISTS idx_tasks_teacher_id        ON tasks (teacher_id);
CREATE INDEX IF NOT EXISTS idx_tasks_classroom_active  ON tasks (classroom_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tasks_teacher_deleted   ON tasks (teacher_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_tasks_classroom_deleted ON tasks (classroom_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_tasks_archived          ON tasks (teacher_id, archived_at);

-- ── submissions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS submissions (
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

CREATE INDEX IF NOT EXISTS idx_submissions_task_id      ON submissions (task_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student_id   ON submissions (student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_task_student ON submissions (task_id, student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status       ON submissions (status);

-- ── submission_versions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS submission_versions (
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

CREATE INDEX IF NOT EXISTS idx_submission_versions_submission_id      ON submission_versions (submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_versions_submission_attempt ON submission_versions (submission_id, attempt_number);

-- ── notifications ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
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

CREATE INDEX IF NOT EXISTS idx_notifications_recipient        ON notifications (recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON notifications (recipient_type, recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_classroom_id     ON notifications (classroom_id);
CREATE INDEX IF NOT EXISTS idx_notifications_task_id          ON notifications (task_id);

-- ── refresh_tokens ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
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

CREATE INDEX IF NOT EXISTS idx_refresh_user    ON refresh_tokens (user_role, user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens (expires_at);

-- ── email_verification_tokens ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INTEGER  NOT NULL,
  user_role   TEXT     NOT NULL CHECK (user_role IN ('admin','teacher')),
  token_hash  CHAR(64) NOT NULL,
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at     TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_evt_token_hash UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_evt_user ON email_verification_tokens (user_role, user_id);

-- ── password_reset_tokens ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INTEGER  NOT NULL,
  user_role   TEXT     NOT NULL CHECK (user_role IN ('admin','teacher','student')),
  token_hash  CHAR(64) NOT NULL,
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at     TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_prt_token_hash UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens (user_role, user_id);

-- ── login_history ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_history (
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

CREATE INDEX IF NOT EXISTS idx_login_history_user    ON login_history (user_role, user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_created ON login_history (created_at);

-- ── audit_logs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_type  VARCHAR(20)  NOT NULL,
  actor_id    INTEGER      NULL DEFAULT NULL,
  action      VARCHAR(100) NOT NULL,
  target_type VARCHAR(50)  NULL DEFAULT NULL,
  target_id   INTEGER      NULL DEFAULT NULL,
  details     JSONB        NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor      ON audit_logs (actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target     ON audit_logs (target_type, target_id);
`;

// ---------------------------------------------------------------------------
// Seed helpers — idempotent (ON CONFLICT DO NOTHING)
// ---------------------------------------------------------------------------
async function seedPermissions(pool) {
  const perms = [
    ['platform:manage',      'Full administrative control of the platform'],
    ['teacher:create',       'Create teacher accounts'],
    ['teacher:manage',       'Enable/disable teachers, reset their passwords'],
    ['classroom:create',     'Create classrooms'],
    ['classroom:manage_any', 'Manage any classroom on the platform'],
    ['classroom:manage_own', 'Manage classrooms owned by the current teacher'],
    ['task:create',          'Post a task to a classroom'],
    ['task:manage_own',      'Edit/hide tasks the current teacher created'],
    ['submission:grade',     'Override AI scores and grade submissions'],
    ['submission:view_own',  "View the current student's own submissions"],
    ['submission:submit',    'Submit work for a task'],
    ['student:manage',       "Reset a student's password (teacher/admin)"],
    ['report:view_any',      'View or export reports for any classroom'],
    ['report:view_own',      "View or export the current user's own report"],
    ['audit:view',           'View platform audit logs'],
  ];
  for (const [code, desc] of perms) {
    await pool.query(
      'INSERT INTO permissions (code, description) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING',
      [code, desc]
    );
  }

  const rolePerms = [
    ['admin',   'platform:manage'], ['admin',   'teacher:create'],
    ['admin',   'teacher:manage'],  ['admin',   'classroom:create'],
    ['admin',   'classroom:manage_any'], ['admin', 'report:view_any'], ['admin', 'audit:view'],
    ['teacher', 'classroom:manage_own'], ['teacher', 'task:create'],
    ['teacher', 'task:manage_own'], ['teacher', 'submission:grade'],
    ['teacher', 'student:manage'],  ['teacher', 'report:view_own'],
    ['student', 'submission:submit'], ['student', 'submission:view_own'], ['student', 'report:view_own'],
  ];
  for (const [role, code] of rolePerms) {
    await pool.query(
      'INSERT INTO role_permissions (role, permission_code) VALUES ($1, $2) ON CONFLICT (role, permission_code) DO NOTHING',
      [role, code]
    );
  }
  console.log('✅  permissions + role_permissions seeded');
}

async function seedAdmin(pool) {
  const { rows } = await pool.query('SELECT id FROM admins WHERE email = $1', ['admin@classtrack.ai']);
  if (rows.length) { console.log('•  Admin already exists, skipping.'); return; }
  const hash = await bcrypt.hash('Admin@123', 10);
  await pool.query('INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3)', ['Super Admin', 'admin@classtrack.ai', hash]);
  console.log('✅  Admin created  →  admin@classtrack.ai / Admin@123');
}

async function seedTeacher(pool) {
  const { rows } = await pool.query('SELECT id FROM teachers WHERE email = $1', ['teacher@classtrack.ai']);
  if (rows.length) { console.log('•  Teacher already exists, skipping.'); return rows[0].id; }
  const hash = await bcrypt.hash('Teacher@123', 10);
  const { rows: ins } = await pool.query(
    'INSERT INTO teachers (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    ['Mrs. Anita Sharma', 'teacher@classtrack.ai', hash]
  );
  console.log('✅  Teacher created  →  teacher@classtrack.ai / Teacher@123');
  return ins[0].id;
}

async function seedClassroom(pool, teacherId) {
  const { rows } = await pool.query('SELECT id FROM classrooms WHERE class_code = $1', ['DEMO1234']);
  if (rows.length) { console.log('•  Classroom already exists, skipping.'); return rows[0].id; }
  const { rows: ins } = await pool.query(
    'INSERT INTO classrooms (name, subject, section, class_code, teacher_id, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    ['Grade 8 - Mathematics', 'Mathematics', 'A', 'DEMO1234', teacherId, teacherId]
  );
  console.log('✅  Classroom created  →  code DEMO1234');
  return ins[0].id;
}

async function seedStudent(pool, classroomId) {
  const { rows } = await pool.query('SELECT id FROM students WHERE username = $1', ['demo_student']);
  if (rows.length) { console.log('•  Demo student already exists, skipping.'); return; }
  const hash = await bcrypt.hash('Demo@123', 10);
  await pool.query(
    'INSERT INTO students (username, name, password_hash, classroom_id) VALUES ($1, $2, $3, $4)',
    ['demo_student', 'Demo Student', hash, classroomId]
  );
  console.log('✅  Student created  →  username: demo_student / Demo@123');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  const pool = new Pool({ ...cfg, max: 5 });
  try {
    const client = await pool.connect();
    console.log(`\n✅  Connected to PostgreSQL  →  database: ${cfg.database}\n`);
    client.release();

    console.log('Creating tables (IF NOT EXISTS — safe to re-run)…');
    // pg does not support multi-statement in a single query() call — split on ;
    const statements = CREATE_TABLES.split(';').map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await pool.query(stmt);
    }
    console.log('✅  All tables verified / created.\n');

    console.log('Seeding data…');
    await seedPermissions(pool);
    await seedAdmin(pool);
    const teacherId   = await seedTeacher(pool);
    const classroomId = await seedClassroom(pool, teacherId);
    if (classroomId) await seedStudent(pool, classroomId);

    console.log('\n─────────────────────────────────────────────────────');
    console.log('Setup complete. Start the server with:');
    console.log('  npm run dev   (or npm start)');
    console.log('\nDemo credentials:');
    console.log('  Admin   →  admin@classtrack.ai   /  Admin@123');
    console.log('  Teacher →  teacher@classtrack.ai /  Teacher@123');
    console.log('  Student →  demo_student          /  Demo@123');
    console.log('─────────────────────────────────────────────────────\n');
    console.log('NOTE: This script is the manual alternative to Flyway.');
    console.log('For production, prefer: docker compose run --rm flyway');

  } catch (err) {
    console.error('\n❌  Setup failed:', err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error('   → Is PostgreSQL running? Check DB_HOST / DB_PORT in .env');
    }
    if (err.code === '28P01') {
      console.error('   → Wrong DB_USER / DB_PASSWORD in .env');
    }
    if (err.code === '3D000') {
      console.error(`   → Database "${cfg.database}" does not exist.`);
      console.error(`     Create it first:  CREATE DATABASE "${cfg.database}";`);
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
