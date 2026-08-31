export type TrendDirection = "up" | "down" | "flat";
export type StatColor = "primary" | "secondary" | "success" | "warning" | "error" | "info";

export interface StatDatum {
  id: string;
  label: string;
  value: string | number;
  trendLabel?: string;
  trendDirection?: TrendDirection;
  color?: StatColor;
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface AssignmentTrendPoint {
  label: string;
  assigned: number;
  completed: number;
}

export interface SubmissionStatDatum {
  label: string;
  value: number;
}

export interface AdminDashboardData {
  stats: StatDatum[];
  studentGrowth: ChartPoint[];
  assignmentTrends: AssignmentTrendPoint[];
  submissionStats: SubmissionStatDatum[];
}

// ── Admin Dashboard API types ─────────────────────────────────────────────────

export interface AdminDashboardClassroom {
  id: number;
  name: string;
  subject: string | null;
  section: string | null;
  classCode: string;
  isActive: boolean;
  createdAt: string;
  teacherId: number;
  teacherName: string;
  teacherActive: boolean;
  studentCount: number;
  taskCount: number;
}

export interface AdminDashboardActivityItem {
  id: number;
  actorType: string;
  actorId: number | null;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: number | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminDashboardAlert {
  type: string;
  message: string;
  count: number;
}

export interface AdminDashboardApiData {
  overview: {
    students: number;
    teachers: number;
    classrooms: number;
    assignments: number;
    submissions: number;
  };
  teachers: {
    total: number;
    active: number;
    inactive: number;
    unassigned: number;
  };
  students: {
    total: number;
    active: number;
    inactive: number;
  };
  classrooms: {
    total: number;
    active: number;
    inactive: number;
  };
  evaluations: {
    pending: number;
    analyzing: number;
    completed: number;
    failed: number;
  };
  classroomList: AdminDashboardClassroom[];
  activity: AdminDashboardActivityItem[];
  alerts: AdminDashboardAlert[];
}

export interface DeadlineItem {
  id: string;
  title: string;
  context: string;
  dueDate: string;
}

export interface SubmissionItem {
  id: string;
  studentName: string;
  assignment: string;
  submittedAt: string;
  status: "On time" | "Late" | "Missing";
}

export interface StudentPerformanceItem {
  id: string;
  studentName: string;
  averageScore: number;
  trendDirection: TrendDirection;
}

export interface TeacherDashboardData {
  stats: StatDatum[];
  upcomingDeadlines: DeadlineItem[];
  recentSubmissions: SubmissionItem[];
  studentPerformance: StudentPerformanceItem[];
}

export interface ReportItem {
  id: string;
  title: string;
  generatedAt: string;
  summary: string;
}

export interface TeacherCommentItem {
  id: string;
  teacherName: string;
  assignment: string;
  comment: string;
  date: string;
}

export interface StudentDashboardData {
  stats: StatDatum[];
  upcomingDeadlines: DeadlineItem[];
  recentReports: ReportItem[];
  teacherComments: TeacherCommentItem[];
}

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  read: boolean;
}
