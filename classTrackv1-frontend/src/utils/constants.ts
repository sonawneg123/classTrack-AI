export const APP_NAME = import.meta.env.VITE_APP_NAME ?? "ClassTrack AI";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000/api/v1";

export const ROLES = {
  ADMIN: "admin",
  TEACHER: "teacher",
  STUDENT: "student",
} as const;

export const ROUTES = {
  ROOT: "/",
  LOGIN: "/login",
  ACCOUNT: {
    PROFILE: "/account/profile",
  },
  STUDENT_REGISTER: "/register/student",
  TEACHER_REGISTER: "/register/teacher",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
  VERIFY_EMAIL: "/verify-email",
  UNAUTHORIZED: "/unauthorized",
  FORBIDDEN: "/forbidden",
  NOT_FOUND: "*",
  ADMIN: {
    ROOT: "/admin",
    DASHBOARD: "/admin/dashboard",
    TEACHERS: "/admin/teachers",
    TEACHER_DETAIL: (id: number | string) => `/admin/teachers/${id}`,
    REGISTRATION_CODES: "/admin/teacher-registration-codes",
  },
  TEACHER: {
    ROOT: "/teacher",
    DASHBOARD: "/teacher/dashboard",
    CLASSROOMS: "/teacher/classrooms",
    TASKS: "/teacher/tasks",
    EVALUATIONS: "/teacher/evaluations",
    KNOWLEDGE_BASE: "/teacher/knowledge",
    QUESTION_BANK: "/teacher/question-bank",
    QUIZ_RESULTS: "/teacher/quiz-results",
    QUIZ_ASSIGNMENTS: "/teacher/quiz-assignments",
    QUIZ_ASSIGNMENT_DETAIL: (id: number | string) =>
      `/teacher/quiz-assignments/${id}`,
    GRADING_OVERVIEW: (classroomId: number | string) =>
      `/teacher/classrooms/${classroomId}/grading`,
    TASK_SUBMISSIONS: (taskId: number | string) =>
      `/teacher/tasks/${taskId}/submissions`,
    SUBMISSION_DETAIL: (submissionId: number | string) =>
      `/teacher/submissions/${submissionId}`,
  },
  STUDENT: {
    ROOT: "/student",
    DASHBOARD: "/student/dashboard",
    ASSIGNMENTS: "/student/assignments",
    ASSIGNMENT_DETAIL: (taskId: number | string) => `/student/assignments/${taskId}`,
    QUESTION_BANK: "/student/question-bank",
    QUIZ_RESULTS: "/student/quiz-results",
    PRACTICE: "/student/practice",
    QUIZ_ASSIGNMENTS: "/student/quiz-assignments",
    TAKE_QUIZ: (id: number | string) => `/student/quiz-assignments/${id}`,
  },
} as const;

export const TOKEN_STORAGE_KEY = "classtrack_access_token";
export const REFRESH_STORAGE_KEY = "classtrack_refresh_token";

// Dispatched on `window` when a refresh attempt fails so AuthProvider can
// clear session state even though the axios interceptor lives outside React.
export const AUTH_SESSION_EXPIRED_EVENT = "classtrack:auth:session-expired";
