import type { ReactNode } from "react";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import FeedbackOutlinedIcon from "@mui/icons-material/FeedbackOutlined";
import ScoreboardOutlinedIcon from "@mui/icons-material/ScoreboardOutlined";

export const statIconMap: Record<string, ReactNode> = {
  students: <SchoolOutlinedIcon />,
  teachers: <GroupsOutlinedIcon />,
  classrooms: <MeetingRoomOutlinedIcon />,
  assignments: <AssignmentOutlinedIcon />,
  reviews: <RateReviewOutlinedIcon />,
  ai: <AutoAwesomeOutlinedIcon />,
  pending: <PendingActionsOutlinedIcon />,
  completed: <CheckCircleOutlineIcon />,
  feedback: <FeedbackOutlinedIcon />,
  score: <ScoreboardOutlinedIcon />,
};
