// src/types/knowledge.ts

export type DocumentStatus = "uploaded" | "processing" | "ready" | "failed";

export interface Curriculum {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subject {
  id: number;
  curriculum_id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: number;
  subject_id: number;
  name: string;
  description: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface Topic {
  id: number;
  chapter_id: number;
  name: string;
  description: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeDocument {
  id: number;
  topic_id: number;
  title: string;
  original_filename: string;
  file_type: "pdf" | "docx" | "txt";
  file_size_bytes: number | null;
  version: number;
  parent_document_id: number | null;
  status: DocumentStatus;
  failure_message: string | null;
  retry_count: number;
  processed_at: string | null;
  total_chunks: number | null;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  chunkId: number;
  chunkIndex: number;
  text: string;
  similarity: number;
  source: {
    documentId: number;
    documentTitle: string;
    originalFilename: string;
    fileType: string;
    sourceMeta: Record<string, unknown> | null;
    topic: { id: number; name: string };
    chapter: { id: number; name: string };
    subject: { id: number; name: string };
    curriculum: { id: number; name: string };
  };
}

export interface SearchResponse {
  results: SearchResult[];
}
