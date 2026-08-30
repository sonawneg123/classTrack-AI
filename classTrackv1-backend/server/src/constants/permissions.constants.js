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
  // Sprint 2 — Knowledge Base
  KNOWLEDGE_MANAGE_OWN:  'knowledge:manage_own',
  KNOWLEDGE_SEARCH:      'knowledge:search',
  // Sprint 3 — Question Bank
  QUESTION_GENERATE:     'question:generate',
  QUESTION_VIEW_OWN:     'question:view_own',
  QUESTION_VIEW_APPROVED:'question:view_approved',
  QUESTION_APPROVE:      'question:approve',
  QUESTION_PUBLISH:      'question:publish',
  QUESTION_ARCHIVE:      'question:archive',
  QUESTION_ATTEMPT:          'question:attempt',
  // Sprint 5 — Quiz Results
  QUESTION_VIEW_RESULTS:     'question:view_results',
  // Sprint 6 — Student AI Practice
  QUESTION_PRACTICE_GENERATE: 'question:practice_generate',
  // Sprint 7 — Quiz Assignments
  QUIZ_CREATE:                 'quiz:create',
  QUIZ_MANAGE_OWN:             'quiz:manage_own',
  QUIZ_ATTEMPT:                'quiz:attempt',
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
    // Sprint 2 — Knowledge Base
    PERMISSIONS.KNOWLEDGE_MANAGE_OWN,
    PERMISSIONS.KNOWLEDGE_SEARCH,
    // Sprint 3 — Question Bank
    PERMISSIONS.QUESTION_GENERATE,
    PERMISSIONS.QUESTION_VIEW_OWN,
    PERMISSIONS.QUESTION_APPROVE,
    PERMISSIONS.QUESTION_PUBLISH,
    PERMISSIONS.QUESTION_ARCHIVE,
    // Sprint 5 — Quiz Results
    PERMISSIONS.QUESTION_VIEW_RESULTS,
    // Sprint 7 — Quiz Assignments
    PERMISSIONS.QUIZ_CREATE,
    PERMISSIONS.QUIZ_MANAGE_OWN,
  ],
  student: [
    PERMISSIONS.SUBMISSION_SUBMIT,
    PERMISSIONS.SUBMISSION_VIEW_OWN,
    PERMISSIONS.REPORT_VIEW_OWN,
    // Sprint 3 — Question Bank
    PERMISSIONS.QUESTION_GENERATE,
    PERMISSIONS.QUESTION_VIEW_OWN,      // view own generated questions (all statuses)
    PERMISSIONS.QUESTION_VIEW_APPROVED, // view published questions from teacher
    // Sprint 4 — Quiz attempts
    PERMISSIONS.QUESTION_ATTEMPT,       // submit an answer attempt on a published question
    // Sprint 6 — Student AI Practice (separate from teacher question:generate)
    PERMISSIONS.QUESTION_PRACTICE_GENERATE,
    // Sprint 7 — Quiz Assignments
    PERMISSIONS.QUIZ_ATTEMPT,
  ],
};

/** Returns the flat permission list for a role (empty array if role unknown). */
function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, permissionsForRole };
