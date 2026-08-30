// src/features/knowledge/hooks/useKnowledge.ts

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useSnackbar } from "notistack";
import { knowledgeApi, studentKnowledgeApi } from "../api/knowledgeApi";
import { getErrorMessage } from "@utils/apiError";

// ── Query keys ────────────────────────────────────────────────────────────────
const K = {
  curricula: ["knowledge", "curricula"] as const,
  subjects: (cId: number) => ["knowledge", "subjects", cId] as const,
  chapters: (sId: number) => ["knowledge", "chapters", sId] as const,
  topics: (chId: number) => ["knowledge", "topics", chId] as const,
  documents: (tId: number) => ["knowledge", "documents", tId] as const,
  documentStatus: (docId: number) => ["knowledge", "document-status", docId] as const,
};

// Maximum time we will keep polling before giving up (10 minutes).
// This is a frontend safety net only — it does NOT hide a backend failure.
// Backend failures are surfaced as status=failed with failure_message.
const MAX_POLL_MS = 10 * 60 * 1000;

// ── Curricula ─────────────────────────────────────────────────────────────────
export function useCurricula() {
  return useQuery({
    queryKey: K.curricula,
    queryFn: () => knowledgeApi.listCurricula(),
  });
}

export function useCreateCurriculum() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { name: string; description?: string }) => knowledgeApi.createCurriculum(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K.curricula });
      enqueueSnackbar("Curriculum created.", { variant: "success" });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

export function useDeleteCurriculum() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => knowledgeApi.deleteCurriculum(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K.curricula });
      enqueueSnackbar("Curriculum deleted.", { variant: "success" });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

// ── Subjects ──────────────────────────────────────────────────────────────────
export function useSubjects(curriculumId: number | null) {
  return useQuery({
    queryKey: K.subjects(curriculumId!),
    queryFn: () => knowledgeApi.listSubjects(curriculumId!),
    enabled: !!curriculumId,
  });
}

