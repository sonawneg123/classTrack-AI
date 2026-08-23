import { apiClient } from "@services/apiClient";
import type { ApiResponse } from "@/types/common";
import type {
  Classroom,
  ClassroomFormValues,
  ClassroomListParams,
  ClassroomListResult,
  TeacherDashboardStats,
} from "@/types/classroom";
import type { Task, TaskFormValues, TaskListParams, TaskListResult } from "@/types/task";
import type { GradingOverview, PendingEvaluation, TaskSubmissionRoster, TeacherSubmission } from "@/types/grading";

const ENDPOINTS = {
  DASHBOARD: "/teacher/dashboard",
  CLASSROOMS: "/teacher/classrooms/manage",
  CLASSROOM: (id: number) => `/teacher/classrooms/manage/${id}`,
  ARCHIVE: (id: number) => `/teacher/classrooms/manage/${id}/archive`,
  RESTORE: (id: number) => `/teacher/classrooms/manage/${id}/restore`,
  REGENERATE_CODE: (id: number) => `/teacher/classrooms/manage/${id}/regenerate-code`,
  GRADING_OVERVIEW: (id: number) => `/teacher/classrooms/manage/${id}/grading-overview`,
  TASK_SUBMISSIONS: (taskId: number) => `/teacher/tasks/${taskId}/submissions`,
  SUBMISSION: (submissionId: number) => `/teacher/submissions/${submissionId}`,
  SUBMISSION_HISTORY: (submissionId: number) => `/teacher/submissions/${submissionId}/history`,
  OVERRIDE_SCORE: (submissionId: number) => `/teacher/submissions/${submissionId}/override-score`,
  PENDING_EVALUATIONS: "/teacher/pending-evaluations",
  TASKS: "/teacher/tasks",
  TASK: (id: number) => `/teacher/tasks/${id}`,
  TASK_PUBLISH: (id: number) => `/teacher/tasks/${id}/publish`,
  TASK_UNPUBLISH: (id: number) => `/teacher/tasks/${id}/unpublish`,
  TASK_ARCHIVE: (id: number) => `/teacher/tasks/${id}/archive`,
  TASK_RESTORE: (id: number) => `/teacher/tasks/${id}/restore`,
  TASK_DUPLICATE: (id: number) => `/teacher/tasks/${id}/duplicate`,
} as const;

async function _unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const { data } = await promise;
  if (!data.success) throw new Error(data.message);
  return data.data;
}

export const teacherApi = {
  getDashboardStats: () =>
    _unwrap<TeacherDashboardStats>(apiClient.get(ENDPOINTS.DASHBOARD)),

  listClassrooms: (params: ClassroomListParams) =>
    _unwrap<ClassroomListResult>(apiClient.get(ENDPOINTS.CLASSROOMS, { params })),

  getClassroom: (id: number) =>
    _unwrap<Classroom>(apiClient.get(ENDPOINTS.CLASSROOM(id))),

  createClassroom: (payload: ClassroomFormValues) =>
    _unwrap<{ id: number; name: string; subject: string | null; section: string | null; classCode: string }>(
      apiClient.post(ENDPOINTS.CLASSROOMS, payload)
    ),

  updateClassroom: (id: number, payload: Partial<ClassroomFormValues>) =>
    _unwrap<void>(apiClient.patch(ENDPOINTS.CLASSROOM(id), payload)),

  archiveClassroom: (id: number) => _unwrap<void>(apiClient.patch(ENDPOINTS.ARCHIVE(id))),

  restoreClassroom: (id: number) => _unwrap<void>(apiClient.patch(ENDPOINTS.RESTORE(id))),

  deleteClassroom: (id: number) => _unwrap<void>(apiClient.delete(ENDPOINTS.CLASSROOM(id))),

  regenerateJoinCode: (id: number) =>
    _unwrap<{ classCode: string }>(apiClient.patch(ENDPOINTS.REGENERATE_CODE(id))),

  listTasks: (params: TaskListParams) =>
    _unwrap<TaskListResult>(apiClient.get(ENDPOINTS.TASKS, { params })),

  getTask: (id: number) => _unwrap<Task>(apiClient.get(ENDPOINTS.TASK(id))),

  createTask: (payload: TaskFormValues) =>
    _unwrap<{ taskId: number }>(apiClient.post(ENDPOINTS.TASKS, payload)),

  updateTask: (id: number, payload: Partial<TaskFormValues>) =>
    _unwrap<void>(apiClient.patch(ENDPOINTS.TASK(id), payload)),

  deleteTask: (id: number) => _unwrap<void>(apiClient.delete(ENDPOINTS.TASK(id))),

  publishTask: (id: number) => _unwrap<void>(apiClient.patch(ENDPOINTS.TASK_PUBLISH(id))),

  unpublishTask: (id: number) => _unwrap<void>(apiClient.patch(ENDPOINTS.TASK_UNPUBLISH(id))),

  archiveTask: (id: number) => _unwrap<void>(apiClient.patch(ENDPOINTS.TASK_ARCHIVE(id))),

  restoreTask: (id: number) => _unwrap<void>(apiClient.patch(ENDPOINTS.TASK_RESTORE(id))),

  duplicateTask: (id: number) => _unwrap<{ taskId: number }>(apiClient.post(ENDPOINTS.TASK_DUPLICATE(id))),

  getGradingOverview: (classroomId: number) =>
    _unwrap<GradingOverview>(apiClient.get(ENDPOINTS.GRADING_OVERVIEW(classroomId))),

  getTaskSubmissions: (taskId: number) =>
    _unwrap<TaskSubmissionRoster>(apiClient.get(ENDPOINTS.TASK_SUBMISSIONS(taskId))),

  getSubmission: (submissionId: number) =>
    _unwrap<{ submission: TeacherSubmission }>(apiClient.get(ENDPOINTS.SUBMISSION(submissionId))),

  overrideScore: (submissionId: number, payload: { teacherScore: number | null; teacherFeedback?: string }) =>
    _unwrap<void>(apiClient.patch(ENDPOINTS.OVERRIDE_SCORE(submissionId), payload)),

  getSubmissionVersionHistory: (submissionId: number) =>
    _unwrap<{ versions: unknown[] }>(apiClient.get(ENDPOINTS.SUBMISSION_HISTORY(submissionId))),

  getPendingEvaluations: () =>
    _unwrap<{ submissions: PendingEvaluation[] }>(apiClient.get(ENDPOINTS.PENDING_EVALUATIONS)),
};
