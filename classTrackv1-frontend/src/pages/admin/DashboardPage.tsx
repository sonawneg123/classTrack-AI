import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import AssignmentTurnedInOutlinedIcon from "@mui/icons-material/AssignmentTurnedInOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import { DashboardLayout } from "@layouts/DashboardLayout";
import {
  NotebookCard,
  NotebookStatCard,
  NotebookSection,
} from "@components/notebook";
import { LoadingSkeleton } from "@components/feedback/LoadingSkeleton";
import { EmptyState } from "@components/feedback/EmptyState";
import { useAdminDashboard } from "@features/admin/hooks/useAdminTeachers";
import { ROUTES } from "@utils/constants";
import type { AdminDashboardAlert } from "@/types/dashboard";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Convert a snake_case audit action into a readable label. */
function actionLabel(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const ALERT_COLOR: Record<string, "error" | "warning" | "info"> = {
  pending_evaluations:        "info",
  failed_evaluations:         "error",
  unassigned_teachers:        "warning",
  expired_registration_codes: "warning",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useAdminDashboard();

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <DashboardLayout
      title="Admin Dashboard"
      description="Platform-wide overview of ClassTrack AI."
    >
      {/* ── Greeting ────────────────────────────────────────────────────── */}
      <Typography variant="h5" fontWeight={700} mb={0.5}>
        {greeting}, Admin
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Here's an overview of your platform.
      </Typography>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {isError && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }
        >
          Failed to load dashboard data. Please try again.
        </Alert>
      )}

      {/* ── KPI stat cards ──────────────────────────────────────────────── */}
      <NotebookSection title="Platform Overview" sx={{ mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            {isLoading ? (
              <NotebookCard>
                <LoadingSkeleton variant="card" />
              </NotebookCard>
            ) : (
              <NotebookStatCard
                label="Total Students"
                value={data?.overview.students ?? 0}
                icon={<SchoolOutlinedIcon />}
                color="primary"
                caption={`${data?.students.active ?? 0} active · ${data?.students.inactive ?? 0} inactive`}
              />
            )}
          </Grid>

          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            {isLoading ? (
              <NotebookCard>
                <LoadingSkeleton variant="card" />
              </NotebookCard>
            ) : (
              <NotebookStatCard
                label="Total Teachers"
                value={data?.overview.teachers ?? 0}
                icon={<GroupsOutlinedIcon />}
                color="secondary"
                caption={`${data?.teachers.active ?? 0} active · ${data?.teachers.inactive ?? 0} inactive`}
                onClick={() => navigate(ROUTES.ADMIN.TEACHERS)}
              />
            )}
          </Grid>

          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            {isLoading ? (
              <NotebookCard>
                <LoadingSkeleton variant="card" />
              </NotebookCard>
            ) : (
              <NotebookStatCard
                label="Total Classrooms"
                value={data?.overview.classrooms ?? 0}
                icon={<MeetingRoomOutlinedIcon />}
                color="success"
                caption={`${data?.classrooms.active ?? 0} active · ${data?.classrooms.inactive ?? 0} inactive`}
              />
            )}
          </Grid>

          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            {isLoading ? (
              <NotebookCard>
                <LoadingSkeleton variant="card" />
              </NotebookCard>
            ) : (
              <NotebookStatCard
                label="Total Assignments"
                value={data?.overview.assignments ?? 0}
                icon={<AssignmentOutlinedIcon />}
                color="info"
                caption={`${data?.overview.submissions ?? 0} submission(s)`}
              />
            )}
          </Grid>
        </Grid>
      </NotebookSection>

      {/* ── AI Evaluation + Submissions row ─────────────────────────────── */}
      <NotebookSection title="AI Evaluation Overview" sx={{ mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 6, sm: 3 }}>
            {isLoading ? (
              <NotebookCard>
                <LoadingSkeleton variant="card" />
              </NotebookCard>
            ) : (
              <NotebookStatCard
                label="Pending"
                value={data?.evaluations.pending ?? 0}
                icon={<AssignmentTurnedInOutlinedIcon />}
                color={data?.evaluations.pending ? "warning" : "success"}
              />
            )}
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            {isLoading ? (
              <NotebookCard>
                <LoadingSkeleton variant="card" />
              </NotebookCard>
            ) : (
              <NotebookStatCard
                label="Analyzing"
                value={data?.evaluations.analyzing ?? 0}
                icon={<AutoAwesomeOutlinedIcon />}
                color="info"
              />
            )}
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            {isLoading ? (
              <NotebookCard>
                <LoadingSkeleton variant="card" />
              </NotebookCard>
            ) : (
              <NotebookStatCard
                label="Completed"
                value={data?.evaluations.completed ?? 0}
                icon={<AutoAwesomeOutlinedIcon />}
                color="success"
              />
            )}
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            {isLoading ? (
              <NotebookCard>
                <LoadingSkeleton variant="card" />
              </NotebookCard>
            ) : (
              <NotebookStatCard
                label="Failed"
                value={data?.evaluations.failed ?? 0}
                icon={<AutoAwesomeOutlinedIcon />}
                color={data?.evaluations.failed ? "error" : "success"}
              />
            )}
          </Grid>
        </Grid>
      </NotebookSection>

      {/* ── Main content: classrooms + activity ─────────────────────────── */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {/* Classroom overview table */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <NotebookCard
            title="Classroom Overview"
            subtitle="All active classrooms"
            disablePadding
          >
            {isLoading ? (
              <LoadingSkeleton variant="list" rows={5} />
            ) : !data?.classroomList.length ? (
              <EmptyState
                icon={<MeetingRoomOutlinedIcon fontSize="inherit" />}
                title="No classrooms yet"
                description="Create a classroom to get started."
              />
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Classroom</TableCell>
                      <TableCell>Teacher</TableCell>
                      <TableCell align="center">Students</TableCell>
                      <TableCell align="center">Tasks</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.classroomList.map((room) => (
                      <TableRow key={room.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {room.name}
                          </Typography>
                          {room.subject && (
                            <Typography variant="caption" color="text.secondary">
                              {room.subject}
                              {room.section ? ` · ${room.section}` : ""}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {room.teacherName}
                          </Typography>
                          {!room.teacherActive && (
                            <Chip label="inactive" size="small" color="default" sx={{ ml: 0.5, fontSize: 10 }} />
                          )}
                        </TableCell>
                        <TableCell align="center">{room.studentCount}</TableCell>
                        <TableCell align="center">{room.taskCount}</TableCell>
                        <TableCell>
                          <Chip
                            label={room.isActive ? "Active" : "Inactive"}
                            size="small"
                            color={room.isActive ? "success" : "default"}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </NotebookCard>
        </Grid>

        {/* Recent activity feed */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <NotebookCard
            title="Recent Activity"
            subtitle="Latest platform events"
            disablePadding
            sx={{ minHeight: 300 }}
          >
            {isLoading ? (
              <LoadingSkeleton variant="list" rows={6} />
            ) : !data?.activity.length ? (
              <EmptyState
                title="No activity yet"
                description="Platform events will appear here."
              />
            ) : (
              <List disablePadding dense>
                {data.activity.map((item) => (
                  <ListItem key={item.id} divider alignItems="flex-start">
                    <ListItemText
                      primary={
                        <Typography variant="body2" fontWeight={600}>
                          {actionLabel(item.action)}
                        </Typography>
                      }
                      secondary={
                        <Stack
                          component="span"
                          direction="row"
                          spacing={0.5}
                          flexWrap="wrap"
                        >
                          {item.actorName && (
                            <Typography variant="caption" color="text.secondary" component="span">
                              by {item.actorName}
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.disabled" component="span">
                            · {timeAgo(item.createdAt)}
                          </Typography>
                        </Stack>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </NotebookCard>
        </Grid>
      </Grid>

      {/* ── Alerts + Quick Actions ──────────────────────────────────────── */}
      <Grid container spacing={2.5}>
        {/* Alerts */}
        <Grid size={{ xs: 12, md: 7 }}>
          <NotebookCard title="Needs Attention" subtitle="Items that may require action">
            {isLoading ? (
              <LoadingSkeleton variant="list" rows={3} />
            ) : !data?.alerts.length ? (
              <EmptyState
                title="All clear"
                description="No issues detected on the platform."
              />
            ) : (
              <Stack spacing={1.5}>
                {data.alerts.map((alert: AdminDashboardAlert) => (
                  <Alert
                    key={alert.type}
                    severity={ALERT_COLOR[alert.type] ?? "info"}
                    icon={<WarningAmberOutlinedIcon fontSize="inherit" />}
                    action={
                      alert.type === "unassigned_teachers" ? (
                        <Button
                          size="small"
                          onClick={() => navigate(ROUTES.ADMIN.TEACHERS)}
                        >
                          Manage
                        </Button>
                      ) : undefined
                    }
                  >
                    {alert.message}
                  </Alert>
                ))}
              </Stack>
            )}
          </NotebookCard>
        </Grid>

        {/* Quick actions */}
        <Grid size={{ xs: 12, md: 5 }}>
          <NotebookCard title="Quick Actions">
            <Stack spacing={1.5} divider={<Divider flexItem />}>
              <Paper
                elevation={0}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  p: 0,
                  background: "transparent",
                }}
              >
                <Button
                  variant="outlined"
                  startIcon={<PersonAddOutlinedIcon />}
                  onClick={() => navigate(ROUTES.ADMIN.TEACHERS)}
                  fullWidth
                  sx={{ justifyContent: "flex-start" }}
                >
                  Generate Teacher Code
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<GroupsOutlinedIcon />}
                  onClick={() => navigate(ROUTES.ADMIN.TEACHERS)}
                  fullWidth
                  sx={{ justifyContent: "flex-start" }}
                >
                  Manage Teachers
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<AddOutlinedIcon />}
                  onClick={() => navigate(ROUTES.ADMIN.TEACHERS)}
                  fullWidth
                  sx={{ justifyContent: "flex-start" }}
                >
                  Add Classroom
                </Button>
              </Paper>
            </Stack>
          </NotebookCard>
        </Grid>
      </Grid>
    </DashboardLayout>
  );
}
