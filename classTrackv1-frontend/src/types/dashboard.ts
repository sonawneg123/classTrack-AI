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
