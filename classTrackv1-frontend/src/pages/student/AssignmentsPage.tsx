/**
 * src/pages/student/AssignmentsPage.tsx
 *
 * Student My Assignments page — notebook-themed redesign.
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
import { DashboardLayout } from "@layouts/DashboardLayout";
import { ErrorBoundary } from "@components/feedback/ErrorBoundary";
import { LoadingSkeleton } from "@components/feedback/LoadingSkeleton";
import { EmptyState } from "@components/feedback/EmptyState";
import { NotebookCard } from "@components/notebook";
import { useMyAssignments } from "@features/student/hooks/useMyAssignments";
import { ROUTES } from "@utils/constants";
import type { StudentAssignment } from "@/types/studentAssignment";

type TabKey = "upcoming" | "submitted" | "pending" | "overdue";

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

function getSubStatusChip(
  status: NonNullable<StudentAssignment["submission_status"]>,
  aiEnabled: number
): { label: string; color: "info" | "success" | "warning" | "error" | "default" } {
  if (status === "submitted" && !aiEnabled) {
    return { label: "Awaiting review", color: "info" };
  }
  const map: Record<
    NonNullable<StudentAssignment["submission_status"]>,
    { label: string; color: "info" | "success" | "warning" | "error" | "default" }
  > = {
    submitted: { label: "Submitted", color: "info" },
    analyzing: { label: "AI Analyzing…", color: "warning" },
    analyzed: { label: "Graded", color: "success" },
    failed: { label: "Analysis Failed", color: "error" },
  };
  return map[status];
}

function formatDate(d: string | null): string {
  if (!d) return "No due date";
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function StudentAssignmentsPage() {
  const [tab, setTab] = useState<TabKey>("upcoming");
  const navigate = useNavigate();
  const { data, isLoading } = useMyAssignments();

  const grouped = useMemo(() => {
    const groups: Record<TabKey, StudentAssignment[]> = {
      upcoming: [],
      submitted: [],
      pending: [],
      overdue: [],
    };
    (data ?? []).forEach((a) => groups[a.assignment_status].push(a));
    return groups;
  }, [data]);

  const activeList = grouped[tab];

  return (
    <DashboardLayout
      title="My Assignments"
      description="Track what's due, submitted, and overdue."
    >
      <ErrorBoundary section="your assignments">
        <NotebookCard disablePadding>
          {/* Tabs header with notebook styling */}
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
              {activeList.map((a) => {
                const subStatus = a.submission_status;
                return (
                  <ListItem key={a.id} disablePadding divider>
                    <ListItemButton
                      onClick={() => navigate(ROUTES.STUDENT.ASSIGNMENT_DETAIL(a.id))}
                      sx={{
                        py: 1.5,
                        pl: 3,
                        // Subtle left border as a "tab" marker for each assignment
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
                            <Chip
                              size="small"
                              label={STATUS_CHIP[a.assignment_status].label}
                              color={STATUS_CHIP[a.assignment_status].color}
                              variant="outlined"
                            />
                            {subStatus && (
                              <Chip
                                size="small"
                                label={getSubStatusChip(subStatus, a.ai_evaluation_enabled).label}
                                color={
                                  getSubStatusChip(subStatus, a.ai_evaluation_enabled).color as
                                    | "info"
                                    | "success"
                                    | "warning"
                                    | "error"
                                    | "default"
                                }
                              />
                            )}
                          </Box>
                        }
                        secondary={
                          <Typography variant="caption" color="text.secondary">
                            Due {formatDate(a.due_date)}
                            {a.effective_score !== null &&
                              ` · Score: ${a.effective_score} / ${a.max_score}`}
                            {a.teacher_score !== null ? " (Teacher)" : ""}
                          </Typography>
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          )}
        </NotebookCard>
      </ErrorBoundary>
    </DashboardLayout>
  );
}
