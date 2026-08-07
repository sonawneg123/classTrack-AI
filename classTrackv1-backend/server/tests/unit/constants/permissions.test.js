/**
 * server/tests/unit/constants/permissions.test.js
 */
const { PERMISSIONS, ROLE_PERMISSIONS, permissionsForRole } = require('../../../src/constants/permissions.constants');

describe('permissions.constants', () => {
  it('every permission code follows the "resource:action" naming convention', () => {
    Object.values(PERMISSIONS).forEach((code) => {
      expect(code).toMatch(/^[a-z]+:[a-z_]+$/);
    });
  });

  it('admin has platform-level permissions teachers/students do not', () => {
    expect(permissionsForRole('admin')).toContain(PERMISSIONS.PLATFORM_MANAGE);
    expect(permissionsForRole('teacher')).not.toContain(PERMISSIONS.PLATFORM_MANAGE);
    expect(permissionsForRole('student')).not.toContain(PERMISSIONS.PLATFORM_MANAGE);
  });

  it('teacher has classroom/task/submission-grading permissions', () => {
    const perms = permissionsForRole('teacher');
    expect(perms).toContain(PERMISSIONS.TASK_CREATE);
    expect(perms).toContain(PERMISSIONS.SUBMISSION_GRADE);
    expect(perms).not.toContain(PERMISSIONS.SUBMISSION_SUBMIT); // that's a student action
  });

  it('student can submit and view their own work, nothing administrative', () => {
    const perms = permissionsForRole('student');
    expect(perms).toContain(PERMISSIONS.SUBMISSION_SUBMIT);
    expect(perms).toContain(PERMISSIONS.SUBMISSION_VIEW_OWN);
    expect(perms).not.toContain(PERMISSIONS.SUBMISSION_GRADE);
    expect(perms).not.toContain(PERMISSIONS.CLASSROOM_CREATE);
  });

  it('returns an empty array for an unknown role rather than throwing', () => {
    expect(permissionsForRole('superuser')).toEqual([]);
    expect(permissionsForRole(undefined)).toEqual([]);
  });

  it('every permission granted to any role exists in the PERMISSIONS catalogue', () => {
    const allValidCodes = new Set(Object.values(PERMISSIONS));
    Object.values(ROLE_PERMISSIONS).flat().forEach((code) => {
      expect(allValidCodes.has(code)).toBe(true);
    });
  });
});
