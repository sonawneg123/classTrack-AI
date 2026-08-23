/**
 * src/features/notifications/hooks/useNotifications.ts
 *
 * React Query hook for the authenticated user's real notifications.
 * Fetches from GET /account/notifications (real backend, not mock).
 *
 * staleTime: 60s — avoids hammering the server on every re-render.
 * refetchOnWindowFocus: true — so the student sees new notifications when
 *   they switch back to the tab after the teacher grades their submission.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationApi } from "../api/notificationApi";

export const NOTIFICATIONS_QUERY_KEY = ["notifications", "real"] as const;

export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: () => notificationApi.getNotifications(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: number) => notificationApi.markRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}
