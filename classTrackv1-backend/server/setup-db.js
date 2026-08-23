/**
 * server/setup-db.js
 *
 * One-shot script that creates every table the application expects
 * (using CREATE TABLE IF NOT EXISTS — safe to re-run; never drops data)
 * and then seeds the default admin, teacher, classroom and demo student.
 *
 * Run:
 *   cd classTrackv1-backend/server
 *   node setup-db.js
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * database/database.sql begins with DROP DATABASE / CREATE DATABASE, so
 * running it through the mysql CLI would destroy the existing database.
 * This script applies only the CREATE TABLE and INSERT statements against
 * whatever DB_NAME is configured in your .env — no DROP, no data loss.
 *
 * It is equivalent to running database.sql, migrations 002 and 003, and
 * seed.js in one step.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql  = require('mysql2/promise');

const cfg = {
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
  multipleStatements: true,
};

if (!cfg.database) {
  console.error('ERROR: DB_NAME is not set in .env');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// All CREATE TABLE statements — IF NOT EXISTS so re-running is safe
// ---------------------------------------------------------------------------
const CREATE_TABLES = `

-- ── permissions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(100)  NOT NULL,
  description VARCHAR(255)  NULL,
  UNIQUE KEY uq_permissions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── role_permissions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  role            ENUM('admin','teacher','student') NOT NULL,
  permission_code VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_role_permission (role, permission_code),
  CONSTRAINT fk_role_permission_code
    FOREIGN KEY (permission_code) REFERENCES permissions(code)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── admins ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
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

-- ── teachers ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teachers (
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

-- ── classrooms ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classrooms (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150)  NOT NULL,
  subject     VARCHAR(100)  NULL DEFAULT NULL,
  section     VARCHAR(50)   NULL DEFAULT NULL,
  class_code  CHAR(8)       NOT NULL,
  teacher_id  INT           NOT NULL,
  created_by  INT           NULL DEFAULT NULL,
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

-- ── students ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
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

-- ── tasks ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  classroom_id             INT           NOT NULL,
  teacher_id               INT           NOT NULL,
  title                    VARCHAR(200)  NOT NULL,
  description              TEXT          NULL,
  instructions             TEXT          NULL,
  max_score                DECIMAL(6,2)  NOT NULL DEFAULT 100.00,
  due_date                 DATE          NULL DEFAULT NULL,
  task_date                DATE          NULL DEFAULT NULL,
  is_active                TINYINT(1)    NOT NULL DEFAULT 1,
  ai_evaluation_enabled    TINYINT(1)    NOT NULL DEFAULT 1,
  allowed_file_types       JSON          NULL DEFAULT NULL,
  late_submission_allowed  TINYINT(1)    NOT NULL DEFAULT 0,
  max_file_size_mb         INT           NULL DEFAULT NULL,
  archived_at              TIMESTAMP     NULL DEFAULT NULL,
  deleted_at               TIMESTAMP     NULL DEFAULT NULL,
  created_at               TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tasks_classroom_id (classroom_id),
  KEY idx_tasks_teacher_id (teacher_id),
  KEY idx_tasks_classroom_active (classroom_id, is_active),
  KEY idx_tasks_teacher_deleted (teacher_id, deleted_at),
  KEY idx_tasks_classroom_deleted (classroom_id, deleted_at),
  KEY idx_tasks_archived (teacher_id, archived_at),
  CONSTRAINT fk_tasks_classroom
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tasks_teacher
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── submissions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS submissions (
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

-- ── submission_versions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS submission_versions (
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
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_submission_versions_submission_id (submission_id),
  KEY idx_submission_versions_submission_attempt (submission_id, attempt_number),
  CONSTRAINT fk_submission_versions_submission
    FOREIGN KEY (submission_id) REFERENCES submissions(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  recipient_type VARCHAR(20)   NOT NULL,
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

-- ── refresh_tokens ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
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

-- ── email_verification_tokens ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_verification_tokens (
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

-- ── password_reset_tokens ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
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

-- ── login_history ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_history (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT           NULL DEFAULT NULL,
  user_role      ENUM('admin','teacher','student') NULL,
  identifier     VARCHAR(150)  NOT NULL,
  success        TINYINT(1)    NOT NULL,
  failure_reason VARCHAR(100)  NULL DEFAULT NULL,
  ip_address     VARCHAR(45)   NULL DEFAULT NULL,
  user_agent     VARCHAR(500)  NULL DEFAULT NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_login_history_user (user_role, user_id),
  KEY idx_login_history_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── audit_logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
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
`;

// ---------------------------------------------------------------------------
// Seed helpers — all idempotent (check-before-insert)
// ---------------------------------------------------------------------------
async function seedPermissions(pool) {
  const rows = [
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
    ['student:manage',       'Reset a student\'s password (teacher/admin)'],
    ['report:view_any',      'View or export reports for any classroom'],
    ['report:view_own',      "View or export the current user's own report"],
    ['audit:view',           'View platform audit logs'],
  ];
  for (const [code, desc] of rows) {
    await pool.query('INSERT IGNORE INTO permissions (code, description) VALUES (?, ?)', [code, desc]);
  }

  const rolePerms = [
    ['admin',   'platform:manage'],
    ['admin',   'teacher:create'],
    ['admin',   'teacher:manage'],
    ['admin',   'classroom:create'],
    ['admin',   'classroom:manage_any'],
    ['admin',   'report:view_any'],
    ['admin',   'audit:view'],
    ['teacher', 'classroom:manage_own'],
    ['teacher', 'task:create'],
    ['teacher', 'task:manage_own'],
    ['teacher', 'submission:grade'],
    ['teacher', 'student:manage'],
    ['teacher', 'report:view_own'],
    ['student', 'submission:submit'],
    ['student', 'submission:view_own'],
    ['student', 'report:view_own'],
  ];
  for (const [role, code] of rolePerms) {
    await pool.query(
      'INSERT IGNORE INTO role_permissions (role, permission_code) VALUES (?, ?)',
      [role, code]
    );
  }
  console.log('✅  permissions + role_permissions seeded');
}

async function seedAdmin(pool) {
  const [[row]] = await pool.query('SELECT id FROM admins WHERE email = ?', ['admin@classtrack.ai']);
  if (row) { console.log('•  Admin already exists, skipping.'); return; }
  const hash = await bcrypt.hash('Admin@123', 10);
  await pool.query(
    'INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)',
    ['Super Admin', 'admin@classtrack.ai', hash]
  );
  console.log('✅  Admin created  →  admin@classtrack.ai / Admin@123');
}

async function seedTeacher(pool) {
  const [[row]] = await pool.query('SELECT id FROM teachers WHERE email = ?', ['teacher@classtrack.ai']);
  if (row) { console.log('•  Teacher already exists, skipping.'); return row.id; }
  const hash = await bcrypt.hash('Teacher@123', 10);
  const [result] = await pool.query(
    'INSERT INTO teachers (name, email, password_hash) VALUES (?, ?, ?)',
    ['Mrs. Anita Sharma', 'teacher@classtrack.ai', hash]
  );
  console.log('✅  Teacher created  →  teacher@classtrack.ai / Teacher@123');
  return result.insertId;
}

async function seedClassroom(pool, teacherId) {
  const [[row]] = await pool.query('SELECT id FROM classrooms WHERE class_code = ?', ['DEMO1234']);
  if (row) { console.log('•  Classroom already exists, skipping.'); return row.id; }
  const [result] = await pool.query(
    'INSERT INTO classrooms (name, subject, section, class_code, teacher_id, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    ['Grade 8 - Mathematics', 'Mathematics', 'A', 'DEMO1234', teacherId, teacherId]
  );
  console.log('✅  Classroom created  →  code DEMO1234');
  return result.insertId;
}

async function seedStudent(pool, classroomId) {
  const [[row]] = await pool.query('SELECT id FROM students WHERE username = ?', ['demo_student']);
  if (row) { console.log('•  Demo student already exists, skipping.'); return; }
  const hash = await bcrypt.hash('Demo@123', 10);
  await pool.query(
    'INSERT INTO students (username, name, password_hash, classroom_id) VALUES (?, ?, ?, ?)',
    ['demo_student', 'Demo Student', hash, classroomId]
  );
  console.log('✅  Student created  →  username: demo_student / Demo@123');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  let pool;
  try {
    pool = await mysql.createPool({ ...cfg, waitForConnections: true, connectionLimit: 5 });

    // Verify connection
    const conn = await pool.getConnection();
    console.log(`\n✅  Connected to MySQL  →  database: ${cfg.database}\n`);
    conn.release();

    // Create all tables
    console.log('Creating tables (IF NOT EXISTS — safe to re-run)…');
    await pool.query(CREATE_TABLES);
    console.log('✅  All tables verified / created.\n');

    // Seed reference data and demo accounts
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

  } catch (err) {
    console.error('\n❌  Setup failed:', err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error('   → Is MySQL running? Check DB_HOST / DB_PORT in .env');
    }
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   → Wrong DB_USER / DB_PASSWORD in .env');
    }
    if (err.code === 'ER_BAD_DB_ERROR') {
      console.error(`   → Database "${cfg.database}" does not exist.`);
      console.error(`     Create it first:  CREATE DATABASE \`${cfg.database}\`;`);
    }
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end();
  }
})();
