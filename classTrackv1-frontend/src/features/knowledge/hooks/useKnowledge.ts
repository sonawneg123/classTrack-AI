// src/features/knowledge/hooks/useKnowledge.ts

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { knowledgeApi } from "../api/knowledgeApi";
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
  return useQuery({
    queryKey: K.documents(topicId!),
    queryFn: () => knowledgeApi.listDocuments(topicId!),
    enabled: !!topicId,
    refetchInterval: (query) => {
      // Poll every 3 seconds if any document is still processing/uploaded
      const docs = (query.state.data as { documents: { status: string }[] } | undefined)?.documents;
      const hasPending = docs?.some((d) => d.status === "processing" || d.status === "uploaded");
      return hasPending ? 3000 : false;
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
