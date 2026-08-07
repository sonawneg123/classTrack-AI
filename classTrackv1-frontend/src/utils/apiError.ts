import { isAxiosError } from "axios";
import type { ApiResponse } from "@/types/common";

/**
 * Normalizes errors from axios/API calls into a single display-ready
 * string, so every form and toast in the app shows errors consistently
 * regardless of whether the backend returned a validation payload, a
 * plain message, or the request never reached the server.
 */
export function getErrorMessage(error: unknown): string {
  if (isAxiosError<ApiResponse<unknown>>(error)) {
    const payload = error.response?.data;

    if (payload && payload.success === false) {
      const firstFieldError =
        payload.errors && payload.errors.length > 0 ? payload.errors[0] : undefined;
      return firstFieldError ?? payload.message ?? "Something went wrong.";
    }

    if (error.code === "ERR_NETWORK") {
      return "Can't reach the server. Check your connection and try again.";
    }

    if (error.response?.status === 401) {
      return "Your session has expired. Please log in again.";
    }

    if (error.response?.status === 403) {
      return "You don't have permission to do that.";
    }

    return error.message || "Something went wrong.";
  }

  if (error instanceof Error) return error.message;

  return "Something went wrong. Please try again.";
}
