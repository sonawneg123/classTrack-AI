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

  // Sprint 6 — Student AI Practice permissions
  it('student has question:practice_generate permission', () => {
    const perms = permissionsForRole('student');
    expect(perms).toContain(PERMISSIONS.QUESTION_PRACTICE_GENERATE);
  });

  it('teacher does NOT have question:practice_generate (practice is student-only)', () => {
    const perms = permissionsForRole('teacher');
    expect(perms).not.toContain(PERMISSIONS.QUESTION_PRACTICE_GENERATE);
  });

  it('student does NOT have question:approve or question:publish (teacher-only)', () => {
    const perms = permissionsForRole('student');
    expect(perms).not.toContain(PERMISSIONS.QUESTION_APPROVE);
    expect(perms).not.toContain(PERMISSIONS.QUESTION_PUBLISH);
  });

  // Sprint 7 — Quiz Assignment permissions
  it('teacher has quiz:create and quiz:manage_own permissions', () => {
    const perms = permissionsForRole('teacher');
    expect(perms).toContain(PERMISSIONS.QUIZ_CREATE);
    expect(perms).toContain(PERMISSIONS.QUIZ_MANAGE_OWN);
    expect(perms).not.toContain(PERMISSIONS.QUIZ_ATTEMPT);
  });

  it('student has quiz:attempt permission', () => {
    const perms = permissionsForRole('student');
    expect(perms).toContain(PERMISSIONS.QUIZ_ATTEMPT);
    expect(perms).not.toContain(PERMISSIONS.QUIZ_CREATE);
    expect(perms).not.toContain(PERMISSIONS.QUIZ_MANAGE_OWN);
  });

  it('QUIZ_CREATE, QUIZ_MANAGE_OWN, QUIZ_ATTEMPT are defined in PERMISSIONS catalogue', () => {
    expect(PERMISSIONS.QUIZ_CREATE).toBe('quiz:create');
    expect(PERMISSIONS.QUIZ_MANAGE_OWN).toBe('quiz:manage_own');
    expect(PERMISSIONS.QUIZ_ATTEMPT).toBe('quiz:attempt');
  });
});
