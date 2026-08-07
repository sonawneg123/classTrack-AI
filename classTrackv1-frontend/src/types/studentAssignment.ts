/**
 * Matches GET /student/tasks's actual response shape exactly — unlike the
 * teacher endpoints, this one is not camelCase-normalized on the backend
 * (student.controller.js passes the raw DB row straight through). Consumed
 * as-is here rather than changing existing, working backend response
 * shape as part of this feature. Flagged as technical debt in the report.
 */
export interface StudentAssignment {
  id: number;
  classroom_id: number;
  title: string;
  description: string | null;
  instructions: string | null;
  max_score: string; // DECIMAL comes back as a string from mysql2
  due_date: string | null;
  task_date: string | null;
  is_active: number;
  ai_evaluation_enabled: number;
  allowed_file_types: string[] | null;
  late_submission_allowed: number;
  max_file_size_mb: number | null;
  submission_id: number | null;
  submission_status: "submitted" | "analyzing" | "analyzed" | "failed" | null;
  ai_score: string | null;
  teacher_score: string | null;
  attempt_number: number | null;
  effective_score: number | null;
  assignment_status: "submitted" | "overdue" | "upcoming" | "pending";
}
