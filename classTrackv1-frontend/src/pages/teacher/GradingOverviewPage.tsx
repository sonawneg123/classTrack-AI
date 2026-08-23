import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Chip,
  Grid,
  LinearProgress,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { DashboardCard } from "@components/cards/DashboardCard";
import { StatCard } from "@components/cards/StatCard";
import { LoadingSkeleton } from "@components/feedback/LoadingSkeleton";
import { EmptyState } from "@components/feedback/EmptyState";
import { ErrorBoundary } from "@components/feedback/ErrorBoundary";
import { useGradingOverview } from "@features/teacher/hooks/useGradingOverview";
import { ROUTES } from "@utils/constants";
import type { GradingTaskRow, GradingStudentRow } from "@/types/grading";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreLabel(score: number | null, maxScore?: number): string {
  if (score === null || score === undefined) return "—";
  if (maxScore !== undefined) return `${score.toFixed(1)} / ${maxScore}`;
  return score.toFixed(1);
}

function completionColor(pct: number): "success" | "warning" | "error" | "default" {
  if (pct >= 75) return "success";
  if (pct >= 40) return "warning";
  if (pct > 0) return "error";
  return "default";
}

function statusChip(submitted: number, evaluated: number, pending: number) {
  if (submitted === 0)
    return <Chip label="Not submitted" size="small" variant="outlined" color="default" />;
  if (evaluated > 0 && pending === 0)
    return <Chip label="Evaluated" size="small" color="success" />;
  if (pending > 0)
    return <Chip label="Pending" size="small" color="warning" />;
  return <Chip label="Submitted" size="small" color="info" />;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TasksTab({ tasks }: { tasks: GradingTaskRow[] }) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<AssignmentOutlinedIcon fontSize="inherit" />}
        title="No assignments yet"
        description="Create an assignment for this classroom to see per-task grading data."
      />
    );
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Assignment</TableCell>
            <TableCell>Due date</TableCell>
            <TableCell align="center">Max score</TableCell>
            <TableCell align="center">Submitted</TableCell>
            <TableCell align="center">Evaluated</TableCell>
            <TableCell align="center">Pending</TableCell>
            <TableCell align="center">Avg score</TableCell>
            <TableCell align="center">Completion</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tasks.map((task) => (
            <TableRow key={task.taskId} hover>
              <TableCell>
                <Stack spacing={0.25}>
                  <Typography variant="body2" fontWeight={600}>
                    {task.title}
                  </Typography>
                  <Stack direction="row" spacing={0.5}>
                    {!task.isPublished && (
                      <Chip label="Unpublished" size="small" variant="outlined" />
                    )}
                    {task.isArchived && (
                      <Chip label="Archived" size="small" variant="outlined" color="default" />
                    )}
                  </Stack>
                </Stack>
              </TableCell>
              <TableCell>
                {task.dueDate
                  ? new Date(task.dueDate).toLocaleDateString()
                  : <Typography variant="body2" color="text.secondary">—</Typography>
                }
              </TableCell>
              <TableCell align="center">{task.maxScore}</TableCell>
              <TableCell align="center">
                {task.submittedCount}
                <Typography variant="caption" color="text.secondary">
                  /{task.studentCount}
                </Typography>
              </TableCell>
              <TableCell align="center">{task.evaluatedCount}</TableCell>
              <TableCell align="center">
                {task.pendingCount > 0 ? (
                  <Chip label={task.pendingCount} size="small" color="warning" />
                ) : (
                  task.pendingCount
                )}
              </TableCell>
              <TableCell align="center">
                {task.avgScore !== null ? (
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    color={
                      task.maxScore
                        ? (task.avgScore / task.maxScore) >= 0.75
                          ? "success.main"
                          : (task.avgScore / task.maxScore) >= 0.5
                          ? "warning.main"
                          : "error.main"
                        : "text.primary"
                    }
                  >
                    {scoreLabel(task.avgScore, task.maxScore)}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary">—</Typography>
                )}
              </TableCell>
              <TableCell align="center">
                <Tooltip title={`${task.completionPct}% submitted`}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 80 }}>
                    <LinearProgress
                      variant="determinate"
                      value={task.completionPct}
                      sx={{ flex: 1, height: 6, borderRadius: 3 }}
                      color={completionColor(task.completionPct)}
                    />
                    <Typography variant="caption" sx={{ whiteSpace: "nowrap" }}>
                      {task.completionPct}%
                    </Typography>
                  </Box>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function StudentsTab({ students, taskCount }: { students: GradingStudentRow[]; taskCount: number }) {
  if (students.length === 0) {
    return (
      <EmptyState
        icon={<PeopleOutlinedIcon fontSize="inherit" />}
        title="No students enrolled"
        description="Students join this classroom using the class code."
      />
    );
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Student</TableCell>
            <TableCell>Username</TableCell>
            <TableCell align="center">Submitted</TableCell>
            <TableCell align="center">Evaluated</TableCell>
            <TableCell align="center">Pending</TableCell>
            <TableCell align="center">Avg score</TableCell>
            <TableCell align="center">Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {students.map((student) => (
            <TableRow key={student.studentId} hover>
              <TableCell>
                <Typography variant="body2" fontWeight={600}>
                  {student.name}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                  {student.username}
                </Typography>
              </TableCell>
              <TableCell align="center">
                {student.submittedCount}
                <Typography variant="caption" color="text.secondary">
                  /{taskCount}
                </Typography>
              </TableCell>
              <TableCell align="center">{student.evaluatedCount}</TableCell>
              <TableCell align="center">
                {student.pendingCount > 0 ? (
                  <Chip label={student.pendingCount} size="small" color="warning" />
                ) : (
                  student.pendingCount
                )}
              </TableCell>
              <TableCell align="center">
                {student.avgScore !== null ? (
                  <Typography variant="body2" fontWeight={600}>
                    {scoreLabel(student.avgScore)}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary">—</Typography>
                )}
              </TableCell>
              <TableCell align="center">
                {statusChip(student.submittedCount, student.evaluatedCount, student.pendingCount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function GradingOverviewPage() {
  const { classroomId } = useParams<{ classroomId: string }>();
  const parsedId = classroomId ? parseInt(classroomId, 10) : undefined;
  const [activeTab, setActiveTab] = useState(0);

  const { data, isLoading, isError, error } = useGradingOverview(parsedId);

  const crumbs = [
    { label: "Dashboard", href: ROUTES.TEACHER.DASHBOARD },
    { label: "Classrooms", href: ROUTES.TEACHER.CLASSROOMS },
    { label: data?.summary.classroomName ?? "Grading overview" },
  ];

  return (
    <DashboardLayout
      title={data?.summary.classroomName ? `${data.summary.classroomName} — Grading` : "Grading Overview"}
      description={
        data?.summary
          ? [data.summary.subject, data.summary.section].filter(Boolean).join(" · ") ||
            "Classroom grading summary"
          : "Classroom grading summary"
      }
      breadcrumbs={crumbs}
    >
      <ErrorBoundary section="grading overview">
        {/* ── Error state ─────────────────────────────────────────────── */}
        {isError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {(error as Error)?.message ?? "Failed to load grading overview."}
          </Alert>
        )}

        {/* ── Archived classroom notice ────────────────────────────────── */}
        {data && !data.summary.isActive && (
          <Alert severity="info" sx={{ mb: 3 }}>
            This classroom is <strong>archived</strong>. Grading data is shown read-only.
          </Alert>
        )}

        {/* ── Summary stat cards ───────────────────────────────────────── */}
        {isLoading ? (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
                <DashboardCard>
                  <LoadingSkeleton variant="card" />
                </DashboardCard>
              </Grid>
            ))}
          </Grid>
        ) : data ? (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
              <StatCard
                label="Students"
                value={data.summary.studentCount}
                icon={<PeopleOutlinedIcon />}
                color="primary"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
              <StatCard
                label="Assignments"
                value={data.summary.taskCount}
                icon={<AssignmentOutlinedIcon />}
                color="secondary"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
              <StatCard
                label="Total submissions"
                value={data.summary.totalSubmissions}
                icon={<AssignmentOutlinedIcon />}
                color="info"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
              <StatCard
                label="Evaluated"
                value={data.summary.evaluatedCount}
                icon={<CheckCircleOutlineIcon />}
                color="success"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
              <StatCard
                label="Pending review"
                value={data.summary.pendingCount}
                icon={<HourglassEmptyOutlinedIcon />}
                color={data.summary.pendingCount > 0 ? "warning" : "success"}
              />
            </Grid>
          </Grid>
        ) : null}

        {/* ── Avg score card (shown separately so it's prominent) ──────── */}
        {data && (
          <DashboardCard
            title="Average score"
            subtitle="Based on evaluated submissions (teacher score overrides AI score)"
            sx={{ mb: 3 }}
          >
            <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 1 }}>
              <BarChartOutlinedIcon color="action" />
              <Typography variant="h4" fontWeight={700}>
                {data.summary.avgScore !== null
                  ? `${data.summary.avgScore}`
                  : "—"}
              </Typography>
              {data.summary.avgScore !== null && (
                <Typography variant="body2" color="text.secondary">
                  (no max score — varies per assignment)
                </Typography>
              )}
              {data.summary.avgScore === null && (
                <Typography variant="body2" color="text.secondary">
                  No evaluated submissions yet
                </Typography>
              )}
            </Stack>
          </DashboardCard>
        )}

        {/* ── Tabs: By Assignment / By Student ────────────────────────── */}
        <DashboardCard disablePadding>
          <Box sx={{ borderBottom: 1, borderColor: "divider", px: 2 }}>
            <Tabs
              value={activeTab}
              onChange={(_, v) => setActiveTab(v)}
              aria-label="Grading overview tabs"
            >
              <Tab label="By Assignment" id="grading-tab-0" aria-controls="grading-panel-0" />
              <Tab label="By Student" id="grading-tab-1" aria-controls="grading-panel-1" />
            </Tabs>
          </Box>

          <Box role="tabpanel" id="grading-panel-0" hidden={activeTab !== 0}>
            {isLoading ? (
              <LoadingSkeleton variant="list" rows={5} />
            ) : data ? (
              <TasksTab tasks={data.tasks} />
            ) : null}
          </Box>

          <Box role="tabpanel" id="grading-panel-1" hidden={activeTab !== 1}>
            {isLoading ? (
              <LoadingSkeleton variant="list" rows={5} />
            ) : data ? (
              <StudentsTab
                students={data.students}
                taskCount={data.summary.taskCount}
              />
            ) : null}
          </Box>
        </DashboardCard>
      </ErrorBoundary>
    </DashboardLayout>
  );
}
