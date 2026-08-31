/**
 * server/tests/integration/adminDashboard.integration.test.js
 *
 * Integration tests for GET /api/v1/admin/dashboard
 *
 * Real Express app + real routing/validation/controllers/services.
 * Database layer is mocked — no live PostgreSQL required.
 *
 * Tests:
 *  1.  Admin receives 200
 *  2.  Teacher receives 403
 *  3.  Student receives 403
 *  4.  Unauthenticated receives 401
 *  5.  Student count correct
 *  6.  Teacher count correct
 *  7.  Classroom count correct
 *  8.  Assignment (task) count correct
 *  9.  Submission count correct
 *  10. Evaluation statistics correct
 *  11. Activity feed contains real records
 *  12. Alerts correctly calculated
 *  13. No password/hash/token fields returned
 *  14. Empty database returns zeros
 *  15. Database query failures handled (500)
 */

// ── Mock database BEFORE requiring app ────────────────────────────────────────
jest.mock('../../src/database/connection', () => ({
  pool: { query: jest.fn() },
  testConnection: jest.fn(),
}));

jest.mock('../../src/repositories/admin.repository', () => ({
  findByEmail:        jest.fn(),
  findById:           jest.fn(),
  updateById:         jest.fn(),
  updateLastLogin:    jest.fn(),
  markEmailVerified:  jest.fn(),
  incrementFailedAttempts: jest.fn(),
  resetFailedAttempts:     jest.fn(),
  lockUntil:          jest.fn(),
  isCurrentlyLocked:  jest.fn().mockReturnValue(false),
  getPlatformStats:   jest.fn(),
  getDashboardData:   jest.fn(),
}));

jest.mock('../../src/repositories/teacher.repository', () => ({
  findByEmail:  jest.fn(),
  findById:     jest.fn(),
  updateById:   jest.fn(),
  updateLastLogin: jest.fn(),
  markEmailVerified: jest.fn(),
  updatePassword:  jest.fn(),
  incrementFailedAttempts: jest.fn(),
  resetFailedAttempts:     jest.fn(),
  lockUntil:    jest.fn(),
  isCurrentlyLocked: jest.fn().mockReturnValue(false),
}));

jest.mock('../../src/repositories/student.repository', () => ({
  findByUsername: jest.fn(),
  findById:       jest.fn(),
  existsByUsername: jest.fn(),
  findByEmail:    jest.fn(),
  findByMobile:   jest.fn(),
  updateById:     jest.fn(),
  updateLastLogin: jest.fn(),
  updatePassword: jest.fn(),
  create:         jest.fn(),
  incrementFailedAttempts: jest.fn(),
  resetFailedAttempts:     jest.fn(),
  lockUntil:      jest.fn(),
  isCurrentlyLocked: jest.fn().mockReturnValue(false),
}));

jest.mock('../../src/repositories/classroom.repository', () => ({
  findByCode:   jest.fn(),
  existsByCode: jest.fn(),
}));

jest.mock('../../src/repositories/audit.repository', () => ({
  insert: jest.fn().mockResolvedValue(undefined),
  list:   jest.fn(),
}));

jest.mock('../../src/repositories/loginHistory.repository', () => ({
  record: jest.fn().mockResolvedValue(undefined),
  listForUser: jest.fn(),
  countRecentFailures: jest.fn(),
}));

jest.mock('../../src/repositories/refreshToken.repository', () => ({
  create:        jest.fn(),
  findByHash:    jest.fn(),
  revoke:        jest.fn(),
  revokeAllForUser: jest.fn(),
  deleteExpired: jest.fn(),
}));

jest.mock('../../src/repositories/passwordResetToken.repository', () => ({
  create:         jest.fn(),
  findValidByHash: jest.fn(),
  markUsed:       jest.fn(),
  deleteExpiredForUser: jest.fn(),
}));

jest.mock('../../src/repositories/emailVerificationToken.repository', () => ({
  create:         jest.fn(),
  findValidByHash: jest.fn(),
  markUsed:       jest.fn(),
  deleteForUser:  jest.fn(),
}));

