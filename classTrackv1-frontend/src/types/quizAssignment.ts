// src/types/quizAssignment.ts
//
// TypeScript types for the Quiz Assignment domain (Sprint 7).

import type { QuestionType, QuestionDifficulty, QuestionOptions } from './question';

export type QuizStatus = 'draft' | 'published' | 'archived';
export type AttemptStatus = 'in_progress' | 'submitted';

// ── Quiz Assignment (list item / header) ─────────────────────────────────────

export interface QuizAssignment {
  id: number;
  teacher_id: number;
  classroom_id: number;
  classroom_name?: string;
  title: string;
  instructions: string | null;
  time_limit_minutes: number | null;
  due_date: string | null;
  status: QuizStatus;
  allow_retake: boolean;
  shuffle_questions: boolean;
  /** Populated in list queries via COUNT subquery */
  question_count: number;
  /** Number of distinct students who submitted (teacher view) */
  attempt_count: number;
  created_at: string;
  updated_at: string;
}

// ── Question within a quiz ────────────────────────────────────────────────────

export interface QuizAssignmentQuestion {
  /** ID of the quiz_assignment_questions join row */
  quiz_question_id: number;
  /** question_bank.id */
  id: number;
  quiz_assignment_id: number;
  question_id: number;
  order_index: number;
  marks_override: number | null;
  // Joined from question_bank:
  question_type: QuestionType;
  difficulty: QuestionDifficulty;
  marks: number;
  question_text: string;
  options: QuestionOptions;
  correct_answer: string;
  explanation: string | null;
  status?: string;
  topic_id?: number;
  chapter_id?: number;
  subject_id?: number;
  curriculum_id?: number;
}

// ── Detailed quiz (includes question list) ────────────────────────────────────

export interface QuizAssignmentDetail extends QuizAssignment {
  questions: QuizAssignmentQuestion[];
}

// ── Attempt ───────────────────────────────────────────────────────────────────

export interface QuizAssignmentAttempt {
  id: number;
  quiz_assignment_id: number;
  student_id: number;
  attempt_number: number;
  status: AttemptStatus;
  score: number | null;
  max_score: number | null;
  started_at: string;
  submitted_at: string | null;
}

// ── Student quiz view (quiz + questions + latest attempt) ─────────────────────

export interface StudentQuizView extends QuizAssignmentDetail {
  latest_attempt: QuizAssignmentAttempt | null;
  // Student-facing list fields (from listForStudent)
  attempt_number?: number;
  attempt_status?: AttemptStatus;
  attempt_score?: number | null;
  attempt_max_score?: number | null;
  attempt_submitted_at?: string | null;
}

// ── Submit payload / result ───────────────────────────────────────────────────

export interface QuizSubmitAnswer {
  questionId: number;
  studentAnswer: string;
}

export interface QuizAnswerResult {
  questionId: number;
  studentAnswer: string;
  isCorrect: boolean | null;
  score: number | null;
  correctAnswer: string;
  explanation: string | null;
  effectiveMarks: number;
}

export interface QuizSubmitResult {
  attemptNumber: number;
  totalScore: number;
  maxScore: number;
  answers: QuizAnswerResult[];
}

// ── Teacher results ───────────────────────────────────────────────────────────

/** A single ranked student row in the teacher results response. */
export interface TeacherQuizResultRow {
  studentId: number;
  studentName: string;
  username: string;
  rank: number;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  attemptNumber: number;
  totalAttempts: number;
  status: AttemptStatus;
  submittedAt: string | null;
}

/** Student enrolled in the classroom but has not submitted any attempt. */
export interface TeacherQuizNotAttempted {
  studentId: number;
  studentName: string;
  username: string;
  status: 'not_attempted';
}

/** Summary statistics for the class. */
export interface QuizResultSummary {
  totalStudents: number;
  attempted: number;
  notAttempted: number;
  averagePercentage: number | null;
  highestPercentage: number | null;
  lowestPercentage: number | null;
}

/** Quiz metadata returned in the results payload. */
export interface QuizResultQuizInfo {
  id: number;
  title: string;
  classroom: string;
  classroomId: number;
  teacher: string;
  maxScore: number;
  allowRetake: boolean;
  status: QuizStatus;
  dueDate: string | null;
}

/** Full teacher results response shape. */
export interface TeacherQuizResults {
  quiz: QuizResultQuizInfo;
  summary: QuizResultSummary;
  students: TeacherQuizResultRow[];
  notAttempted: TeacherQuizNotAttempted[];
}

// ── Individual student attempt detail ─────────────────────────────────────────

export interface StudentAttemptQuestionDetail {
  orderIndex: number;
  questionId: number;
  questionText: string;
  questionType: string;
  difficulty: string;
  correctAnswer: string;
  explanation: string | null;
  effectiveMarks: number;
  studentAnswer: string | null;
  isCorrect: boolean | null;
  score: number | null;
}

export interface StudentAttemptDetail {
  quiz: {
    id: number;
    title: string;
    classroom: string;
    teacher: string;
    maxScore: number;
  };
  student: {
    id: number;
    name: string;
    username: string;
  };
  attempt: {
    id: number;
    attemptNumber: number;
    status: AttemptStatus;
    score: number | null;
    maxScore: number | null;
    percentage: number | null;
    startedAt: string;
    submittedAt: string | null;
  };
  questions: StudentAttemptQuestionDetail[];
}

// ── Create / Update payloads ──────────────────────────────────────────────────

export interface CreateQuizPayload {
  classroomId: number;
  title: string;
  instructions?: string | null;
  timeLimitMinutes?: number | null;
  dueDate?: string | null;
  shuffleQuestions?: boolean;
  allowRetake?: boolean;
}

export interface UpdateQuizPayload {
  title?: string;
  instructions?: string | null;
  timeLimitMinutes?: number | null;
  dueDate?: string | null;
  shuffleQuestions?: boolean;
  allowRetake?: boolean;
}

/** Quick-select source: pick `count` random published questions from a topic */
export interface QuizQuestionSource {
  topicId: number;
  topicName?: string;
  count: number;
}

/** Batch-add payload — one of the two fields is required */
export interface BatchAddQuestionsPayload {
  sources?: QuizQuestionSource[];
  questionIds?: number[];
}
