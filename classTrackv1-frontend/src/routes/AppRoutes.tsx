import { Routes, Route } from "react-router-dom";
import HomePage from "@pages/HomePage";
import NotFoundPage from "@pages/NotFoundPage";
import ProfilePage from "@pages/account/ProfilePage";
import LoginPage from "@pages/auth/LoginPage";
import StudentRegisterPage from "@pages/auth/StudentRegisterPage";
import TeacherRegisterPage from "@pages/auth/TeacherRegisterPage";
import ForgotPasswordPage from "@pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "@pages/auth/ResetPasswordPage";
import VerifyEmailPage from "@pages/auth/VerifyEmailPage";
import UnauthorizedPage from "@pages/UnauthorizedPage";
import ForbiddenPage from "@pages/ForbiddenPage";
import AdminDashboardPage from "@pages/admin/DashboardPage";
import AdminTeachersPage from "@pages/admin/TeachersPage";
import TeacherDashboardPage from "@pages/teacher/DashboardPage";
import TeacherClassroomsPage from "@pages/teacher/ClassroomsPage";
import TeacherTasksPage from "@pages/teacher/TasksPage";
import TeacherGradingOverviewPage from "@pages/teacher/GradingOverviewPage";
import PendingEvaluationsPage from "@pages/teacher/PendingEvaluationsPage";
import TaskSubmissionsPage from "@pages/teacher/TaskSubmissionsPage";
import SubmissionDetailPage from "@pages/teacher/SubmissionDetailPage";
import KnowledgeBasePage from "@pages/teacher/KnowledgeBasePage";
import TeacherQuestionBankPage from "@pages/teacher/QuestionBankPage";
import TeacherQuizResultsPage from "@pages/teacher/QuizResultsPage";
import TeacherQuizAssignmentsPage from "@pages/teacher/QuizAssignmentsPage";
import TeacherQuizAssignmentDetailPage from "@pages/teacher/QuizAssignmentDetailPage";
import StudentDashboardPage from "@pages/student/DashboardPage";
import StudentAssignmentsPage from "@pages/student/AssignmentsPage";
import StudentAssignmentDetailPage from "@pages/student/AssignmentDetailPage";
import StudentQuestionBankPage from "@pages/student/QuestionBankPage";
import StudentQuizResultsPage from "@pages/student/QuizResultsPage";
import StudentPracticePage from "@pages/student/PracticePage";
import StudentQuizAssignmentsPage from "@pages/student/QuizAssignmentsPage";
import TakeQuizPage from "@pages/student/TakeQuizPage";
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
      <Route path={ROUTES.STUDENT_REGISTER} element={<StudentRegisterPage />} />
      <Route path={ROUTES.TEACHER_REGISTER} element={<TeacherRegisterPage />} />
      <Route path={ROUTES.FORGOT_PASSWORD} element={<ForgotPasswordPage />} />
      <Route path={ROUTES.RESET_PASSWORD} element={<ResetPasswordPage />} />
      <Route path={ROUTES.VERIFY_EMAIL} element={<VerifyEmailPage />} />
      <Route path={ROUTES.UNAUTHORIZED} element={<UnauthorizedPage />} />
      <Route path={ROUTES.FORBIDDEN} element={<ForbiddenPage />} />

      <Route element={<ProtectedRoute />}>
        {/* Profile — accessible by all authenticated roles */}
        <Route path={ROUTES.ACCOUNT.PROFILE} element={<ProfilePage />} />

        <Route element={<RoleRoute allowedRoles={["admin"]} />}>
          <Route path={ROUTES.ADMIN.DASHBOARD} element={<AdminDashboardPage />} />
          <Route path={ROUTES.ADMIN.TEACHERS} element={<AdminTeachersPage />} />
          <Route path={ROUTES.ADMIN.REGISTRATION_CODES} element={<AdminTeachersPage />} />
        </Route>

        <Route element={<RoleRoute allowedRoles={["teacher"]} />}>
          <Route path={ROUTES.TEACHER.DASHBOARD} element={<TeacherDashboardPage />} />
          <Route path={ROUTES.TEACHER.CLASSROOMS} element={<TeacherClassroomsPage />} />
          <Route path={ROUTES.TEACHER.TASKS} element={<TeacherTasksPage />} />
          <Route path={ROUTES.TEACHER.EVALUATIONS} element={<PendingEvaluationsPage />} />
          <Route path="/teacher/classrooms/:classroomId/grading" element={<TeacherGradingOverviewPage />} />
          <Route path="/teacher/tasks/:taskId/submissions" element={<TaskSubmissionsPage />} />
          <Route path="/teacher/submissions/:submissionId" element={<SubmissionDetailPage />} />
          <Route path={ROUTES.TEACHER.KNOWLEDGE_BASE} element={<KnowledgeBasePage />} />
          <Route path={ROUTES.TEACHER.QUESTION_BANK} element={<TeacherQuestionBankPage />} />
          <Route path={ROUTES.TEACHER.QUIZ_RESULTS} element={<TeacherQuizResultsPage />} />
          <Route path={ROUTES.TEACHER.QUIZ_ASSIGNMENTS} element={<TeacherQuizAssignmentsPage />} />
          <Route path="/teacher/quiz-assignments/:quizId" element={<TeacherQuizAssignmentDetailPage />} />
        </Route>

        <Route element={<RoleRoute allowedRoles={["student"]} />}>
          <Route path={ROUTES.STUDENT.DASHBOARD} element={<StudentDashboardPage />} />
          <Route path={ROUTES.STUDENT.ASSIGNMENTS} element={<StudentAssignmentsPage />} />
          <Route path="/student/assignments/:taskId" element={<StudentAssignmentDetailPage />} />
          <Route path={ROUTES.STUDENT.QUESTION_BANK} element={<StudentQuestionBankPage />} />
          <Route path={ROUTES.STUDENT.QUIZ_RESULTS} element={<StudentQuizResultsPage />} />
          <Route path={ROUTES.STUDENT.PRACTICE} element={<StudentPracticePage />} />
          <Route path={ROUTES.STUDENT.QUIZ_ASSIGNMENTS} element={<StudentQuizAssignmentsPage />} />
          <Route path="/student/quiz-assignments/:quizId" element={<TakeQuizPage />} />
        </Route>
      </Route>

      <Route path={ROUTES.NOT_FOUND} element={<NotFoundPage />} />
    </Routes>
  );
}
