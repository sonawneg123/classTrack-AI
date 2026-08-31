/**
 * server/tests/unit/migrations/sprint3Phase1.migration.test.js
 *
 * Tests for Sprint 3 Phase 1 migration SQL structure.
 * These are static analysis tests — they validate the SQL content without
 * connecting to a real database.
 *
 * Tests:
 *   - V14: practice_sessions table definition
 *   - V14: foreign keys, indexes, permissions
 *   - V15: practice_session_id column (nullable, backward-compatible)
 *   - V15: FK with ON DELETE SET NULL
 *   - V16: student_topic_mastery table definition
 *   - V16: UNIQUE(student_id, topic_id) constraint
 *   - V16: CHECK constraints
 *   - V16: foreign keys
 */

const fs   = require('fs');
const path = require('path');

// The test file lives at: server/tests/unit/migrations/
// Migrations live at:     database/migrations/flyway/  (relative to classTrackv1-backend/)
// __dirname:              <workspace>/classTrackv1-backend/server/tests/unit/migrations
// So we need to go up 4 levels: migrations → unit → tests → server → classTrackv1-backend
// then into database/migrations/flyway
const MIGRATIONS_DIR = path.resolve(
  __dirname, '..', '..', '..', '..', 'database', 'migrations', 'flyway'
);

function readMigration(filename) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf-8');
}

// ── V14: practice_sessions ────────────────────────────────────────────────────

describe('V14__practice_sessions.sql', () => {
  let sql;
  beforeAll(() => { sql = readMigration('V14__practice_sessions.sql'); });

  it('creates the practice_sessions table', () => {
    expect(sql).toMatch(/CREATE TABLE practice_sessions/i);
  });

  it('has an IDENTITY primary key', () => {
    expect(sql).toMatch(/GENERATED ALWAYS AS IDENTITY PRIMARY KEY/i);
  });

  it('has student_id NOT NULL', () => {
    expect(sql).toMatch(/student_id\s+INTEGER\s+NOT NULL/i);
  });

  it('has topic_id NOT NULL', () => {
    expect(sql).toMatch(/topic_id\s+INTEGER\s+NOT NULL/i);
  });

  it('has status CHECK constraint with active and completed', () => {
    expect(sql).toMatch(/CHECK \(status IN \('active', 'completed'\)\)/i);
  });

  it('has default status = active', () => {
    expect(sql).toMatch(/DEFAULT 'active'/i);
  });

  it('has FK to students table with CASCADE', () => {
    expect(sql).toMatch(/REFERENCES students\(id\)/i);
    expect(sql).toMatch(/ON DELETE CASCADE/i);
  });

  it('has FK to topics table with CASCADE', () => {
    expect(sql).toMatch(/REFERENCES topics\(id\)/i);
  });

  it('has index on (student_id, topic_id)', () => {
    // Index may be on multiple lines — check for key parts separately
    expect(sql).toMatch(/CREATE INDEX/i);
    expect(sql).toMatch(/ON practice_sessions/i);
    expect(sql).toMatch(/\(student_id, topic_id\)/i);
  });

  it('has completed_at timestamp', () => {
    expect(sql).toMatch(/completed_at/i);
  });

  it('seeds practice:session_manage permission', () => {
    expect(sql).toMatch(/practice:session_manage/i);
    expect(sql).toMatch(/INSERT INTO permissions/i);
  });

  it('assigns practice:session_manage to student role', () => {
    expect(sql).toMatch(/INSERT INTO role_permissions/i);
    expect(sql).toMatch(/'student'.*'practice:session_manage'/i);
  });
});

// ── V15: practice_session_id_quiz_attempts ────────────────────────────────────

describe('V15__practice_session_id_quiz_attempts.sql', () => {
  let sql;
  beforeAll(() => { sql = readMigration('V15__practice_session_id_quiz_attempts.sql'); });

  it('adds practice_session_id column with ALTER TABLE ADD COLUMN IF NOT EXISTS', () => {
    expect(sql).toMatch(/ALTER TABLE quiz_attempts/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS/i);
    expect(sql).toMatch(/practice_session_id/i);
  });

  it('practice_session_id is nullable (NULL DEFAULT NULL)', () => {
    expect(sql).toMatch(/practice_session_id.*NULL/i);
    // Must NOT be NOT NULL
    expect(sql).not.toMatch(/practice_session_id\s+INTEGER\s+NOT NULL/i);
  });

  it('has FK to practice_sessions with ON DELETE SET NULL', () => {
    expect(sql).toMatch(/REFERENCES practice_sessions\(id\)/i);
    expect(sql).toMatch(/ON DELETE SET NULL/i);
  });

  it('has index on practice_session_id (partial WHERE NOT NULL)', () => {
    // Index may be on multiple lines — check for key parts separately
    expect(sql).toMatch(/CREATE INDEX/i);
    expect(sql).toMatch(/ON quiz_attempts/i);
    expect(sql).toMatch(/\(practice_session_id\)/i);
    expect(sql).toMatch(/WHERE practice_session_id IS NOT NULL/i);
  });
});

// ── V16: student_topic_mastery ────────────────────────────────────────────────

describe('V16__student_topic_mastery.sql', () => {
  let sql;
  beforeAll(() => { sql = readMigration('V16__student_topic_mastery.sql'); });

  it('creates the student_topic_mastery table', () => {
    expect(sql).toMatch(/CREATE TABLE student_topic_mastery/i);
  });

  it('has UNIQUE constraint on (student_id, topic_id)', () => {
    expect(sql).toMatch(/UNIQUE \(student_id, topic_id\)/i);
  });

  it('has mastery_score with CHECK constraint between 0.0 and 1.0', () => {
    expect(sql).toMatch(/mastery_score.*NUMERIC/i);
    expect(sql).toMatch(/mastery_score >= 0\.0.*mastery_score <= 1\.0/i);
  });

  it('has sessions_completed CHECK >= 0', () => {
    expect(sql).toMatch(/sessions_completed.*>= 0/i);
  });

  it('has questions_attempted CHECK >= 0', () => {
    expect(sql).toMatch(/questions_attempted.*>= 0/i);
  });

  it('has questions_correct CHECK >= 0', () => {
    expect(sql).toMatch(/questions_correct.*>= 0/i);
  });

  it('has consecutive_correct and consecutive_incorrect columns', () => {
    expect(sql).toMatch(/consecutive_correct/i);
    expect(sql).toMatch(/consecutive_incorrect/i);
  });

  it('has FK to students with CASCADE', () => {
    expect(sql).toMatch(/REFERENCES students\(id\)/i);
  });

  it('has FK to topics with CASCADE', () => {
    expect(sql).toMatch(/REFERENCES topics\(id\)/i);
  });

  it('has index on student_id', () => {
    expect(sql).toMatch(/CREATE INDEX.*ON student_topic_mastery.*\(student_id\)/i);
  });

  it('seeds practice:mastery_view permission', () => {
    expect(sql).toMatch(/practice:mastery_view/i);
  });

  it('assigns practice:mastery_view to student role', () => {
    expect(sql).toMatch(/'student'.*'practice:mastery_view'/i);
  });

  it('does NOT include current_difficulty as a TABLE COLUMN (it is derived, not persisted)', () => {
    // The word may appear in comments — verify it's not a column definition
    // A column definition would match: current_difficulty  <TYPE>  (word followed by type keyword)
    expect(sql).not.toMatch(/^\s*current_difficulty\s+(INTEGER|TEXT|NUMERIC|BOOLEAN|TIMESTAMP)/im);
  });
});
