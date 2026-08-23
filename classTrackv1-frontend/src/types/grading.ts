/**
 * src/types/grading.ts
 *
 * TypeScript types for the Teacher Classroom Grading Overview feature.
 * These map 1:1 to the shapes returned by:
 *   GET /api/v1/teacher/classrooms/manage/:classroomId/grading-overview
 */

export interface GradingSummary {
  classroomId: number;
  classroomName: string;
  subject: string | null;
  section: string | null;
  classCode: string;
  isActive: boolean;
  studentCount: number;
  taskCount: number;
  totalSubmissions: number;
  evaluatedCount: number;
  pendingCount: number;
  /** COALESCE(teacher_score, ai_score) average — null when no evaluated submissions */
  avgScore: number | null;
}

export interface GradingTaskRow {
  taskId: number;
  title: string;
  dueDate: string | null;
  maxScore: number;
  isPublished: boolean;
  isArchived: boolean;
  studentCount: number;
  submittedCount: number;
  evaluatedCount: number;
  pendingCount: number;
  /** COALESCE(teacher_score, ai_score) average — null when no evaluated submissions */
  avgScore: number | null;
  /** submittedCount / studentCount * 100, 0 when no students */
  completionPct: number;
}

export interface GradingStudentRow {
  studentId: number;
  name: string;
  username: string;
  taskCount: number;
  submittedCount: number;
  evaluatedCount: number;
  pendingCount: number;
  /** COALESCE(teacher_score, ai_score) average — null when no evaluated submissions */
  avgScore: number | null;
}

export interface GradingOverview {
  summary: GradingSummary;
  tasks: GradingTaskRow[];
  students: GradingStudentRow[];
}

// ---------------------------------------------------------------------------
// Task submission roster — GET /teacher/tasks/:taskId/submissions
// ---------------------------------------------------------------------------

export interface TaskSubmission {
  id: number;
  task_id: number;
  student_id: number;
  attempt_number: number;
  file_path: string | null;
  original_filename: string | null;
  file_type: string | null;
  typed_text: string | null;
  extracted_text: string | null;
  status: "submitted" | "analyzing" | "analyzed" | "failed";
  ai_score: number | null;
  ai_summary: string | null;
  ai_strengths: string | null;   // JSON-encoded string array
  ai_improvements: string | null; // JSON-encoded string array
  teacher_score: number | null;
  teacher_feedback: string | null;
  score_overridden_by: number | null;
  submitted_at: string;
  analyzed_at: string | null;
  effective_score: number | null;
}

export interface TaskSubmissionStudent {
  id: number;
  name: string;
  username: string;
}

export interface TaskSubmissionRosterEntry {
  student: TaskSubmissionStudent;
  submission: TaskSubmission | null;
}

export interface TaskSubmissionTask {
  id: number;
  classroom_id: number;
  title: string;
  description: string | null;
  instructions: string | null;
  max_score: number;
  due_date: string | null;
  is_active: number;
}

export interface TaskSubmissionRoster {
  task: TaskSubmissionTask;
  roster: TaskSubmissionRosterEntry[];
}

// ---------------------------------------------------------------------------
// Pending evaluation — GET /teacher/pending-evaluations
// ---------------------------------------------------------------------------

export interface PendingEvaluation {
  id: number;
  task_id: number;
  student_id: number;
  attempt_number: number;
  file_path: string | null;
  original_filename: string | null;
  file_type: string | null;
  typed_text: string | null;
  status: "submitted" | "analyzing" | "analyzed" | "failed";
  ai_score: number | null;
  ai_summary: string | null;
  teacher_score: number | null;
  teacher_feedback: string | null;
  submitted_at: string;
  analyzed_at: string | null;
  effective_score: number | null;
  // Joined from tasks table
  task_title: string;
  max_score: number;
  classroom_id: number;
  classroom_name: string;
  // Joined from students table
  student_name: string;
  student_username: string;
}

// ---------------------------------------------------------------------------
// Single submission — GET /teacher/submissions/:submissionId
// ---------------------------------------------------------------------------

export interface TeacherSubmission {
  id: number;
  task_id: number;
  student_id: number;
  attempt_number: number;
  file_path: string | null;
  original_filename: string | null;
  file_type: string | null;
  typed_text: string | null;
  extracted_text: string | null;
  status: "submitted" | "analyzing" | "analyzed" | "failed";
  ai_score: number | null;
  ai_summary: string | null;
  ai_strengths: string | null;   // JSON-encoded string array
  ai_improvements: string | null; // JSON-encoded string array
  teacher_score: number | null;
  teacher_feedback: string | null;
  score_overridden_by: number | null;
  submitted_at: string;
  analyzed_at: string | null;
  effective_score: number | null;
  // Joined from tasks table
  task_title: string;
  task_description: string | null;
  max_score: number;
  classroom_id: number;
  // Joined from students table
  student_name: string;
  student_username: string;
}
