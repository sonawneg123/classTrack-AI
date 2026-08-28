import type { ReactNode } from "react";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
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
    { label: "Dashboard", path: ROUTES.ADMIN.DASHBOARD, icon: <DashboardOutlinedIcon sx={iconSx} /> },
    { label: "Teachers", path: ROUTES.ADMIN.DASHBOARD, icon: <GroupsOutlinedIcon sx={iconSx} />, disabled: true },
    { label: "Students", path: ROUTES.ADMIN.DASHBOARD, icon: <SchoolOutlinedIcon sx={iconSx} />, disabled: true },
    { label: "Classrooms", path: ROUTES.ADMIN.DASHBOARD, icon: <MeetingRoomOutlinedIcon sx={iconSx} />, disabled: true },
    { label: "Reports", path: ROUTES.ADMIN.DASHBOARD, icon: <InsertDriveFileOutlinedIcon sx={iconSx} />, disabled: true },
  ],
  teacher: [
    { label: "Dashboard",       path: ROUTES.TEACHER.DASHBOARD,     icon: <DashboardOutlinedIcon sx={iconSx} /> },
    { label: "My Classrooms",   path: ROUTES.TEACHER.CLASSROOMS,    icon: <MeetingRoomOutlinedIcon sx={iconSx} /> },
    { label: "Assignments",     path: ROUTES.TEACHER.TASKS,         icon: <AssignmentOutlinedIcon sx={iconSx} /> },
    { label: "Grading",         path: ROUTES.TEACHER.CLASSROOMS,    icon: <BarChartOutlinedIcon sx={iconSx} /> },
    { label: "AI Evaluations",  path: ROUTES.TEACHER.EVALUATIONS,   icon: <AutoAwesomeOutlinedIcon sx={iconSx} /> },
    { label: "Knowledge Base",  path: ROUTES.TEACHER.KNOWLEDGE_BASE, icon: <LibraryBooksOutlinedIcon sx={iconSx} /> },
  ],
  student: [
    { label: "Dashboard", path: ROUTES.STUDENT.DASHBOARD, icon: <DashboardOutlinedIcon sx={iconSx} /> },
    { label: "Assignments", path: ROUTES.STUDENT.ASSIGNMENTS, icon: <AssignmentOutlinedIcon sx={iconSx} /> },
  ],
};

export const SIDEBAR_WIDTH = 260;
