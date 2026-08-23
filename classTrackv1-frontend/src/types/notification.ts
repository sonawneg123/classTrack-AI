/**
 * src/types/notification.ts
 *
 * Types for the notification system.
 * Matches the database schema exactly:
 *   notifications(id, recipient_type, recipient_id, classroom_id, task_id,
 *                 type, title, message, is_read, created_at)
 */
export interface Notification {
  id: number;
  recipient_type: "student" | "teacher" | "admin";
  recipient_id: number;
  classroom_id: number | null;
  task_id: number | null;
  type: string;
  title: string;
  message: string | null;
  is_read: number | boolean;
  created_at: string;
}

export interface NotificationListResult {
  notifications: Notification[];
  unreadCount: number;
}