jest.mock('../../src/services/email.service', () => ({
  sendPasswordResetEmail:     jest.fn().mockResolvedValue(undefined),
  sendEmailVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendWelcomeEmail:           jest.fn().mockResolvedValue(undefined),
}));

// ── Imports ───────────────────────────────────────────────────────────────────
const request = require('supertest');
const app     = require('../../app');

const adminRepo   = require('../../src/repositories/admin.repository');
const teacherRepo = require('../../src/repositories/teacher.repository');
const studentRepo = require('../../src/repositories/student.repository');
const { pool }    = require('../../src/database/connection');
const { issueAccessToken } = require('../../src/services/token.service');

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_ACCOUNT = {
  id: 1, name: 'Admin', email: 'admin@test.com', is_active: true,
  failed_login_attempts: 0, locked_until: null,
};
const TEACHER_ACCOUNT = {
  id: 2, name: 'Teacher', email: 'teacher@test.com', is_active: true,
  failed_login_attempts: 0, locked_until: null,
};
const STUDENT_ACCOUNT = {
  id: 3, name: 'Student', username: 'student1', is_active: true,
  failed_login_attempts: 0, locked_until: null,
};

function adminToken()   { return issueAccessToken({ id: 1, role: 'admin',   name: 'Admin' }); }
function teacherToken() { return issueAccessToken({ id: 2, role: 'teacher', name: 'Teacher' }); }
function studentToken() { return issueAccessToken({ id: 3, role: 'student', name: 'Student' }); }

// ── Default mock data ─────────────────────────────────────────────────────────

const FULL_COUNTS = {
  teacher_total:       5,
  teacher_active:      4,
  teacher_inactive:    1,
  teacher_unassigned:  1,
  student_total:       30,
  student_active:      28,
  student_inactive:    2,
  classroom_total:     3,
  classroom_active:    3,
  classroom_inactive:  0,
  task_total:          20,
  task_active:         15,
  submission_total:    60,
  submission_pending:  5,
  submission_analyzing: 2,
  submission_analyzed:  50,
  submission_failed:    3,
  reg_codes_active:    1,
  reg_codes_expired:   2,
};

const CLASSROOM_ROWS = [
  {
    id: 1, name: 'Class 8-A', subject: 'Math', section: 'A',
    class_code: 'ABCD1234', is_active: true, created_at: new Date().toISOString(),
    teacher_id: 2, teacher_name: 'Mrs. Sharma', teacher_is_active: true,
    student_count: 10, task_count: 7,
  },
];

const ACTIVITY_ROWS = [
  {
    id: 1, actor_type: 'admin', actor_id: 1, actor_name: 'Admin',
    action: 'teacher_created', target_type: 'teacher', target_id: 2,
    details: { name: 'Mrs. Sharma', email: 'sharma@school.edu' },
    created_at: new Date().toISOString(),
  },
  {
    id: 2, actor_type: 'admin', actor_id: 1, actor_name: 'Admin',
    action: 'classroom_created', target_type: 'classroom', target_id: 1,
    details: { name: 'Class 8-A' },
    created_at: new Date().toISOString(),
  },
];