export function useCreateSubject() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ curriculumId, payload }: { curriculumId: number; payload: { name: string; description?: string } }) =>
      knowledgeApi.createSubject(curriculumId, payload),
    onSuccess: (_, { curriculumId }) => {
      qc.invalidateQueries({ queryKey: K.subjects(curriculumId) });
      enqueueSnackbar("Subject created.", { variant: "success" });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

export function useDeleteSubject() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, curriculumId }: { id: number; curriculumId: number }) =>
      knowledgeApi.deleteSubject(id).then(() => curriculumId),
    onSuccess: (curriculumId) => {
      qc.invalidateQueries({ queryKey: K.subjects(curriculumId) });
      enqueueSnackbar("Subject deleted.", { variant: "success" });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

// ── Chapters ──────────────────────────────────────────────────────────────────
export function useChapters(subjectId: number | null) {
  return useQuery({
    queryKey: K.chapters(subjectId!),
    queryFn: () => knowledgeApi.listChapters(subjectId!),
    enabled: !!subjectId,
  });
}

export function useCreateChapter() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ subjectId, payload }: { subjectId: number; payload: { name: string; description?: string } }) =>
      knowledgeApi.createChapter(subjectId, payload),
    onSuccess: (_, { subjectId }) => {
      qc.invalidateQueries({ queryKey: K.chapters(subjectId) });
      enqueueSnackbar("Chapter created.", { variant: "success" });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

export function useDeleteChapter() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, subjectId }: { id: number; subjectId: number }) =>
      knowledgeApi.deleteChapter(id).then(() => subjectId),
    onSuccess: (subjectId) => {
      qc.invalidateQueries({ queryKey: K.chapters(subjectId) });
      enqueueSnackbar("Chapter deleted.", { variant: "success" });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

// ── Topics ────────────────────────────────────────────────────────────────────
export function useTopics(chapterId: number | null) {
  return useQuery({
    queryKey: K.topics(chapterId!),
    queryFn: () => knowledgeApi.listTopics(chapterId!),
    enabled: !!chapterId,
  });
}

export function useCreateTopic() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chapterId, payload }: { chapterId: number; payload: { name: string; description?: string } }) =>
      knowledgeApi.createTopic(chapterId, payload),
    onSuccess: (_, { chapterId }) => {
      qc.invalidateQueries({ queryKey: K.topics(chapterId) });
      enqueueSnackbar("Topic created.", { variant: "success" });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

export function useDeleteTopic() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, chapterId }: { id: number; chapterId: number }) =>
      knowledgeApi.deleteTopic(id).then(() => chapterId),
    onSuccess: (chapterId) => {
      qc.invalidateQueries({ queryKey: K.topics(chapterId) });
      enqueueSnackbar("Topic deleted.", { variant: "success" });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

// ── Documents ─────────────────────────────────────────────────────────────────
export function useDocuments(topicId: number | null) {
  // Track when polling started so we can apply a maximum polling duration.
  const pollStartRef = useRef<number | null>(null);

  return useQuery({
    queryKey: K.documents(topicId!),
    queryFn: () => knowledgeApi.listDocuments(topicId!),
    enabled: !!topicId,
    refetchInterval: (query) => {
      const docs = (query.state.data as { documents: { status: string }[] } | undefined)?.documents;
      const hasPending = docs?.some((d) => d.status === "processing" || d.status === "uploaded");

      if (!hasPending) {
        // All documents are settled (ready or failed) — stop polling
        pollStartRef.current = null;
        return false;
      }

      // Record when polling began so we can enforce a maximum duration
      if (pollStartRef.current === null) {
        pollStartRef.current = Date.now();
      }

      // Safety net: stop polling after MAX_POLL_MS to avoid runaway requests.
      // This does NOT hide a backend failure — a failed document will already
      // have status=failed with a failure_message before this limit is reached
      // in any normal scenario.
      if (Date.now() - pollStartRef.current > MAX_POLL_MS) {
        pollStartRef.current = null;
        return false;
      }

      return 3000;
    },
  });
}

export function useUploadDocument() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ topicId, formData }: { topicId: number; formData: FormData }) =>
      knowledgeApi.uploadDocument(topicId, formData),
    onSuccess: (_, { topicId }) => {
      qc.invalidateQueries({ queryKey: K.documents(topicId) });
      enqueueSnackbar("Document uploaded — processing started.", { variant: "success" });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

export function useRetryDocument() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, topicId }: { documentId: number; topicId: number }) =>
      knowledgeApi.retryDocument(documentId).then(() => topicId),
    onSuccess: (topicId) => {
      qc.invalidateQueries({ queryKey: K.documents(topicId) });
      enqueueSnackbar("Document queued for retry.", { variant: "success" });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

export function useArchiveDocument() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, topicId }: { documentId: number; topicId: number }) =>
      knowledgeApi.archiveDocument(documentId).then(() => topicId),
    onSuccess: (topicId) => {
      qc.invalidateQueries({ queryKey: K.documents(topicId) });
      enqueueSnackbar("Document archived.", { variant: "success" });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

// ── Search ────────────────────────────────────────────────────────────────────
export function useKnowledgeSearch() {
  const { enqueueSnackbar } = useSnackbar();
  return useMutation({
    mutationFn: (payload: {
      query: string;
      topK?: number;
      curriculumId?: number;
      subjectId?: number;
      chapterId?: number;
      topicId?: number;
    }) => knowledgeApi.search(payload),
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

// ── Student read-only hierarchy hooks ─────────────────────────────────────────
// Uses /student/knowledge/* endpoints scoped to the student's classroom teacher.
// These are separate from the teacher hooks above — students must NEVER call
// /knowledge/* (teacher-only endpoints).

const SK = {
  curricula: ["student-knowledge", "curricula"] as const,
  subjects:  (cId: number) => ["student-knowledge", "subjects", cId] as const,
  chapters:  (sId: number) => ["student-knowledge", "chapters", sId] as const,
  topics:    (chId: number) => ["student-knowledge", "topics", chId] as const,
};

export function useStudentCurricula() {
  return useQuery({
    queryKey: SK.curricula,
    queryFn: () => studentKnowledgeApi.listCurricula(),
  });
}

export function useStudentSubjects(curriculumId: number | null) {
  return useQuery({
    queryKey: SK.subjects(curriculumId!),
    queryFn: () => studentKnowledgeApi.listSubjects(curriculumId!),
    enabled: !!curriculumId,
  });
}

export function useStudentChapters(subjectId: number | null) {
  return useQuery({
    queryKey: SK.chapters(subjectId!),
    queryFn: () => studentKnowledgeApi.listChapters(subjectId!),
    enabled: !!subjectId,
  });
}

export function useStudentTopics(chapterId: number | null) {
  return useQuery({
    queryKey: SK.topics(chapterId!),
    queryFn: () => studentKnowledgeApi.listTopics(chapterId!),
    enabled: !!chapterId,
  });
}
