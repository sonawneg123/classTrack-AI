import type { ReactNode } from "react";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";
import AssignmentTurnedInOutlinedIcon from "@mui/icons-material/AssignmentTurnedInOutlined";
import { ROUTES } from "@utils/constants";
import type { Role } from "@/types/common";

export interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
  /** True for sections whose page hasn't been built yet (future modules). */
  disabled?: boolean;
}

const iconSx = { fontSize: 20 };

export const navConfigByRole: Record<Role, NavItem[]> = {
  admin: [
    { label: "Dashboard",  path: ROUTES.ADMIN.DASHBOARD, icon: <DashboardOutlinedIcon sx={iconSx} /> },
    { label: "Teachers",   path: ROUTES.ADMIN.TEACHERS,  icon: <GroupsOutlinedIcon sx={iconSx} /> },
  ],
  teacher: [
    { label: "Dashboard",       path: ROUTES.TEACHER.DASHBOARD,      icon: <DashboardOutlinedIcon sx={iconSx} /> },
    { label: "My Classrooms",   path: ROUTES.TEACHER.CLASSROOMS,     icon: <MeetingRoomOutlinedIcon sx={iconSx} /> },
    { label: "Assignments",     path: ROUTES.TEACHER.TASKS,          icon: <AssignmentOutlinedIcon sx={iconSx} /> },
    { label: "Grading",         path: ROUTES.TEACHER.CLASSROOMS,     icon: <BarChartOutlinedIcon sx={iconSx} /> },
    { label: "AI Evaluations",  path: ROUTES.TEACHER.EVALUATIONS,    icon: <AutoAwesomeOutlinedIcon sx={iconSx} /> },
    { label: "Knowledge Base",  path: ROUTES.TEACHER.KNOWLEDGE_BASE, icon: <LibraryBooksOutlinedIcon sx={iconSx} /> },
    { label: "Question Bank",   path: ROUTES.TEACHER.QUESTION_BANK,    icon: <QuizOutlinedIcon sx={iconSx} /> },
    { label: "Quiz Assignments", path: ROUTES.TEACHER.QUIZ_ASSIGNMENTS, icon: <AssignmentTurnedInOutlinedIcon sx={iconSx} /> },
    { label: "Quiz Results",    path: ROUTES.TEACHER.QUIZ_RESULTS,     icon: <BarChartOutlinedIcon sx={iconSx} /> },
  ],
  student: [
    { label: "Dashboard",        path: ROUTES.STUDENT.DASHBOARD,        icon: <DashboardOutlinedIcon sx={iconSx} /> },
    { label: "Assignments",      path: ROUTES.STUDENT.ASSIGNMENTS,      icon: <AssignmentOutlinedIcon sx={iconSx} /> },
    { label: "My Quizzes",       path: ROUTES.STUDENT.QUIZ_ASSIGNMENTS, icon: <AssignmentTurnedInOutlinedIcon sx={iconSx} /> },
    { label: "Question Bank",    path: ROUTES.STUDENT.QUESTION_BANK,    icon: <QuizOutlinedIcon sx={iconSx} /> },
    { label: "Practice with AI", path: ROUTES.STUDENT.PRACTICE,         icon: <AutoAwesomeOutlinedIcon sx={iconSx} /> },
    { label: "My Results",       path: ROUTES.STUDENT.QUIZ_RESULTS,     icon: <BarChartOutlinedIcon sx={iconSx} /> },
  ],
};

export const SIDEBAR_WIDTH = 260;
