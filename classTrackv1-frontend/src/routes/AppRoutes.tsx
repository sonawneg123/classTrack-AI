import { Routes, Route } from "react-router-dom";
import HomePage from "@pages/HomePage";
import NotFoundPage from "@pages/NotFoundPage";
import LoginPage from "@pages/auth/LoginPage";
import UnauthorizedPage from "@pages/UnauthorizedPage";
import ForbiddenPage from "@pages/ForbiddenPage";
import AdminDashboardPage from "@pages/admin/DashboardPage";
import TeacherDashboardPage from "@pages/teacher/DashboardPage";
import TeacherClassroomsPage from "@pages/teacher/ClassroomsPage";
import TeacherTasksPage from "@pages/teacher/TasksPage";
import TeacherGradingOverviewPage from "@pages/teacher/GradingOverviewPage";
import PendingEvaluationsPage from "@pages/teacher/PendingEvaluationsPage";
import TaskSubmissionsPage from "@pages/teacher/TaskSubmissionsPage";
import SubmissionDetailPage from "@pages/teacher/SubmissionDetailPage";
import StudentDashboardPage from "@pages/student/DashboardPage";
import StudentAssignmentsPage from "@pages/student/AssignmentsPage";
import StudentAssignmentDetailPage from "@pages/student/AssignmentDetailPage";
import { ProtectedRoute } from "./ProtectedRoute";
import { RoleRoute } from "./RoleRoute";
import { ROUTES } from "@utils/constants";

/**
 * Route table for the application.
 *
 * Module 2 adds authentication + role-based routing:
 *   - Public: /, /login, /unauthorized, /forbidden
 *   - <ProtectedRoute> requires a valid session (redirects to /login)
 *   - <RoleRoute allowedRoles={...}> further restricts by role
 *     (redirects to /forbidden)
 *
 * Module 4 will replace the placeholder dashboard pages with full
 * role-specific layouts (nav + sidebar + breadcrumb from Module 3).
 */
export default function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.ROOT} element={<HomePage />} />
      <Route path={ROUTES.LOGIN} element={<LoginPage />} />
      <Route path={ROUTES.UNAUTHORIZED} element={<UnauthorizedPage />} />
      <Route path={ROUTES.FORBIDDEN} element={<ForbiddenPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<RoleRoute allowedRoles={["admin"]} />}>
          <Route path={ROUTES.ADMIN.DASHBOARD} element={<AdminDashboardPage />} />
        </Route>

        <Route element={<RoleRoute allowedRoles={["teacher"]} />}>
          <Route path={ROUTES.TEACHER.DASHBOARD} element={<TeacherDashboardPage />} />
          <Route path={ROUTES.TEACHER.CLASSROOMS} element={<TeacherClassroomsPage />} />
          <Route path={ROUTES.TEACHER.TASKS} element={<TeacherTasksPage />} />
          <Route path={ROUTES.TEACHER.EVALUATIONS} element={<PendingEvaluationsPage />} />
          <Route path="/teacher/classrooms/:classroomId/grading" element={<TeacherGradingOverviewPage />} />
          <Route path="/teacher/tasks/:taskId/submissions" element={<TaskSubmissionsPage />} />
          <Route path="/teacher/submissions/:submissionId" element={<SubmissionDetailPage />} />
        </Route>

        <Route element={<RoleRoute allowedRoles={["student"]} />}>
          <Route path={ROUTES.STUDENT.DASHBOARD} element={<StudentDashboardPage />} />
          <Route path={ROUTES.STUDENT.ASSIGNMENTS} element={<StudentAssignmentsPage />} />
          <Route path="/student/assignments/:taskId" element={<StudentAssignmentDetailPage />} />
        </Route>
      </Route>

      <Route path={ROUTES.NOT_FOUND} element={<NotFoundPage />} />
    </Routes>
  );
}
