/**
 * server/seed.js
 *
 * Run once after setting up the database (via setup-db.js or Flyway):
 *      cd server && npm run seed
 *
 * Creates (skips anything that already exists):
 *   - Admin   : admin@classtrack.ai   / Admin@123
 *   - Teacher : teacher@classtrack.ai / Teacher@123
 *   - Classroom "Grade 8 - Mathematics" with class code DEMO1234
 *   - Student : username "demo_student" / Demo@123  (enrolled in DEMO1234)
 *
 * PostgreSQL-compatible: uses $1/$2/… placeholders and RETURNING id.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, testConnection } = require('./src/database/connection');
const logger = require('./src/utils/logger.util');

async function upsertAdmin() {
  const [rows] = await pool.query('SELECT id FROM admins WHERE email = $1', ['admin@classtrack.ai']);
  if (rows.length) { console.log('• Admin already exists, skipping.'); return; }
  const hash = await bcrypt.hash('Admin@123', 10);
  await pool.query('INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3)',
    ['Super Admin', 'admin@classtrack.ai', hash]);
  console.log('✅ Admin created -> admin@classtrack.ai / Admin@123');
}

async function upsertTeacher() {
  const [rows] = await pool.query('SELECT id FROM teachers WHERE email = $1', ['teacher@classtrack.ai']);
  if (rows.length) { console.log('• Sample teacher already exists, skipping.'); return rows[0].id; }
  const hash = await bcrypt.hash('Teacher@123', 10);
  const [ins] = await pool.query(
    'INSERT INTO teachers (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    ['Mrs. Anita Sharma', 'teacher@classtrack.ai', hash]
  );
  console.log('✅ Sample teacher created -> teacher@classtrack.ai / Teacher@123');
  return ins[0].id;
}

async function upsertClassroom(teacherId) {
  const [rows] = await pool.query('SELECT id FROM classrooms WHERE class_code = $1', ['DEMO1234']);
  if (rows.length) { console.log('• Sample classroom already exists, skipping.'); return rows[0].id; }
  const [ins] = await pool.query(
    'INSERT INTO classrooms (name, subject, section, class_code, teacher_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    ['Grade 8 - Mathematics', 'Mathematics', 'A', 'DEMO1234', teacherId]
  );
  console.log('✅ Sample classroom created -> code DEMO1234');
  return ins[0].id;
}

async function upsertDemoStudent(classroomId) {
  const [rows] = await pool.query('SELECT id FROM students WHERE username = $1', ['demo_student']);
  if (rows.length) { console.log('• Demo student already exists, skipping.'); return; }
  const hash = await bcrypt.hash('Demo@123', 10);
  await pool.query(
    'INSERT INTO students (username, name, password_hash, classroom_id) VALUES ($1, $2, $3, $4)',
    ['demo_student', 'Demo Student', hash, classroomId]
  );
  console.log('✅ Demo student created -> username: demo_student / Demo@123');
}

(async () => {
  try {
    await testConnection();
    await upsertAdmin();
    const teacherId   = await upsertTeacher();
    const classroomId = await upsertClassroom(teacherId);
    if (classroomId) await upsertDemoStudent(classroomId);
    console.log('\nSeed complete. You can now start the server and log in.');
  } catch (err) {
    logger.error('Seed failed', { error: err.message, stack: err.stack });
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
