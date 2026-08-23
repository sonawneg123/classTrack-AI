/**
 * src/features/notifications/api/notificationApi.ts
 *
 * Client functions for the shared notification endpoints:
 *   GET   /account/notifications
 *   PATCH /account/notifications/:id/read
 *   PATCH /account/notifications/read-all
 *
 * These routes are authenticated — the backend derives the recipient
 * from the JWT, so students only ever see their own notifications.
 */
import { apiClient } from "@services/apiClient";
import type { ApiResponse } from "@/types/common";
import type { NotificationListResult } from "@/types/notification";

async function _unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const { data } = await promise;
  if (!data.success) throw new Error(data.message);
  return data.data;
}

export const notificationApi = {
  /**
   * GET /account/notifications
   * Returns notifications for the currently authenticated user (any role).
   * The backend enforces ownership via the JWT — no userId query param needed.
   */
  getNotifications(params?: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<NotificationListResult> {
    return _unwrap<NotificationListResult>(
      apiClient.get("/account/notifications", { params })
    );
  },

  /** PATCH /account/notifications/:id/read */
  markRead(notificationId: number): Promise<void> {
    return _unwrap<void>(
      apiClient.patch(`/account/notifications/${notificationId}/read`)
    );
  },

  /** PATCH /account/notifications/read-all */
  markAllRead(): Promise<void> {
    return _unwrap<void>(
      apiClient.patch("/account/notifications/read-all")
    );
  },
};
