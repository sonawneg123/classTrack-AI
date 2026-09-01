/**
 * server/tests/integration/avatarRoutes.integration.test.js
 *
 * Integration tests for the profile photo / avatar endpoints.
 * Tests the full request→response cycle with Express + supertest.
 * DB repositories and filesystem are mocked.
 */

// ── Mock DB layer BEFORE requiring app ─────────────────────────────────────
jest.mock('../../src/database/connection', () => ({
  pool: { query: jest.fn() },
  testConnection: jest.fn(),
}));

jest.mock('../../src/repositories/admin.repository', () => ({
  findByEmail: jest.fn(), findById: jest.fn(), updateById: jest.fn(),
  updateLastLogin: jest.fn(), markEmailVerified: jest.fn(),
  incrementFailedAttempts: jest.fn(), resetFailedAttempts: jest.fn(),
  lockUntil: jest.fn(), isCurrentlyLocked: jest.fn().mockReturnValue(false),
  count: jest.fn(), countBy: jest.fn(), toggleBoolById: jest.fn(),
}));

jest.mock('../../src/repositories/teacher.repository', () => ({
  findByEmail: jest.fn(), findById: jest.fn(), updateById: jest.fn(),
  updateLastLogin: jest.fn(), markEmailVerified: jest.fn(),
  incrementFailedAttempts: jest.fn(), resetFailedAttempts: jest.fn(),
  lockUntil: jest.fn(), isCurrentlyLocked: jest.fn().mockReturnValue(false),
  count: jest.fn(), countBy: jest.fn(),
}));

jest.mock('../../src/repositories/student.repository', () => ({
  findByUsername: jest.fn(), findById: jest.fn(), updateById: jest.fn(),
  updateLastLogin: jest.fn(), create: jest.fn(),
  findByEmail: jest.fn(), findByMobile: jest.fn(),
  existsByUsername: jest.fn(), existsByEmail: jest.fn(), existsByMobile: jest.fn(),
  incrementFailedAttempts: jest.fn(), resetFailedAttempts: jest.fn(),
  lockUntil: jest.fn(), isCurrentlyLocked: jest.fn().mockReturnValue(false),
  count: jest.fn(),
}));

jest.mock('../../src/repositories/audit.repository', () => ({
  insert: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/repositories/loginHistory.repository', () => ({
  record: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/repositories/refreshToken.repository', () => ({
  insert: jest.fn().mockResolvedValue(1),
  findByHash: jest.fn(), findValidByHash: jest.fn(),
  rotate: jest.fn(), revokeById: jest.fn(), revokeAllForUser: jest.fn(),
}));

jest.mock('../../src/repositories/notification.repository', () => ({
  findForRecipient: jest.fn().mockResolvedValue([]),
  countUnread: jest.fn().mockResolvedValue(0),
  markAllRead: jest.fn(), markRead: jest.fn(),
}));

jest.mock('../../src/services/notification.service', () => ({
  getNotifications: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  markRead: jest.fn(), markAllRead: jest.fn(),
}));

// Mock avatar service so upload tests don't depend on disk file paths
jest.mock('../../src/services/avatar.service', () => ({
  getProfile:   jest.fn(),
  uploadAvatar: jest.fn(),
  removeAvatar: jest.fn(),
  buildAvatarUrl: (p) => p ? `/api/v1/account/avatar/${require('path').basename(p)}` : null,
}));

// Mock multer for avatar uploads — memory storage, with MIME filter
jest.mock('../../src/middleware/avatarUpload.middleware', () => {
  const multer = require('multer');
  const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
      if (allowed.has(file.mimetype)) return cb(null, true);
      const { ApiError } = require('../../src/utils/response.util');
      cb(ApiError.badRequest('Unsupported file type. Please upload a JPEG, PNG, or WebP image.'));
    },
  });
  const validateAvatarSignature = jest.fn((req, res, next) => next());
  const AVATAR_UPLOAD_DIR = '/fake/avatars';
  return { avatarUpload, validateAvatarSignature, AVATAR_UPLOAD_DIR };
});

