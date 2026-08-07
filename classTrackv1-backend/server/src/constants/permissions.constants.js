/**
 * server/src/constants/permissions.constants.js
 *
 * Canonical permission codes and the role → permissions mapping used by
 * authorizePermissions() middleware. This is the fast, in-memory copy of
 * what's seeded into the `permissions` / `role_permissions` tables in
 * migration 002 — kept in code so every request-time authorization check
 * is a plain object lookup, not a database round-trip.
 *
 * If you add a new permission, add it in BOTH places:
 *   1. Here (PERMISSIONS + ROLE_PERMISSIONS)
 *   2. database/migrations/002_auth_enterprise.sql (for auditability)
 */

const PERMISSIONS = {
  PLATFORM_MANAGE:       'platform:manage',
  TEACHER_CREATE:        'teacher:create',
  TEACHER_MANAGE:        'teacher:manage',
  CLASSROOM_CREATE:      'classroom:create',
  CLASSROOM_MANAGE_ANY:  'classroom:manage_any',
  CLASSROOM_MANAGE_OWN:  'classroom:manage_own',
  TASK_CREATE:           'task:create',
  TASK_MANAGE_OWN:       'task:manage_own',
  SUBMISSION_GRADE:      'submission:grade',
  SUBMISSION_VIEW_OWN:   'submission:view_own',
  SUBMISSION_SUBMIT:     'submission:submit',
  STUDENT_MANAGE:        'student:manage',
  REPORT_VIEW_ANY:       'report:view_any',
  REPORT_VIEW_OWN:       'report:view_own',
  AUDIT_VIEW:            'audit:view',
};

const ROLE_PERMISSIONS = {
  admin: [
    PERMISSIONS.PLATFORM_MANAGE,
    PERMISSIONS.TEACHER_CREATE,
    PERMISSIONS.TEACHER_MANAGE,
    PERMISSIONS.CLASSROOM_CREATE,
    PERMISSIONS.CLASSROOM_MANAGE_ANY,
    PERMISSIONS.REPORT_VIEW_ANY,
    PERMISSIONS.AUDIT_VIEW,
  ],
  teacher: [
    PERMISSIONS.CLASSROOM_MANAGE_OWN,
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_MANAGE_OWN,
    PERMISSIONS.SUBMISSION_GRADE,
    PERMISSIONS.STUDENT_MANAGE,
    PERMISSIONS.REPORT_VIEW_OWN,
  ],
  student: [
    PERMISSIONS.SUBMISSION_SUBMIT,
    PERMISSIONS.SUBMISSION_VIEW_OWN,
    PERMISSIONS.REPORT_VIEW_OWN,
  ],
};

/** Returns the flat permission list for a role (empty array if role unknown). */
function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, permissionsForRole };
