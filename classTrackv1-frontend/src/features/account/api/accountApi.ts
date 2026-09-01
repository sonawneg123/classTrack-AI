/**
 * src/features/account/api/accountApi.ts
 *
 * API calls for profile and avatar management.
 */
import { apiClient } from "@services/apiClient";
import type { ApiResponse } from "@/types/common";

/** The shape returned by GET /account/profile and avatar mutation responses. */
export interface AccountProfile {
  id: number;
  name: string;
  role: string;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  email?: string | null;
  username?: string | null;
  classroomId?: number | null;
}

const ENDPOINTS = {
  PROFILE:       "/account/profile",
  PROFILE_PHOTO: "/account/profile/photo",
} as const;

export const accountApi = {
  /** Fetch the current user's full profile (includes avatarUrl). */
  async getProfile(): Promise<AccountProfile> {
    const { data } = await apiClient.get<ApiResponse<AccountProfile>>(
      ENDPOINTS.PROFILE
    );
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  /**
   * Upload or replace the current user's profile photo.
   * @param file - The image File object selected by the user.
   * @returns Updated profile including new avatarUrl.
   */
  async uploadPhoto(file: File): Promise<AccountProfile> {
    const form = new FormData();
    form.append("photo", file);
    const { data } = await apiClient.put<ApiResponse<AccountProfile>>(
      ENDPOINTS.PROFILE_PHOTO,
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  /**
   * Remove the current user's profile photo.
   * @returns Updated profile with avatarUrl === null.
   */
  async deletePhoto(): Promise<AccountProfile> {
    const { data } = await apiClient.delete<ApiResponse<AccountProfile>>(
      ENDPOINTS.PROFILE_PHOTO
    );
    if (!data.success) throw new Error(data.message);
    return data.data;
  },
};
