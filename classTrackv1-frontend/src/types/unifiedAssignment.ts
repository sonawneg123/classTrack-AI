/**
 * src/types/unifiedAssignment.ts
 *
 * Unified discriminated-union type for the student Assignments page.
 *
 * The student Assignments page shows BOTH:
 *   - File-submission Tasks (type = 'task')
 *   - Quiz Assignments      (type = 'quiz')
 *
 * Each variant carries enough display fields (title, due_date, status, score)
 * so the rendering layer doesn't need to branch into different APIs.
 *
 * No backend changes are needed — both are fetched in parallel and merged here.
 */

import type { StudentAssignment } from './studentAssignment';
import type { StudentQuizView } from './quizAssignment';

// ── Unified assignment status ─────────────────────────────────────────────────
// Shared status vocabulary for both assignment types.
export type UnifiedAssignmentStatus = 'upcoming' | 'submitted' | 'pending' | 'overdue';

// ── Task variant ──────────────────────────────────────────────────────────────
export interface UnifiedTask {
  type: 'task';
  id: number;
  title: string;
  classroom_id: number;
  due_date: string | null;
  assignment_status: UnifiedAssignmentStatus;
  submission_status: StudentAssignment['submission_status'];
  effective_score: number | null;
  max_score: string;           // comes as string from pg NUMERIC
  teacher_score: string | null;
  ai_evaluation_enabled: number;
  /** Raw task for passing through to AssignmentDetailPage */
  raw: StudentAssignment;
}

// ── Quiz variant ──────────────────────────────────────────────────────────────
export interface UnifiedQuiz {
  type: 'quiz';
  id: number;
  title: string;
  classroom_id: number;
  classroom_name: string | undefined;
  due_date: string | null;
  assignment_status: UnifiedAssignmentStatus;
  attempt_status: 'in_progress' | 'submitted' | undefined;
  attempt_score: number | null | undefined;
  attempt_max_score: number | null | undefined;
  question_count: number;
  allow_retake: boolean;
  /** Raw quiz view for passing through to TakeQuizPage */
  raw: StudentQuizView;
}

export type UnifiedAssignment = UnifiedTask | UnifiedQuiz;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Compute unified assignment_status for a quiz (mirrors student.service.js logic) */
export function quizAssignmentStatus(quiz: StudentQuizView): UnifiedAssignmentStatus {
  // If latest attempt is submitted → submitted
  if (quiz.attempt_status === 'submitted') return 'submitted';
  // If in_progress, treat as upcoming (student has started)
  if (quiz.attempt_status === 'in_progress') return 'upcoming';
  // Not started
  if (!quiz.due_date) return 'pending';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(quiz.due_date) < today ? 'overdue' : 'upcoming';
}

/** Map a StudentQuizView → UnifiedQuiz */
export function toUnifiedQuiz(q: StudentQuizView): UnifiedQuiz {
  return {
    type: 'quiz',
    id: q.id,
    title: q.title,
    classroom_id: q.classroom_id,
    classroom_name: q.classroom_name,
    due_date: q.due_date,
    assignment_status: quizAssignmentStatus(q),
    attempt_status: q.attempt_status,
    attempt_score: q.attempt_score,
    attempt_max_score: q.attempt_max_score,
    question_count: Number(q.question_count),
    allow_retake: q.allow_retake,
    raw: q,
  };
}

/** Map a StudentAssignment → UnifiedTask */
export function toUnifiedTask(t: StudentAssignment): UnifiedTask {
  return {
    type: 'task',
    id: t.id,
    title: t.title,
    classroom_id: t.classroom_id,
    due_date: t.due_date,
    assignment_status: t.assignment_status as UnifiedAssignmentStatus,
    submission_status: t.submission_status,
    effective_score: t.effective_score,
    max_score: t.max_score,
    teacher_score: t.teacher_score,
    ai_evaluation_enabled: t.ai_evaluation_enabled,
    raw: t,
  };
}
