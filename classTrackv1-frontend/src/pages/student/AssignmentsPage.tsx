/**
 * src/pages/student/AssignmentsPage.tsx
 *
 * Student My Assignments page — unified view showing BOTH:
 *   - File-submission Tasks  (type = 'task')
 *   - Quiz Assignments       (type = 'quiz')
 *
 * Each item is visually type-distinguishable via a type badge.
 * Task items navigate to the assignment detail page.
 * Quiz items navigate to TakeQuizPage.
 *
 * Data is fetched via useMyUnifiedAssignments() which calls both
 *   GET /student/tasks
 *   GET /student/quiz-assignments
 * in parallel and merges them.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Chip,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { ErrorBoundary } from "@components/feedback/ErrorBoundary";
import { LoadingSkeleton } from "@components/feedback/LoadingSkeleton";
import { EmptyState } from "@components/feedback/EmptyState";
import { NotebookCard } from "@components/notebook";
import { useMyUnifiedAssignments } from "@features/student/hooks/useMyUnifiedAssignments";
import { ROUTES } from "@utils/constants";
import type { UnifiedAssignment, UnifiedAssignmentStatus } from "@/types/unifiedAssignment";

type TabKey = UnifiedAssignmentStatus;

const TABS: { key: TabKey; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "submitted", label: "Submitted" },
  { key: "pending", label: "Pending" },
  { key: "overdue", label: "Overdue" },
];

const STATUS_CHIP: Record<TabKey, { label: string; color: "info" | "success" | "warning" | "error" }> = {
  upcoming: { label: "Upcoming", color: "info" },
  submitted: { label: "Submitted", color: "success" },
  pending: { label: "Pending", color: "warning" },
  overdue: { label: "Overdue", color: "error" },
};

function formatDate(d: string | null): string {
  if (!d) return "No due date";
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function AssignmentTypeChip({ type }: { type: "task" | "quiz" }) {
  if (type === "quiz") {
    return (
      <Chip
        icon={<QuizOutlinedIcon sx={{ fontSize: "14px !important" }} />}
        label="Quiz"
        size="small"
        color="secondary"
        variant="outlined"
        sx={{ fontSize: 11 }}
      />
    );
  }
  return (
    <Chip
      icon={<AssignmentOutlinedIcon sx={{ fontSize: "14px !important" }} />}
      label="Task"
      size="small"
      color="default"
      variant="outlined"
      sx={{ fontSize: 11 }}
    />
  );
}

function getSecondaryText(item: UnifiedAssignment): string {
  const dueStr = `Due ${formatDate(item.due_date)}`;

  if (item.type === "quiz") {
    const scoreStr =
      item.attempt_status === "submitted" &&
      item.attempt_score != null &&
      item.attempt_max_score != null
        ? ` · Score: ${Number(item.attempt_score)} / ${Number(item.attempt_max_score)}`
        : "";
    const classStr = item.classroom_name ? ` · ${item.classroom_name}` : "";
    return `${dueStr}${classStr}${scoreStr}`;
  }

  // task
  const scoreStr =
    item.effective_score !== null
      ? ` · Score: ${item.effective_score} / ${item.max_score}`
      : "";
  const teacherStr = item.teacher_score !== null ? " (Teacher)" : "";
  return `${dueStr}${scoreStr}${teacherStr}`;
}

export default function StudentAssignmentsPage() {
  const [tab, setTab] = useState<TabKey>("upcoming");
  const navigate = useNavigate();
  const { data, isLoading } = useMyUnifiedAssignments();

  const grouped = useMemo(() => {
    const groups: Record<TabKey, UnifiedAssignment[]> = {
      upcoming: [],
      submitted: [],
      pending: [],
      overdue: [],
    };
    data.forEach((a) => groups[a.assignment_status].push(a));
    return groups;
  }, [data]);

  const activeList = grouped[tab];

  const handleClick = (item: UnifiedAssignment) => {
    if (item.type === "quiz") {
      navigate(ROUTES.STUDENT.TAKE_QUIZ(item.id));
    } else {
      navigate(ROUTES.STUDENT.ASSIGNMENT_DETAIL(item.id));
    }
  };

  return (
    <DashboardLayout
      title="My Assignments"
      description="Track what's due, submitted, and overdue — tasks and quizzes in one place."
    >
      <ErrorBoundary section="your assignments">
        <NotebookCard disablePadding>
          {/* Tabs header */}
          <Box
            sx={{
              borderBottom: "2px solid",
              borderColor: "divider",
              px: 2,
              pt: 0.5,
              bgcolor: "background.paper",
            }}
          >
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              variant="scrollable"
              scrollButtons="auto"
              TabIndicatorProps={{
                style: { height: 3, borderRadius: "3px 3px 0 0" },
              }}
            >
              {TABS.map((t) => (
                <Tab
                  key={t.key}
                  value={t.key}
                  label={`${t.label} (${grouped[t.key].length})`}
                  sx={{ fontWeight: 600, minHeight: 48 }}
                />
              ))}
            </Tabs>
          </Box>

          {isLoading ? (
            <LoadingSkeleton variant="list" rows={4} />
          ) : activeList.length === 0 ? (
            <EmptyState
              icon={<AssignmentOutlinedIcon fontSize="inherit" />}
              title={`No ${tab} assignments`}
              description="Check back later or switch tabs to see other assignments."
            />
          ) : (
            <List disablePadding>
              {activeList.map((a) => (
                <ListItem key={`${a.type}-${a.id}`} disablePadding divider>
                  <ListItemButton
                    onClick={() => handleClick(a)}
                    sx={{
                      py: 1.5,
                      pl: 3,
                      borderLeft: "3px solid transparent",
                      "&:hover": {
                        borderLeftColor: "primary.main",
                        bgcolor: "action.hover",
                      },
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            flexWrap: "wrap",
                          }}
                        >
                          <Typography variant="body2" fontWeight={600}>
                            {a.title}
                          </Typography>

                          {/* Type badge — Task vs Quiz */}
                          <AssignmentTypeChip type={a.type} />

                          {/* Status badge */}
                          <Chip
                            size="small"
                            label={STATUS_CHIP[a.assignment_status].label}
                            color={STATUS_CHIP[a.assignment_status].color}
                            variant="outlined"
                          />

                          {/* Quiz-specific: attempt status chip */}
                          {a.type === "quiz" && a.attempt_status && (
                            <Chip
                              size="small"
                              label={
                                a.attempt_status === "in_progress"
                                  ? "In Progress"
                                  : "Submitted"
                              }
                              color={
                                a.attempt_status === "in_progress"
                                  ? "info"
                                  : "success"
                              }
                            />
                          )}

                          {/* Task-specific: submission status chip */}
                          {a.type === "task" && a.submission_status && (
                            <Chip
                              size="small"
                              label={
                                a.submission_status === "analyzing"
                                  ? "AI Analyzing…"
                                  : a.submission_status === "analyzed"
                                  ? "Graded"
                                  : a.submission_status === "failed"
                                  ? "Analysis Failed"
                                  : "Submitted"
                              }
                              color={
                                a.submission_status === "analyzed"
                                  ? "success"
                                  : a.submission_status === "analyzing"
                                  ? "warning"
                                  : a.submission_status === "failed"
                                  ? "error"
                                  : "info"
                              }
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {getSecondaryText(a)}
                        </Typography>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </NotebookCard>
      </ErrorBoundary>
    </DashboardLayout>
  );
}
