/**
 * src/features/student/api/studentApi.ts
 *
 * Client functions matching the existing student routes exactly:
 *   GET  /student/tasks
 *   POST /student/tasks/:taskId/submit  (multipart or JSON)
 *   GET  /student/submissions
 *   GET  /student/submissions/:submissionId/history
 *
 * Uses the shared apiClient (Bearer token injected by the interceptor).
 * No duplicate routes, no new backend endpoints.
 */
import { apiClient } from "@services/apiClient";
import type { ApiResponse } from "@/types/common";
import type { StudentAssignment } from "@/types/studentAssignment";
import type {
  StudentSubmission,
  SubmissionVersion,
  SubmitTaskResponse,
} from "@/types/submission";

async function _unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const { data } = await promise;
  if (!data.success) throw new Error(data.message);
  return data.data;
}

export const studentApi = {
  /** GET /student/tasks — returns all tasks for the student's classroom,
   *  each with assignment_status and effective_score computed server-side. */
  getMyAssignments(): Promise<StudentAssignment[]> {
    return _unwrap<{ tasks: StudentAssignment[] }>(
      apiClient.get("/student/tasks")
    ).then((d) => d.tasks);
  },

  /**
   * POST /student/tasks/:taskId/submit
   * Sends either a typed text answer or a file (or both).
   * Always multipart/form-data so the backend multer middleware is satisfied.
   */
  submitTask(
    taskId: number,
    payload: { typedText?: string; file?: File }
  ): Promise<SubmitTaskResponse> {
    const form = new FormData();
    if (payload.typedText?.trim()) {
      form.append("typedText", payload.typedText);
    }
    if (payload.file) {
      form.append("file", payload.file);
    }
    return _unwrap<SubmitTaskResponse>(
      apiClient.post(`/student/tasks/${taskId}/submit`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    );
  },

  /** GET /student/submissions — returns all submissions with task metadata and effective_score */
  getMySubmissions(): Promise<StudentSubmission[]> {
    return _unwrap<{ submissions: StudentSubmission[] }>(
      apiClient.get("/student/submissions")
    ).then((d) => d.submissions);
  },

  /** GET /student/submissions/:submissionId/history — previous attempt versions */
  getSubmissionHistory(submissionId: number): Promise<SubmissionVersion[]> {
    return _unwrap<{ versions: SubmissionVersion[] }>(
      apiClient.get(`/student/submissions/${submissionId}/history`)
    ).then((d) => d.versions);
  },
};
