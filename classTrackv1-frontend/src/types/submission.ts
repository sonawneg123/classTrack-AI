/**
 * src/types/submission.ts
 *
 * Matches the actual backend response shapes for:
 *   GET  /student/submissions         → StudentSubmission[]
 *   GET  /student/submissions/:id/history → SubmissionVersion[]
 *   POST /student/tasks/:id/submit    → SubmitTaskResponse
 *
 * Column names are snake_case (raw DB rows — the student controller does
 * not camelCase-normalize, same convention as studentAssignment.ts).
 */

export type SubmissionStatus = "submitted" | "analyzing" | "analyzed" | "failed";

/** Shape returned by GET /student/submissions (listByStudent + effectiveScore) */
export interface StudentSubmission {
  id: number;
  task_id: number;
  student_id: number;
  attempt_number: number;
  file_path: string | null;
  original_filename: string | null;
  file_type: string | null;
  typed_text: string | null;
  extracted_text: string | null;
  status: SubmissionStatus;
  ai_score: string | null;      // DECIMAL from mysql2 → string
  ai_summary: string | null;
  ai_strengths: string | null;  // JSON-serialized string[]
  ai_improvements: string | null; // JSON-serialized string[]
  teacher_score: string | null; // DECIMAL from mysql2 → string
  teacher_feedback: string | null;
  score_overridden_by: number | null;
  submitted_at: string;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined from tasks table
  task_title: string;
  max_score: string;            // DECIMAL from mysql2 → string
  // Computed by scoring.util.js effectiveScore()
  effective_score: number | null;
}

/** Shape returned by GET /student/submissions/:id/history (getVersionHistory) */
export interface SubmissionVersion {
  id: number;
  submission_id: number;
  attempt_number: number;
  file_path: string | null;
  original_filename: string | null;
  file_type: string | null;
  typed_text: string | null;
  extracted_text: string | null;
  ai_score: string | null;
  ai_summary: string | null;
  ai_strengths: string | null;  // JSON-serialized string[]
  ai_improvements: string | null;
  teacher_score: string | null;
  teacher_feedback: string | null;
  created_at: string;
}

/** Shape returned by POST /student/tasks/:taskId/submit */
export interface SubmitTaskResponse {
  submissionId: number;
  attemptNumber: number;
  /** true when AI evaluation was queued; false when ai_evaluation_enabled=false */
  aiQueued: boolean;
}
