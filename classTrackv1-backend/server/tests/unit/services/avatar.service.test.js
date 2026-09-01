/**
 * tests/unit/services/avatar.service.test.js
 *
 * Unit tests for avatar.service.js
 *
 * All repositories and filesystem calls are mocked.
 */

jest.mock('../../../src/repositories/admin.repository');
jest.mock('../../../src/repositories/teacher.repository');
jest.mock('../../../src/repositories/student.repository');
jest.mock('fs');

const path          = require('path');
const fs            = require('fs');
const avatarService = require('../../../src/services/avatar.service');
const adminRepo     = require('../../../src/repositories/admin.repository');
const teacherRepo   = require('../../../src/repositories/teacher.repository');
const studentRepo   = require('../../../src/repositories/student.repository');

// ── Shared mocks ──────────────────────────────────────────────────────────────

const mockAdmin = {
  id: 1, name: 'Admin User', email: 'admin@test.com',
  is_active: true, created_at: '2024-01-01', last_login_at: null,
  avatar_path: null,
};

const mockTeacher = {
  id: 2, name: 'Teacher User', email: 'teacher@test.com',
  is_active: true, created_at: '2024-01-01', last_login_at: null,
  avatar_path: null,
};

const mockStudent = {
  id: 3, name: 'Student User', username: 'student1',
  email: 'student@test.com', is_active: true,
  created_at: '2024-01-01', last_login_at: null,
  classroom_id: 10, avatar_path: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default: account exists, no existing avatar
  adminRepo.findById   = jest.fn().mockResolvedValue({ ...mockAdmin });
  teacherRepo.findById = jest.fn().mockResolvedValue({ ...mockTeacher });
  studentRepo.findById = jest.fn().mockResolvedValue({ ...mockStudent });
  adminRepo.updateById   = jest.fn().mockResolvedValue(1);
  teacherRepo.updateById = jest.fn().mockResolvedValue(1);
  studentRepo.updateById = jest.fn().mockResolvedValue(1);
  // fs mocks
  fs.existsSync = jest.fn().mockReturnValue(false);
  fs.unlink     = jest.fn((p, cb) => cb && cb(null));
  fs.openSync   = jest.fn().mockReturnValue(3);
  fs.readSync   = jest.fn();
  fs.closeSync  = jest.fn();
});

// ── buildAvatarUrl ────────────────────────────────────────────────────────────
describe('buildAvatarUrl', () => {
  it('returns null for null path', () => {
    expect(avatarService.buildAvatarUrl(null)).toBeNull();
  });

  it('returns a URL path for a relative path', () => {
    const url = avatarService.buildAvatarUrl('uploads/avatars/abc123.jpg');
    expect(url).toBe('/api/v1/account/avatar/abc123.jpg');
  });
});

