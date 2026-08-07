import type {
  AdminDashboardData,
  NotificationItem,
  StudentDashboardData,
  TeacherDashboardData,
} from "@/types/dashboard";

/**
 * Centralized mock data service.
 *
 * This is the ONLY place dummy dashboard data lives. Every page/hook reads
 * through here instead of inlining fake data locally, so swapping this
 * module out for real `apiClient` calls later (once the backend exposes
 * these endpoints) is a one-file change — the function signatures below
 * are written to look like the real API layer (`authApi`, etc.) on purpose.
 *
 * A small artificial delay is included so loading states (skeletons) are
 * genuinely exercised in the UI rather than resolving instantly.
 */
function delay<T>(value: T, ms = 500): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

const adminDashboardData: AdminDashboardData = {
  stats: [
    { id: "students", label: "Total Students", value: "1,248", trendLabel: "+4.2% this month", trendDirection: "up", color: "primary" },
    { id: "teachers", label: "Total Teachers", value: 86, trendLabel: "+2 this month", trendDirection: "up", color: "secondary" },
    { id: "classrooms", label: "Total Classrooms", value: 54, trendLabel: "No change", trendDirection: "flat", color: "info" },
    { id: "assignments", label: "Active Assignments", value: 312, trendLabel: "+18 this week", trendDirection: "up", color: "success" },
    { id: "reviews", label: "Pending Reviews", value: 47, trendLabel: "-6 since yesterday", trendDirection: "down", color: "warning" },
    { id: "ai", label: "AI Evaluations", value: "2,930", trendLabel: "+310 this week", trendDirection: "up", color: "secondary" },
  ],
  studentGrowth: [
    { label: "Feb", value: 980 },
    { label: "Mar", value: 1020 },
    { label: "Apr", value: 1065 },
    { label: "May", value: 1102 },
    { label: "Jun", value: 1150 },
    { label: "Jul", value: 1248 },
  ],
  assignmentTrends: [
    { label: "Feb", assigned: 210, completed: 178 },
    { label: "Mar", assigned: 245, completed: 201 },
    { label: "Apr", assigned: 260, completed: 233 },
    { label: "May", assigned: 288, completed: 250 },
    { label: "Jun", assigned: 300, completed: 271 },
    { label: "Jul", assigned: 312, completed: 264 },
  ],
  submissionStats: [
    { label: "On time", value: 68 },
    { label: "Late", value: 22 },
    { label: "Missing", value: 10 },
  ],
};

const teacherDashboardData: TeacherDashboardData = {
  stats: [
    { id: "classrooms", label: "My Classrooms", value: 5, trendLabel: "Across 3 grades", color: "primary" },
    { id: "assignments", label: "Assignments", value: 34, trendLabel: "+3 this week", trendDirection: "up", color: "secondary" },
    { id: "reviews", label: "Pending Reviews", value: 12, trendLabel: "4 due today", trendDirection: "flat", color: "warning" },
    { id: "ai", label: "AI Evaluations", value: 289, trendLabel: "+41 this week", trendDirection: "up", color: "info" },
  ],
  upcomingDeadlines: [
    { id: "d1", title: "Algebra II — Problem Set 7", context: "Grade 10A", dueDate: "Tomorrow, 11:59 PM" },
    { id: "d2", title: "Lab Report — Photosynthesis", context: "Grade 9B Biology", dueDate: "Wed, Jul 29" },
    { id: "d3", title: "Essay Draft — Civil Rights Era", context: "Grade 11 History", dueDate: "Fri, Jul 31" },
  ],
  recentSubmissions: [
    { id: "s1", studentName: "Ava Thompson", assignment: "Problem Set 7", submittedAt: "10 min ago", status: "On time" },
    { id: "s2", studentName: "Marcus Lee", assignment: "Lab Report", submittedAt: "1 hr ago", status: "Late" },
    { id: "s3", studentName: "Priya Nair", assignment: "Essay Draft", submittedAt: "3 hr ago", status: "On time" },
    { id: "s4", studentName: "Diego Ramirez", assignment: "Problem Set 7", submittedAt: "5 hr ago", status: "Missing" },
  ],
  studentPerformance: [
    { id: "p1", studentName: "Ava Thompson", averageScore: 94, trendDirection: "up" },
    { id: "p2", studentName: "Marcus Lee", averageScore: 76, trendDirection: "down" },
    { id: "p3", studentName: "Priya Nair", averageScore: 88, trendDirection: "flat" },
    { id: "p4", studentName: "Diego Ramirez", averageScore: 62, trendDirection: "down" },
  ],
};

const studentDashboardData: StudentDashboardData = {
  stats: [
    { id: "pending", label: "Pending Assignments", value: 4, trendLabel: "1 due today", trendDirection: "flat", color: "warning" },
    { id: "completed", label: "Completed Assignments", value: 58, trendLabel: "+6 this month", trendDirection: "up", color: "success" },
    { id: "feedback", label: "AI Feedback Received", value: 41, trendLabel: "+9 this month", trendDirection: "up", color: "secondary" },
    { id: "score", label: "Average Score", value: "87%", trendLabel: "+3% this term", trendDirection: "up", color: "primary" },
  ],
  upcomingDeadlines: [
    { id: "d1", title: "Algebra II — Problem Set 7", context: "Math", dueDate: "Tomorrow, 11:59 PM" },
    { id: "d2", title: "Lab Report — Photosynthesis", context: "Biology", dueDate: "Wed, Jul 29" },
    { id: "d3", title: "Reading Response — Ch. 12", context: "English", dueDate: "Thu, Jul 30" },
  ],
  recentReports: [
    { id: "r1", title: "Term Progress Report — July", generatedAt: "2 days ago", summary: "Strong improvement in Math and Biology; Writing needs focus." },
    { id: "r2", title: "AI Evaluation — Problem Set 6", generatedAt: "5 days ago", summary: "8/10 correct. Review quadratic factoring in Q4 and Q7." },
  ],
  teacherComments: [
    { id: "c1", teacherName: "Ms. Carter", assignment: "Lab Report — Photosynthesis", comment: "Great data analysis — tighten your conclusion next time.", date: "1 day ago" },
    { id: "c2", teacherName: "Mr. Ibrahim", assignment: "Problem Set 6", comment: "Solid work overall. Watch your sign errors in factoring.", date: "4 days ago" },
  ],
};

const notifications: NotificationItem[] = [
  { id: "n1", title: "AI evaluation complete", description: "12 submissions for Problem Set 7 have been scored.", createdAt: "10 min ago", read: false },
  { id: "n2", title: "New assignment posted", description: "Lab Report — Photosynthesis is now open.", createdAt: "2 hr ago", read: false },
  { id: "n3", title: "System maintenance", description: "Scheduled maintenance Sunday, 2:00–3:00 AM.", createdAt: "1 day ago", read: true },
];

export const mockDashboardService = {
  getAdminDashboard: () => delay(adminDashboardData),
  getTeacherDashboard: () => delay(teacherDashboardData),
  getStudentDashboard: () => delay(studentDashboardData),
  getNotifications: () => delay(notifications, 300),
};
