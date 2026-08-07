export type AllowedFileType = "pdf" | "jpg" | "jpeg" | "png" | "webp" | "txt";

export interface Task {
  id: number;
  classroomId: number;
  classroomName?: string;
  title: string;
  description: string | null;
  instructions: string | null;
  maxScore: number;
  dueDate: string | null;
  taskDate: string | null;
  isPublished: boolean;
  isArchived: boolean;
  aiEvaluationEnabled: boolean;
  allowedFileTypes: AllowedFileType[] | null;
  lateSubmissionAllowed: boolean;
  maxFileSizeMb: number | null;
  createdAt: string;
  submissionCount?: number;
}

export interface TaskListResult {
  tasks: Task[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export type TaskStatusFilter = "published" | "unpublished" | "archived" | "all";
export type TaskSortBy = "title" | "createdAt" | "dueDate" | "submissionCount";
export type SortDirection = "asc" | "desc";

export interface TaskListParams {
  page: number;
  limit: number;
  search?: string;
  status: TaskStatusFilter;
  classroomId?: number;
  sortBy: TaskSortBy;
  sortDir: SortDirection;
}

export interface TaskFormValues {
  classroomId: number;
  title: string;
  description?: string;
  instructions?: string;
  maxScore: number;
  dueDate?: string;
  taskDate?: string;
  aiEvaluationEnabled: boolean;
  allowedFileTypes: AllowedFileType[];
  lateSubmissionAllowed: boolean;
  maxFileSizeMb?: number;
}
