import { apiClient } from "@services/apiClient";
import type { ApiResponse } from "@/types/common";
import type {
  AuthUser,
  EmailLoginPayload,
  LoginResponseData,
  StudentLoginPayload,
} from "@/types/auth";

/**
 * Real backend endpoints (server/src/routes/v1/auth.routes.js).
 * Login is role-specific by design — admins/teachers authenticate by
 * email, students by username (no email on file), and there is no
 * unified users table to resolve a generic login against. This is a
 * confirmed, final backend decision — see docs/IAM_MODULE.md.
 */
const ENDPOINTS = {
  ADMIN_LOGIN: "/auth/admin/login",
  TEACHER_LOGIN: "/auth/teacher/login",
  STUDENT_LOGIN: "/auth/student/login",
  REFRESH: "/auth/refresh",
  LOGOUT: "/auth/logout",
  ME: "/auth/me",
} as const;

async function _postLogin(
  url: string,
  payload: EmailLoginPayload | StudentLoginPayload
): Promise<LoginResponseData> {
  const { data } = await apiClient.post<ApiResponse<LoginResponseData>>(url, payload);
  if (!data.success) throw new Error(data.message);
  return data.data;
}

export const authApi = {
  loginAdmin: (payload: EmailLoginPayload) => _postLogin(ENDPOINTS.ADMIN_LOGIN, payload),
  loginTeacher: (payload: EmailLoginPayload) => _postLogin(ENDPOINTS.TEACHER_LOGIN, payload),
  loginStudent: (payload: StudentLoginPayload) => _postLogin(ENDPOINTS.STUDENT_LOGIN, payload),

  async getCurrentUser(): Promise<AuthUser> {
    const { data } = await apiClient.get<ApiResponse<AuthUser>>(ENDPOINTS.ME);
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  async logout(refreshToken?: string | null): Promise<void> {
    // Best-effort — passing the refresh token lets the backend actually
    // revoke that session server-side; local session teardown happens
    // regardless of whether this call succeeds.
    await apiClient
      .post(ENDPOINTS.LOGOUT, refreshToken ? { refreshToken } : {})
      .catch(() => undefined);
  },
};
