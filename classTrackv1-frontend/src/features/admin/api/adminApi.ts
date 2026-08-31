import { apiClient } from "@services/apiClient";
import type { ApiResponse } from "@/types/common";
import type { AdminDashboardApiData } from "@/types/dashboard";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminTeacher {
  id: number;
  name: string;
  email: string;
  mobile_number: string | null;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  created_by: number | null;
  classroom_count: number;
  classrooms: Array<{ id: number; name: string }> | null;
}

export interface AdminTeacherDetail extends AdminTeacher {
  email_verified_at: string | null;
}

export interface TeacherRegistrationCode {
  id: number;
  createdBy: number;
  createdByName: string;
  expiresAt: string;
  usedAt: string | null;
  usedBy: number | null;
  isRevoked: boolean;
  createdAt: string;
  status: "active" | "expired" | "used" | "revoked";
}

export interface NewRegistrationCode {
  id: number;
  code: string; // raw display code — shown once only
  expiresAt: string;
  status: "active";
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

const BASE = "/admin";

export const adminApi = {
  // ── Dashboard ─────────────────────────────────────────────────────────────

  async getDashboard(): Promise<AdminDashboardApiData> {
    const { data } = await apiClient.get<ApiResponse<AdminDashboardApiData>>(
      `${BASE}/dashboard`
    );
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  // ── Teachers ──────────────────────────────────────────────────────────────

  async listTeachers(params?: {
    limit?: number;
    offset?: number;
  }): Promise<{ rows: AdminTeacher[]; total: number }> {
    const { data } = await apiClient.get<
      ApiResponse<{ rows: AdminTeacher[]; total: number }>
    >(`${BASE}/teachers`, { params });
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  async getTeacher(id: number): Promise<AdminTeacherDetail> {
    const { data } = await apiClient.get<ApiResponse<AdminTeacherDetail>>(
      `${BASE}/teachers/${id}`
    );
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  async updateTeacher(
    id: number,
    payload: { name?: string; email?: string; mobile?: string }
  ): Promise<void> {
    const { data } = await apiClient.patch<ApiResponse<null>>(
      `${BASE}/teachers/${id}`,
      payload
    );
    if (!data.success) throw new Error(data.message);
  },

  async setTeacherStatus(id: number, isActive: boolean): Promise<void> {
    const { data } = await apiClient.patch<ApiResponse<null>>(
      `${BASE}/teachers/${id}/status`,
      { isActive }
    );
    if (!data.success) throw new Error(data.message);
  },

  async assignTeacherClassroom(id: number, classroomId: number): Promise<void> {
    const { data } = await apiClient.patch<ApiResponse<null>>(
      `${BASE}/teachers/${id}/classroom`,
      { classroomId }
    );
    if (!data.success) throw new Error(data.message);
  },

  async removeTeacherFromClassroom(
    teacherId: number,
    classroomId: number
  ): Promise<void> {
    const { data } = await apiClient.delete<ApiResponse<null>>(
      `${BASE}/teachers/${teacherId}/classroom/${classroomId}`
    );
    if (!data.success) throw new Error(data.message);
  },

  async resetTeacherPassword(id: number): Promise<{ tempPassword: string }> {
    const { data } = await apiClient.post<
      ApiResponse<{ tempPassword: string }>
    >(`${BASE}/teachers/${id}/reset-password`);
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  // ── Teacher Registration Codes ─────────────────────────────────────────────

  async createRegistrationCode(
    expiresInHours?: number
  ): Promise<NewRegistrationCode> {
    const { data } = await apiClient.post<ApiResponse<NewRegistrationCode>>(
      `${BASE}/teacher-registration-codes`,
      expiresInHours !== undefined ? { expiresInHours } : {}
    );
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  async listRegistrationCodes(params?: {
    limit?: number;
    offset?: number;
  }): Promise<{ codes: TeacherRegistrationCode[]; total: number }> {
    const { data } = await apiClient.get<
      ApiResponse<{ codes: TeacherRegistrationCode[]; total: number }>
    >(`${BASE}/teacher-registration-codes`, { params });
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  async revokeRegistrationCode(id: number): Promise<void> {
    const { data } = await apiClient.post<ApiResponse<null>>(
      `${BASE}/teacher-registration-codes/${id}/revoke`
    );
    if (!data.success) throw new Error(data.message);
  },

  // ── Classrooms ─────────────────────────────────────────────────────────────

  async listClassrooms(params?: {
    limit?: number;
    offset?: number;
  }): Promise<{ rows: unknown[]; total: number }> {
    const { data } = await apiClient.get<
      ApiResponse<{ rows: unknown[]; total: number }>
    >(`${BASE}/classrooms`, { params });
    if (!data.success) throw new Error(data.message);
    return data.data;
  },
};
