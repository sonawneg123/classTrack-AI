// src/types/practiceSession.ts
//
// Sprint 3 Phase 1 — Practice Session + Topic Mastery types

// ── Practice Session ──────────────────────────────────────────────────────────

export type PracticeSessionStatus = 'active' | 'completed';

export interface PracticeSession {
  id: number;
  student_id: number;
  topic_id: number;
  status: PracticeSessionStatus;
  question_type: string | null;
  difficulty: string | null;
  question_count: number;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSessionRequest {
  topicId: number;
  questionType?: string;
  difficulty?: string;
  questionCount?: number;
}

export interface CreateSessionResponse {
  session: PracticeSession;
}

export interface CompleteSessionResponse {
  session: PracticeSession;
  mastery: TopicMastery | null;
}

// ── Topic Mastery ─────────────────────────────────────────────────────────────

export type MasteryLevel = 'mastered' | 'progressing' | 'needs_practice';
export type RecommendedDifficulty = 'easy' | 'medium' | 'hard';

export interface TopicMastery {
  id: number;
  student_id: number;
  topic_id: number;
  /** 0.0 – 1.0 */
  mastery_score: number;
  sessions_completed: number;
  questions_attempted: number;
  questions_correct: number;
  consecutive_correct: number;
  consecutive_incorrect: number;
  last_session_at: string | null;
  created_at: string;
  updated_at: string;
  /** Derived (not persisted) — computed from mastery_score at read time */
  current_difficulty: RecommendedDifficulty;
  /** Derived (not persisted) */
  mastery_level: MasteryLevel;
  /** Joined from topics table (only on listMastery) */
  topic_name?: string;
}
