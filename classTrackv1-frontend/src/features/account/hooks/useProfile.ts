/**
 * src/features/account/hooks/useProfile.ts
 *
 * React Query hooks for profile and avatar management.
 *
 * After a successful upload or delete the hook:
 *   1. Updates the profile cache immediately with the returned data.
 *   2. Calls refreshUser() from AuthProvider so AuthContext.user.profile.avatarUrl
 *      updates in real-time — this makes the Topbar / ProfileMenu avatar update
 *      instantly without requiring a page refresh.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { useAuth } from "@app/AuthProvider";
import { accountApi, type AccountProfile } from "../api/accountApi";

/** React Query key for the current user's profile. */
export const PROFILE_QUERY_KEY = ["account", "profile"] as const;

// ── Query ────────────────────────────────────────────────────────────────────

/**
 * Fetches the current user's profile (including avatarUrl).
 */
export function useProfile() {
  return useQuery<AccountProfile>({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: accountApi.getProfile,
    staleTime: 60_000, // 1 minute
  });
}

// ── Validation ────────────────────────────────────────────────────────────────

const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Validates a file client-side before sending it to the backend.
 * Returns an error message string or null if valid.
 */
export function validateAvatarFile(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) {
    return "Please select a JPEG, PNG, or WebP image.";
  }
  if (file.size > MAX_SIZE_BYTES) {
    return "Image must be smaller than 5 MB.";
  }
  return null;
}

// ── Mutation: upload photo ────────────────────────────────────────────────────

/**
 * Mutation to upload or replace the profile photo.
 *
 * On success:
 *  - Updates the profile cache with the returned data.
 *  - Calls refreshUser() so the Topbar avatar updates immediately.
 */
export function useUploadAvatar() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { refreshUser } = useAuth();

  return useMutation({
    mutationFn: (file: File) => accountApi.uploadPhoto(file),
    onSuccess: (profile) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY, profile);
      // Refresh AuthContext so avatarUrl propagates to Topbar / ProfileMenu
      refreshUser().catch(() => undefined);
      enqueueSnackbar("Profile photo updated.", { variant: "success" });
    },
    onError: (error: Error) => {
      enqueueSnackbar(
        error.message ?? "Failed to upload photo. Please try again.",
        { variant: "error" }
      );
    },
  });
}

// ── Mutation: delete photo ────────────────────────────────────────────────────

/**
 * Mutation to remove the profile photo.
 *
 * On success:
 *  - Updates the profile cache immediately.
 *  - Calls refreshUser() so all avatar components fall back to initials.
 */
export function useDeleteAvatar() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { refreshUser } = useAuth();

  return useMutation({
    mutationFn: () => accountApi.deletePhoto(),
    onSuccess: (profile) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY, profile);
      refreshUser().catch(() => undefined);
      enqueueSnackbar("Profile photo removed.", { variant: "success" });
    },
    onError: (error: Error) => {
      enqueueSnackbar(
        error.message ?? "Failed to remove photo. Please try again.",
        { variant: "error" }
      );
    },
  });
}
