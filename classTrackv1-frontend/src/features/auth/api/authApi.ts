import { apiClient } from "@services/apiClient";
import type { ApiResponse } from "@/types/common";
import type {
  AuthUser,
  EmailLoginPayload,
  LoginResponseData,
  StudentLoginPayload,
  StudentRegisterPayload,
  TeacherRegisterPayload,
} from "@/types/auth";

/**
 * Real backend endpoints (server/src/routes/v1/auth.routes.js).
 * Login is role-specific by design — admins/teachers authenticate by
 * email, students by email (P1 registration flow), and there is no
 * unified users table to resolve a generic login against. This is a
 * confirmed, final backend decision — see docs/IAM_MODULE.md.
 */
const ENDPOINTS = {
  ADMIN_LOGIN: "/auth/admin/login",
  TEACHER_LOGIN: "/auth/teacher/login",
  TEACHER_REGISTER: "/auth/teacher/register",
  STUDENT_LOGIN: "/auth/student/login",
  STUDENT_REGISTER: "/auth/student/register",
  REFRESH: "/auth/refresh",
  LOGOUT: "/auth/logout",
  ME: "/auth/me",
  FORGOT_PASSWORD: "/auth/forgot-password",
  RESET_PASSWORD: "/auth/reset-password",
  VALIDATE_RESET_TOKEN: "/auth/validate-reset-token",
  VERIFY_EMAIL: "/auth/verify-email",
  RESEND_VERIFICATION: "/auth/resend-verification",
} as const;

async function _postLogin(
  url: string,
  payload: EmailLoginPayload | StudentLoginPayload | StudentRegisterPayload
): Promise<LoginResponseData> {
  const { data } = await apiClient.post<ApiResponse<LoginResponseData>>(url, payload);
  if (!data.success) throw new Error(data.message);
  return data.data;
}

export const authApi = {
  loginAdmin: (payload: EmailLoginPayload) => _postLogin(ENDPOINTS.ADMIN_LOGIN, payload),
  loginTeacher: (payload: EmailLoginPayload) => _postLogin(ENDPOINTS.TEACHER_LOGIN, payload),
  loginStudent: (payload: StudentLoginPayload) => _postLogin(ENDPOINTS.STUDENT_LOGIN, payload),
  registerStudent: (payload: StudentRegisterPayload) => _postLogin(ENDPOINTS.STUDENT_REGISTER, payload),
  registerTeacher: (payload: TeacherRegisterPayload) => _postLogin(ENDPOINTS.TEACHER_REGISTER, payload),

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

  /** Request a password reset email. Available for admin/teacher only. */
  async forgotPassword(email: string): Promise<string> {
    const { data } = await apiClient.post<ApiResponse<null>>(
      ENDPOINTS.FORGOT_PASSWORD,
      { email }
    );
    if (!data.success) throw new Error(data.message);
    return data.message ?? "If an account with that email exists, a password reset link has been sent.";
  },

  /**
   * Validates a raw reset token and returns the account's safe identity
   * (name + email) so the page can display who is resetting their password.
   * Throws on invalid / expired / used token.
   */
  async validateResetToken(token: string): Promise<{ name: string | null; email: string | null }> {
    const { data } = await apiClient.get<ApiResponse<{ name: string | null; email: string | null }>>(
      ENDPOINTS.VALIDATE_RESET_TOKEN,
      { params: { token } }
    );
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  /** Complete a password reset using the token from the reset email. */
  async resetPassword(token: string, newPassword: string): Promise<string> {
    const { data } = await apiClient.post<ApiResponse<null>>(
      ENDPOINTS.RESET_PASSWORD,
      { token, newPassword }
    );
    if (!data.success) throw new Error(data.message);
    return data.message ?? "Password reset successfully.";
  },

  /** Verify an email address using the token from the verification email. */
  async verifyEmail(token: string): Promise<string> {
    const { data } = await apiClient.post<ApiResponse<null>>(
      ENDPOINTS.VERIFY_EMAIL,
      { token }
    );
    if (!data.success) throw new Error(data.message);
    return data.message ?? "Email verified successfully.";
  },

  /**
   * Resend the email verification link.
   * Available for admin/teacher accounts only.
   * Students do not have an email verification flow.
   */
  async resendVerification(email: string, role: "admin" | "teacher"): Promise<string> {
    const { data } = await apiClient.post<ApiResponse<null>>(
      ENDPOINTS.RESEND_VERIFICATION,
      { email, role }
    );
    if (!data.success) throw new Error(data.message);
    return data.message ?? "If an account with that email exists and is unverified, a new verification link has been sent.";
  },
};
