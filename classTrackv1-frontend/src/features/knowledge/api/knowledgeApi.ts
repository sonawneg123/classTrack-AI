// src/features/knowledge/api/knowledgeApi.ts

import { apiClient } from "@services/apiClient";
import type { ApiResponse } from "@/types/common";
import type {
  Curriculum,
  Subject,
  Chapter,
  Topic,
  KnowledgeDocument,
  SearchResponse,
} from "@/types/knowledge";

async function _unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const { data } = await promise;
  if (!data.success) throw new Error(data.message);
  return (data as { success: true; data: T }).data;
}

const BASE = "/knowledge";
const STUDENT_BASE = "/student/knowledge";

export const knowledgeApi = {
  // ── Curricula ──────────────────────────────────────────────────────────
  listCurricula: () =>
    _unwrap<{ curricula: Curriculum[] }>(apiClient.get(`${BASE}/curricula`)),

  createCurriculum: (payload: { name: string; description?: string }) =>
    _unwrap<Curriculum>(apiClient.post(`${BASE}/curricula`, payload)),

  getCurriculum: (id: number) =>
    _unwrap<Curriculum>(apiClient.get(`${BASE}/curricula/${id}`)),

  deleteCurriculum: (id: number) =>
    _unwrap<void>(apiClient.delete(`${BASE}/curricula/${id}`)),

  // ── Subjects ───────────────────────────────────────────────────────────
  listSubjects: (curriculumId: number) =>
    _unwrap<{ subjects: Subject[] }>(apiClient.get(`${BASE}/curricula/${curriculumId}/subjects`)),

  createSubject: (curriculumId: number, payload: { name: string; description?: string }) =>
    _unwrap<Subject>(apiClient.post(`${BASE}/curricula/${curriculumId}/subjects`, payload)),

  deleteSubject: (id: number) =>
    _unwrap<void>(apiClient.delete(`${BASE}/subjects/${id}`)),

  // ── Chapters ───────────────────────────────────────────────────────────
  listChapters: (subjectId: number) =>
    _unwrap<{ chapters: Chapter[] }>(apiClient.get(`${BASE}/subjects/${subjectId}/chapters`)),

  createChapter: (subjectId: number, payload: { name: string; description?: string; orderIndex?: number }) =>
    _unwrap<Chapter>(apiClient.post(`${BASE}/subjects/${subjectId}/chapters`, payload)),

  deleteChapter: (id: number) =>
    _unwrap<void>(apiClient.delete(`${BASE}/chapters/${id}`)),

  // ── Topics ─────────────────────────────────────────────────────────────
  listTopics: (chapterId: number) =>
    _unwrap<{ topics: Topic[] }>(apiClient.get(`${BASE}/chapters/${chapterId}/topics`)),

  createTopic: (chapterId: number, payload: { name: string; description?: string; orderIndex?: number }) =>
    _unwrap<Topic>(apiClient.post(`${BASE}/chapters/${chapterId}/topics`, payload)),

  deleteTopic: (id: number) =>
    _unwrap<void>(apiClient.delete(`${BASE}/topics/${id}`)),

  // ── Documents ──────────────────────────────────────────────────────────
  listDocuments: (topicId: number) =>
    _unwrap<{ documents: KnowledgeDocument[] }>(apiClient.get(`${BASE}/topics/${topicId}/documents`)),

  uploadDocument: (topicId: number, formData: FormData) =>
    _unwrap<KnowledgeDocument>(
      apiClient.post(`${BASE}/topics/${topicId}/documents`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    ),

  getDocumentStatus: (documentId: number) =>
    _unwrap<KnowledgeDocument>(apiClient.get(`${BASE}/documents/${documentId}/status`)),

  retryDocument: (documentId: number) =>
    _unwrap<{ id: number; retry_count: number }>(apiClient.post(`${BASE}/documents/${documentId}/retry`)),

  archiveDocument: (documentId: number) =>
    _unwrap<void>(apiClient.delete(`${BASE}/documents/${documentId}`)),

  // ── Search ─────────────────────────────────────────────────────────────
  search: (payload: {
    query: string;
    topK?: number;
    curriculumId?: number;
    subjectId?: number;
    chapterId?: number;
    topicId?: number;
  }) => _unwrap<SearchResponse>(apiClient.post(`${BASE}/search`, payload)),
};

// ── Student read-only hierarchy ───────────────────────────────────────────────
// Points to /student/knowledge/* endpoints which scope the hierarchy through
// the student's classroom → teacher_id. Students see only their teacher's data.
export const studentKnowledgeApi = {
  listCurricula: () =>
    _unwrap<{ curricula: Curriculum[] }>(apiClient.get(`${STUDENT_BASE}/curricula`)),

  listSubjects: (curriculumId: number) =>
    _unwrap<{ subjects: Subject[] }>(
      apiClient.get(`${STUDENT_BASE}/curricula/${curriculumId}/subjects`)
    ),

  listChapters: (subjectId: number) =>
    _unwrap<{ chapters: Chapter[] }>(
      apiClient.get(`${STUDENT_BASE}/subjects/${subjectId}/chapters`)
    ),

  listTopics: (chapterId: number) =>
    _unwrap<{ topics: Topic[] }>(
      apiClient.get(`${STUDENT_BASE}/chapters/${chapterId}/topics`)
    ),
};
