export interface Classroom {
  id: number;
  name: string;
  subject: string | null;
  section: string | null;
  classCode: string;
  isActive: boolean;
  createdAt: string;
  studentCount: number;
  taskCount: number;
  latestActivityAt?: string | null;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ClassroomListResult {
  classrooms: Classroom[];
  pagination: PaginationMeta;
}

export type ClassroomStatusFilter = "active" | "archived" | "all";
export type ClassroomSortBy = "name" | "createdAt" | "studentCount" | "taskCount";
export type SortDirection = "asc" | "desc";

export interface ClassroomListParams {
  page: number;
  limit: number;
  search?: string;
  status: ClassroomStatusFilter;
  sortBy: ClassroomSortBy;
  sortDir: SortDirection;
}

export interface ClassroomFormValues {
  name: string;
  subject?: string;
  section?: string;
}

export interface RecentActivityItem {
  type: "task_posted" | "submission_received";
  id: number;
  label: string;
  classroom_name: string;
  occurred_at: string;
}

export interface TeacherDashboardStats {
  totalClassrooms: number;
  totalStudents: number;
  activeAssignments: number;
  pendingEvaluations: number;
  recentActivity: RecentActivityItem[];
}