// Mock filesystem
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(false),
  unlink:     jest.fn((p, cb) => cb && cb(null)),
  mkdirSync:  jest.fn(),
}));

const request    = require('supertest');
const app        = require('../../app');
const jwt        = require('../../src/utils/jwt.util');
const { pool }   = require('../../src/database/connection');
const avatarSvc  = require('../../src/services/avatar.service');
const adminRepo  = require('../../src/repositories/admin.repository');
const teacherRepo= require('../../src/repositories/teacher.repository');
const studentRepo= require('../../src/repositories/student.repository');
const fs         = require('fs');

// ── Helper ────────────────────────────────────────────────────────────────────
function makeToken(payload) {
  return jwt.signToken(payload);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const adminAccount = {
  id: 1, name: 'Admin User', email: 'admin@test.com',
  is_active: true, created_at: '2024-01-01', last_login_at: null,
  avatar_path: null, failed_login_attempts: 0, locked_until: null,
};
const teacherAccount = {
  id: 2, name: 'Teacher User', email: 'teacher@test.com',
  is_active: true, created_at: '2024-01-01', last_login_at: null,
  avatar_path: null, failed_login_attempts: 0, locked_until: null,
};
const studentAccount = {
  id: 3, name: 'Student User', username: 'student1',
  email: 'student@test.com', classroom_id: 10,
  is_active: true, created_at: '2024-01-01', last_login_at: null,
  avatar_path: null, failed_login_attempts: 0, locked_until: null,
};

// authenticate middleware calls pool.query directly — must return [[row], []]
function mockPoolForUser(account) {
  pool.query.mockResolvedValue([[account], []]);
}

// Minimal file buffers
const JPEG_BUF = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_BUF  = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_BUF = Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'binary');

// ── Shared profile shapes ──────────────────────────────────────────────────────
function adminProfile(overrides = {}) {
  return { id: 1, name: 'Admin User', role: 'admin', email: 'admin@test.com', avatarUrl: null, isActive: true, createdAt: '2024-01-01', lastLoginAt: null, ...overrides };
}
function teacherProfile(overrides = {}) {
  return { id: 2, name: 'Teacher User', role: 'teacher', email: 'teacher@test.com', avatarUrl: null, isActive: true, createdAt: '2024-01-01', lastLoginAt: null, ...overrides };
}
function studentProfile(overrides = {}) {
  return { id: 3, name: 'Student User', role: 'student', username: 'student1', classroomId: 10, avatarUrl: null, isActive: true, createdAt: '2024-01-01', lastLoginAt: null, ...overrides };
}