// ── getProfile ────────────────────────────────────────────────────────────────
describe('getProfile', () => {
  it('returns admin profile without avatarUrl when no photo set', async () => {
    const profile = await avatarService.getProfile(1, 'admin');
    expect(profile.id).toBe(1);
    expect(profile.name).toBe('Admin User');
    expect(profile.role).toBe('admin');
    expect(profile.avatarUrl).toBeNull();
    expect(profile.email).toBe('admin@test.com');
  });

  it('returns teacher profile with avatarUrl when photo is set', async () => {
    teacherRepo.findById.mockResolvedValueOnce({
      ...mockTeacher,
      avatar_path: 'uploads/avatars/xyz.jpg',
    });
    const profile = await avatarService.getProfile(2, 'teacher');
    expect(profile.avatarUrl).toBe('/api/v1/account/avatar/xyz.jpg');
  });

  it('returns student profile with username and classroomId', async () => {
    const profile = await avatarService.getProfile(3, 'student');
    expect(profile.username).toBe('student1');
    expect(profile.classroomId).toBe(10);
  });

  it('throws 404 if account not found', async () => {
    adminRepo.findById.mockResolvedValueOnce(null);
    await expect(avatarService.getProfile(99, 'admin'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 for unknown role', async () => {
    await expect(avatarService.getProfile(1, 'superuser'))
      .rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── uploadAvatar ──────────────────────────────────────────────────────────────
describe('uploadAvatar', () => {
  const fakeFile = {
    path: path.resolve(process.cwd(), 'uploads/avatars/new-abc.jpg'),
    mimetype: 'image/jpeg',
    originalname: 'photo.jpg',
  };

  it('saves the new avatar path in the DB (admin)', async () => {
    adminRepo.findById
      .mockResolvedValueOnce({ ...mockAdmin })   // first call (get account)
      .mockResolvedValueOnce({ ...mockAdmin, avatar_path: 'uploads/avatars/new-abc.jpg' }); // second call (get updated)

    const profile = await avatarService.uploadAvatar(1, 'admin', fakeFile);

    expect(adminRepo.updateById).toHaveBeenCalledWith(1, expect.objectContaining({
      avatar_path: expect.stringContaining('uploads/avatars'),
    }));
    expect(profile.avatarUrl).toContain('/api/v1/account/avatar/');
  });

  it('saves the new avatar path in the DB (teacher)', async () => {
    const teacherFile = { ...fakeFile, path: path.resolve(process.cwd(), 'uploads/avatars/teacher-file.jpg') };
    teacherRepo.findById
      .mockResolvedValueOnce({ ...mockTeacher })
      .mockResolvedValueOnce({ ...mockTeacher, avatar_path: 'uploads/avatars/teacher-file.jpg' });

    const profile = await avatarService.uploadAvatar(2, 'teacher', teacherFile);
    expect(teacherRepo.updateById).toHaveBeenCalled();
    expect(profile.avatarUrl).toContain('/api/v1/account/avatar/teacher-file.jpg');
  });

  it('saves the new avatar path in the DB (student)', async () => {
    const studentFile = { ...fakeFile, path: path.resolve(process.cwd(), 'uploads/avatars/student-file.jpg') };
    studentRepo.findById
      .mockResolvedValueOnce({ ...mockStudent })
      .mockResolvedValueOnce({ ...mockStudent, avatar_path: 'uploads/avatars/student-file.jpg' });

    const profile = await avatarService.uploadAvatar(3, 'student', studentFile);
    expect(studentRepo.updateById).toHaveBeenCalled();
    expect(profile.avatarUrl).toContain('/api/v1/account/avatar/');
  });

  it('deletes old avatar file when replacing', async () => {
    fs.existsSync.mockReturnValue(true);
    adminRepo.findById
      .mockResolvedValueOnce({ ...mockAdmin, avatar_path: 'uploads/avatars/old.jpg' })
      .mockResolvedValueOnce({ ...mockAdmin, avatar_path: 'uploads/avatars/new-abc.jpg' });

    await avatarService.uploadAvatar(1, 'admin', fakeFile);
    // unlink should have been called for old file
    expect(fs.unlink).toHaveBeenCalled();
  });

  it('throws 404 if account not found', async () => {
    adminRepo.findById.mockResolvedValueOnce(null);
    await expect(avatarService.uploadAvatar(99, 'admin', fakeFile))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── removeAvatar ──────────────────────────────────────────────────────────────
describe('removeAvatar', () => {
  it('clears avatar_path in DB and returns null avatarUrl', async () => {
    adminRepo.findById
      .mockResolvedValueOnce({ ...mockAdmin, avatar_path: 'uploads/avatars/existing.jpg' })
      .mockResolvedValueOnce({ ...mockAdmin, avatar_path: null });

    fs.existsSync.mockReturnValue(true);
    const profile = await avatarService.removeAvatar(1, 'admin');

    expect(adminRepo.updateById).toHaveBeenCalledWith(1, expect.objectContaining({ avatar_path: null }));
    expect(profile.avatarUrl).toBeNull();
    expect(fs.unlink).toHaveBeenCalled();
  });

  it('is idempotent when no avatar is set', async () => {
    adminRepo.findById.mockResolvedValueOnce({ ...mockAdmin, avatar_path: null });

    const profile = await avatarService.removeAvatar(1, 'admin');
    expect(adminRepo.updateById).not.toHaveBeenCalled();
    expect(profile.avatarUrl).toBeNull();
  });

  it('throws 404 if account not found', async () => {
    adminRepo.findById.mockResolvedValueOnce(null);
    await expect(avatarService.removeAvatar(99, 'admin'))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
