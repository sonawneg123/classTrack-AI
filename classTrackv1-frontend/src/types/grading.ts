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
