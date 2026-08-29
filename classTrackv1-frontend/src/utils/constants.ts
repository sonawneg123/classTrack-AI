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
  UNAUTHORIZED: "/unauthorized",
  FORBIDDEN: "/forbidden",
  NOT_FOUND: "*",
  ADMIN: {
    ROOT: "/admin",
    DASHBOARD: "/admin/dashboard",
  },
  TEACHER: {
    ROOT: "/teacher",
    DASHBOARD: "/teacher/dashboard",
    CLASSROOMS: "/teacher/classrooms",
    TASKS: "/teacher/tasks",
    EVALUATIONS: "/teacher/evaluations",
    KNOWLEDGE_BASE: "/teacher/knowledge",
    QUESTION_BANK: "/teacher/question-bank",
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
  },
} as const;

export const TOKEN_STORAGE_KEY = "classtrack_access_token";
export const REFRESH_STORAGE_KEY = "classtrack_refresh_token";

// Dispatched on `window` when a refresh attempt fails so AuthProvider can
// clear session state even though the axios interceptor lives outside React.
export const AUTH_SESSION_EXPIRED_EVENT = "classtrack:auth:session-expired";
