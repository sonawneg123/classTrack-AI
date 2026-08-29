// src/types/question.ts

export type QuestionType =
  | 'mcq'
  | 'true_false'
  | 'fill_blank'
  | 'one_word'
  | 'short_answer'
  | 'matching'
  | 'scenario'
  | 'descriptive';

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export type QuestionStatus =
  | 'generated'
  | 'validated'
  | 'pending_approval'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'archived';

export type MatchingPair = { left: string; right: string };
export type QuestionOptions = string[] | MatchingPair[] | null;

export interface Question {
  id: number;
  question_type: QuestionType;
  difficulty: QuestionDifficulty;
  marks: number;
  question_text: string;
  options: QuestionOptions;
  correct_answer: string;
  explanation: string | null;
  status: QuestionStatus;
  curriculum_id: number;
  subject_id: number;
  chapter_id: number;
  topic_id: number;
  source_document_id: number;
  source_chunk_id: number;
  generation_model: string;
  generation_provider: string;
  created_by: number;
  created_by_role: 'teacher' | 'student';
  approved_by: number | null;
  approved_at: string | null;
  rejected_reason: string | null;
  // enriched fields (pending-approval list only)
  topic_name?: string;
  chapter_name?: string;
  subject_name?: string;
  curriculum_name?: string;
  created_at: string;
  updated_at: string;
}

export interface GenerateQuestionsRequest {
  topicId: number;
  questionType: QuestionType;
  difficulty: QuestionDifficulty;
  count: number;
}

export interface GenerateQuestionsResponse {
  generated: number;
  stored: number;
  skippedDuplicates: number;
  skippedInvalid: number;
  questions: Question[];
}
