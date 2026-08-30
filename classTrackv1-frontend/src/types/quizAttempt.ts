// src/types/quizAttempt.ts
//
// Shapes returned by the quiz attempt endpoints (Sprint 4 + 5).

/** Shape returned by POST /questions/:id/attempt */
export interface SubmitAttemptResponse {
  attemptId: number;
  questionId: number;
  studentAnswer: string;
  /** null for free-text question types (short_answer, descriptive, scenario, fill_blank)
   *  that cannot be auto-scored by string comparison. */
  isCorrect: boolean | null;
  /** Points awarded. null for free-text types. */
  score: number | null;
  attemptCount: number;
  /** Revealed only after submitting */
  correctAnswer: string;
  explanation: string | null;
}

/** Shape returned by GET /questions/my-attempts
 *  (includes joined question_bank fields) */
export interface QuizAttempt {
  id: number;
  student_id: number;
  question_id: number;
  student_answer: string;
  is_correct: boolean | null;
  score: string | null;      // NUMERIC from pg → string
  attempt_count: number;
  first_attempted_at: string;
  last_attempted_at: string;
  // Joined from question_bank
  question_text: string;
  question_type: string;
  difficulty: string;
  marks: string;             // NUMERIC from pg → string
  correct_answer: string;
  explanation: string | null;
  topic_id: number;
  chapter_id: number;
  subject_id: number;
  curriculum_id: number;
}

/**
 * Shape returned by teacher result endpoints (Sprint 5).
 * Includes student identity (joined from students table).
 */
export interface TeacherQuizResult {
  id: number;
  student_id: number;
  question_id: number;
  student_answer: string;
  is_correct: boolean | null;
  score: string | null;       // NUMERIC from pg → string
  attempt_count: number;
  first_attempted_at: string;
  last_attempted_at: string;
  // Joined from question_bank
  question_text: string;
  question_type: string;
  difficulty: string;
  marks: string;              // NUMERIC from pg → string
  correct_answer: string;
  topic_id: number;
  // Joined from students
  student_name: string;
  student_username: string;
}