describe('Avatar Routes — /api/v1/account', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
  });

  // ── GET /account/profile ──────────────────────────────────────────────────
  describe('GET /api/v1/account/profile', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app).get('/api/v1/account/profile');
      expect(res.status).toBe(401);
    });

    it('returns admin profile with null avatarUrl when no photo', async () => {
      const token = makeToken({ id: 1, role: 'admin', name: 'Admin User' });
      mockPoolForUser(adminAccount);
      avatarSvc.getProfile.mockResolvedValue(adminProfile());

      const res = await request(app)
        .get('/api/v1/account/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.avatarUrl).toBeNull();
      expect(res.body.data.name).toBe('Admin User');
      expect(res.body.data.role).toBe('admin');
    });

    it('returns teacher profile with avatarUrl when photo is set', async () => {
      const token = makeToken({ id: 2, role: 'teacher', name: 'Teacher User' });
      mockPoolForUser(teacherAccount);
      avatarSvc.getProfile.mockResolvedValue(
        teacherProfile({ avatarUrl: '/api/v1/account/avatar/xyz.jpg' })
      );

      const res = await request(app)
        .get('/api/v1/account/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.avatarUrl).toBe('/api/v1/account/avatar/xyz.jpg');
    });

    it('returns student profile with username and classroomId', async () => {
      const token = makeToken({ id: 3, role: 'student', name: 'Student User' });
      mockPoolForUser(studentAccount);
      avatarSvc.getProfile.mockResolvedValue(studentProfile());

      const res = await request(app)
        .get('/api/v1/account/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.username).toBe('student1');
      expect(res.body.data.classroomId).toBe(10);
    });
  });

  // ── PUT /account/profile/photo ────────────────────────────────────────────
  describe('PUT /api/v1/account/profile/photo', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app)
        .put('/api/v1/account/profile/photo')
        .attach('photo', JPEG_BUF, { filename: 'photo.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(401);
    });

    it('returns 400 when no file is provided', async () => {
      const token = makeToken({ id: 1, role: 'admin', name: 'Admin' });
      mockPoolForUser(adminAccount);
      // No file attached — controller should return 400
      avatarSvc.uploadAvatar.mockResolvedValue(adminProfile());

      const res = await request(app)
        .put('/api/v1/account/profile/photo')
        .set('Authorization', `Bearer ${token}`)
        .field('dummy', 'value'); // multipart without a file

      expect(res.status).toBe(400);
    });

    it('successfully uploads a JPEG for an admin', async () => {
      const token = makeToken({ id: 1, role: 'admin', name: 'Admin' });
      mockPoolForUser(adminAccount);
      avatarSvc.uploadAvatar.mockResolvedValue(
        adminProfile({ avatarUrl: '/api/v1/account/avatar/new.jpg' })
      );

      const res = await request(app)
        .put('/api/v1/account/profile/photo')
        .set('Authorization', `Bearer ${token}`)
        .attach('photo', JPEG_BUF, { filename: 'avatar.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(avatarSvc.uploadAvatar).toHaveBeenCalledWith(1, 'admin', expect.any(Object));
    });

    it('successfully uploads a PNG for a teacher', async () => {
      const token = makeToken({ id: 2, role: 'teacher', name: 'Teacher' });
      mockPoolForUser(teacherAccount);
      avatarSvc.uploadAvatar.mockResolvedValue(
        teacherProfile({ avatarUrl: '/api/v1/account/avatar/t.png' })
      );

      const res = await request(app)
        .put('/api/v1/account/profile/photo')
        .set('Authorization', `Bearer ${token}`)
        .attach('photo', PNG_BUF, { filename: 'avatar.png', contentType: 'image/png' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('successfully uploads a WebP for a student', async () => {
      const token = makeToken({ id: 3, role: 'student', name: 'Student' });
      mockPoolForUser(studentAccount);
      avatarSvc.uploadAvatar.mockResolvedValue(
        studentProfile({ avatarUrl: '/api/v1/account/avatar/s.webp' })
      );

      const res = await request(app)
        .put('/api/v1/account/profile/photo')
        .set('Authorization', `Bearer ${token}`)
        .attach('photo', WEBP_BUF, { filename: 'avatar.webp', contentType: 'image/webp' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects unsupported file type (text/plain)', async () => {
      const token = makeToken({ id: 1, role: 'admin', name: 'Admin' });
      mockPoolForUser(adminAccount);

      const res = await request(app)
        .put('/api/v1/account/profile/photo')
        .set('Authorization', `Bearer ${token}`)
        .attach('photo', Buffer.from('hello'), { filename: 'hack.txt', contentType: 'text/plain' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('userId comes from JWT, not from client-supplied data', async () => {
      const token = makeToken({ id: 1, role: 'admin', name: 'Admin' });
      mockPoolForUser(adminAccount);
      avatarSvc.uploadAvatar.mockResolvedValue(
        adminProfile({ avatarUrl: '/api/v1/account/avatar/mine.jpg' })
      );

      const res = await request(app)
        .put('/api/v1/account/profile/photo')
        .set('Authorization', `Bearer ${token}`)
        .attach('photo', JPEG_BUF, { filename: 'photo.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(200);
      // Service was called with userId=1 from JWT, not any injected value
      expect(avatarSvc.uploadAvatar).toHaveBeenCalledWith(1, 'admin', expect.any(Object));
    });
  });

  // ── DELETE /account/profile/photo ─────────────────────────────────────────
  describe('DELETE /api/v1/account/profile/photo', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app).delete('/api/v1/account/profile/photo');
      expect(res.status).toBe(401);
    });

    it('removes the avatar and returns null avatarUrl (admin)', async () => {
      const token = makeToken({ id: 1, role: 'admin', name: 'Admin' });
      mockPoolForUser(adminAccount);
      avatarSvc.removeAvatar.mockResolvedValue(adminProfile({ avatarUrl: null }));

      const res = await request(app)
        .delete('/api/v1/account/profile/photo')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.avatarUrl).toBeNull();
    });

    it('is idempotent when no photo is set', async () => {
      const token = makeToken({ id: 1, role: 'admin', name: 'Admin' });
      mockPoolForUser(adminAccount);
      avatarSvc.removeAvatar.mockResolvedValue(adminProfile({ avatarUrl: null }));

      const res = await request(app)
        .delete('/api/v1/account/profile/photo')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.avatarUrl).toBeNull();
    });

    it('removes the avatar for teacher', async () => {
      const token = makeToken({ id: 2, role: 'teacher', name: 'Teacher' });
      mockPoolForUser(teacherAccount);
      avatarSvc.removeAvatar.mockResolvedValue(teacherProfile({ avatarUrl: null }));

      const res = await request(app)
        .delete('/api/v1/account/profile/photo')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.avatarUrl).toBeNull();
    });

    it('removes the avatar for student', async () => {
      const token = makeToken({ id: 3, role: 'student', name: 'Student' });
      mockPoolForUser(studentAccount);
      avatarSvc.removeAvatar.mockResolvedValue(studentProfile({ avatarUrl: null }));

      const res = await request(app)
        .delete('/api/v1/account/profile/photo')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.avatarUrl).toBeNull();
    });
  });

  // ── GET /api/v1/account/avatar/:filename (public, no auth) ────────────────
  describe('GET /api/v1/account/avatar/:filename', () => {
    it('returns 404 for a non-existent file', async () => {
      fs.existsSync.mockReturnValue(false);
      const res = await request(app).get('/api/v1/account/avatar/nonexistent.jpg');
      expect(res.status).toBe(404);
    });

    it('rejects path-traversal attempts', async () => {
      const res = await request(app).get('/api/v1/account/avatar/..%2F..%2Fpassword');
      expect([400, 404]).toContain(res.status);
    });

    it('does not require authentication', async () => {
      // Even without any auth header, it should return 404 (not 401)
      fs.existsSync.mockReturnValue(false);
      const res = await request(app).get('/api/v1/account/avatar/some-photo.jpg');
      expect(res.status).toBe(404); // 404 because file doesn't exist, NOT 401
    });
  });

  // ── GET /api/v1/auth/me — avatarUrl in profile ────────────────────────────
  describe('GET /api/v1/auth/me — avatarUrl in profile', () => {
    it('includes avatarUrl (null) in profile when no photo set', async () => {
      const token = makeToken({ id: 1, role: 'admin', name: 'Admin' });
      pool.query.mockResolvedValue([[{ ...adminAccount }], []]);

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.profile).toHaveProperty('avatarUrl');
      expect(res.body.data.profile.avatarUrl).toBeNull();
    });

    it('includes avatarUrl when photo is set', async () => {
      const token = makeToken({ id: 2, role: 'teacher', name: 'Teacher' });
      pool.query.mockResolvedValue([[{
        ...teacherAccount,
        avatar_path: 'uploads/avatars/teacher-photo.jpg',
      }], []]);

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.profile.avatarUrl).toBe('/api/v1/account/avatar/teacher-photo.jpg');
    });
  });
});
