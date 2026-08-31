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

    if (error.code === "ERR_NETWORK") {
      return "Can't reach the server. Check your connection and try again.";
    }

    if (payload && payload.success === false) {
      const firstFieldError =
        payload.errors && payload.errors.length > 0 ? payload.errors[0] : undefined;
      return firstFieldError ?? payload.message ?? "Something went wrong.";
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

/**
 * Maps authentication-specific errors to safe, user-friendly messages.
 * Used by login, forgot-password, reset-password, and verify-email forms
 * to avoid exposing internal server details while still surfacing
 * actionable guidance.
 */
export function getAuthErrorMessage(error: unknown): {
  message: string;
  type: "invalid_credentials" | "locked" | "disabled" | "email_unverified" | "network" | "server" | "validation";
} {
  if (isAxiosError<ApiResponse<unknown>>(error)) {
    const status = error.response?.status;
    const payload = error.response?.data;

    if (error.code === "ERR_NETWORK" || !error.response) {
      return {
        message: "Can't reach the server. Check your connection and try again.",
        type: "network",
      };
    }

    const serverMessage =
      payload && payload.success === false
        ? (payload.errors && payload.errors.length > 0 ? payload.errors[0] : payload.message) ?? ""
        : "";

    if (status === 401) {
      return {
        message: "Invalid email or password.",
        type: "invalid_credentials",
      };
    }

    if (status === 403) {
      // Account locked — backend message contains "locked" or "Too many"
      const isLocked =
        serverMessage.toLowerCase().includes("lock") ||
        serverMessage.toLowerCase().includes("too many failed");
      if (isLocked) {
        return {
          message:
            "Your account is temporarily locked due to too many failed login attempts. Please try again later.",
          type: "locked",
        };
      }
      // Account disabled
      const isDisabled =
        serverMessage.toLowerCase().includes("disabled") ||
        serverMessage.toLowerCase().includes("contact your administrator");
      if (isDisabled) {
        return {
          message: "Your account is disabled. Please contact your administrator.",
          type: "disabled",
        };
      }
      // Email verification required
      const isUnverified =
        serverMessage.toLowerCase().includes("verify") ||
        serverMessage.toLowerCase().includes("verification");
      if (isUnverified) {
        return {
          message: "Please verify your email address before signing in.",
          type: "email_unverified",
        };
      }
      // Generic 403 fallback
      return {
        message: serverMessage || "Access denied. Please contact your administrator.",
        type: "disabled",
      };
    }

    if (status === 429) {
      return {
        message:
          serverMessage || "Too many attempts. Please wait a few minutes and try again.",
        type: "locked",
      };
    }

    if (status === 400) {
      return {
        message: serverMessage || "Please check your input and try again.",
        type: "validation",
      };
    }

    if (status && status >= 500) {
      return {
        message: "Something went wrong. Please try again.",
        type: "server",
      };
    }

    return {
      message: serverMessage || "Something went wrong. Please try again.",
      type: "server",
    };
  }

  if (error instanceof Error) {
    return { message: error.message, type: "server" };
  }

  return { message: "Something went wrong. Please try again.", type: "server" };
}