function mockAuth(userRecord, repo) {
  repo.findById.mockResolvedValue(userRecord);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/admin/dashboard', () => {
  const ENDPOINT = '/api/v1/admin/dashboard';

  beforeEach(() => {
    jest.clearAllMocks();
    // auth middleware does a raw pool.query to look up the user by role+id
    // Simulate the pg result shape: [[row], fields]
    pool.query.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM admins'))   return [[ADMIN_ACCOUNT]];
      if (String(sql).includes('FROM teachers')) return [[TEACHER_ACCOUNT]];
      if (String(sql).includes('FROM students')) return [[STUDENT_ACCOUNT]];
      return [[]];
    });
    // Default dashboard data
    adminRepo.getDashboardData.mockResolvedValue({
      counts:       FULL_COUNTS,
      classroomRows: CLASSROOM_ROWS,
      activityRows:  ACTIVITY_ROWS,
    });
  });

  // ── Authorization ──────────────────────────────────────────────────────────

  test('1. Admin receives 200', async () => {
    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('2. Teacher receives 403', async () => {
    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(403);
  });

  test('3. Student receives 403', async () => {
    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${studentToken()}`);
    expect(res.status).toBe(403);
  });

  test('4. Unauthenticated receives 401', async () => {
    const res = await request(app).get(ENDPOINT);
    expect(res.status).toBe(401);
  });

  // ── Correct counts ─────────────────────────────────────────────────────────

  test('5. Student count is correct', async () => {
    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.body.data.overview.students).toBe(30);
    expect(res.body.data.students.total).toBe(30);
    expect(res.body.data.students.active).toBe(28);
    expect(res.body.data.students.inactive).toBe(2);
  });

  test('6. Teacher count is correct', async () => {
    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.body.data.overview.teachers).toBe(5);
    expect(res.body.data.teachers.total).toBe(5);
    expect(res.body.data.teachers.active).toBe(4);
    expect(res.body.data.teachers.inactive).toBe(1);
    expect(res.body.data.teachers.unassigned).toBe(1);
  });

  test('7. Classroom count is correct', async () => {
    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.body.data.overview.classrooms).toBe(3);
    expect(res.body.data.classrooms.total).toBe(3);
    expect(res.body.data.classrooms.active).toBe(3);
    expect(res.body.data.classrooms.inactive).toBe(0);
  });

  test('8. Assignment count is correct', async () => {
    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.body.data.overview.assignments).toBe(20);
  });

  test('9. Submission count is correct', async () => {
    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.body.data.overview.submissions).toBe(60);
  });

  test('10. Evaluation statistics are correct', async () => {
    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken()}`);
    const ev = res.body.data.evaluations;
    expect(ev.pending).toBe(5);
    expect(ev.analyzing).toBe(2);
    expect(ev.completed).toBe(50);
    expect(ev.failed).toBe(3);
  });

  test('11. Activity feed contains real records', async () => {
    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken()}`);
    const feed = res.body.data.activity;
    expect(Array.isArray(feed)).toBe(true);
    expect(feed.length).toBe(2);
    expect(feed[0].action).toBe('teacher_created');
    expect(feed[0].actorName).toBe('Admin');
    expect(feed[1].action).toBe('classroom_created');
  });

  test('12. Alerts are correctly calculated', async () => {
    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken()}`);
    const alerts = res.body.data.alerts;
    expect(Array.isArray(alerts)).toBe(true);
    const types = alerts.map((a) => a.type);
    expect(types).toContain('pending_evaluations');
    expect(types).toContain('failed_evaluations');
    expect(types).toContain('unassigned_teachers');
    expect(types).toContain('expired_registration_codes');
    const pending = alerts.find((a) => a.type === 'pending_evaluations');
    expect(pending.count).toBe(5);
  });

  test('13. No password/hash/token fields returned', async () => {
    // Inject details with sensitive keys to verify they are stripped
    adminRepo.getDashboardData.mockResolvedValue({
      counts:       FULL_COUNTS,
      classroomRows: CLASSROOM_ROWS,
      activityRows: [
        {
          id: 99, actor_type: 'admin', actor_id: 1, actor_name: 'Admin',
          action: 'test', target_type: null, target_id: null,
          details: { name: 'ok', password_hash: 'SHOULD_BE_REMOVED', token: 'REMOVE_ME' },
          created_at: new Date().toISOString(),
        },
      ],
    });

    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('SHOULD_BE_REMOVED');
    expect(body).not.toContain('REMOVE_ME');
    expect(body).not.toContain('password_hash');
  });

  test('14. Empty database returns zeros', async () => {
    const zeroCounts = Object.fromEntries(
      Object.keys(FULL_COUNTS).map((k) => [k, 0])
    );
    adminRepo.getDashboardData.mockResolvedValue({
      counts:       zeroCounts,
      classroomRows: [],
      activityRows:  [],
    });

    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.overview.students).toBe(0);
    expect(res.body.data.overview.teachers).toBe(0);
    expect(res.body.data.classroomList).toEqual([]);
    expect(res.body.data.activity).toEqual([]);
    expect(res.body.data.alerts).toEqual([]);
  });

  test('15. Database query failures return 500', async () => {
    adminRepo.getDashboardData.mockRejectedValue(new Error('DB connection failed'));
    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(500);
  });
});
