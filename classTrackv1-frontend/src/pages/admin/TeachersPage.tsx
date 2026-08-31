import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add,
  CheckCircle,
  ContentCopy,
  Delete,
  PersonOff,
  PersonAdd,
} from "@mui/icons-material";
import { useAuth } from "@app/AuthProvider";
import {
  useAdminTeachers,
  useSetTeacherStatus,
  useRegistrationCodes,
  useCreateRegistrationCode,
  useRevokeRegistrationCode,
} from "@features/admin/hooks/useAdminTeachers";
import type { NewRegistrationCode } from "@features/admin/api/adminApi";

export default function AdminTeachersPage() {
  const { user } = useAuth();
  const [newCode, setNewCode] = useState<NewRegistrationCode | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<number | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ id: number; name: string; current: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: teachersData, isLoading: teachersLoading, error: teachersError } =
    useAdminTeachers();
  const { data: codesData, isLoading: codesLoading } = useRegistrationCodes();

  const createCode = useCreateRegistrationCode();
  const revokeCode = useRevokeRegistrationCode();
  const setStatus = useSetTeacherStatus();

  if (!user || user.role !== "admin") {
    return (
      <Box p={4}>
        <Alert severity="error">Unauthorized.</Alert>
      </Box>
    );
  }

  const handleGenerateCode = async () => {
    try {
      const result = await createCode.mutateAsync(24);
      setNewCode(result);
    } catch (err) {
      // Error displayed via mutation state
    }
  };

  const handleRevoke = async (id: number) => {
    await revokeCode.mutateAsync(id);
    setRevokeTarget(null);
  };

  const handleStatusToggle = async () => {
    if (!statusTarget) return;
    await setStatus.mutateAsync({
      id: statusTarget.id,
      isActive: !statusTarget.current,
    });
    setStatusTarget(null);
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "active": return "success";
      case "expired": return "warning";
      case "used": return "default";
      case "revoked": return "error";
      default: return "default";
    }
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 4 }, maxWidth: 1200, mx: "auto" }}>
      <Typography variant="h4" fontWeight={700} mb={1}>
        Teacher Management
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={4}>
        Manage teacher accounts and registration codes.
      </Typography>

      {/* ── Registration Codes Section ─────────────────────────────────────── */}
      <Paper elevation={0} sx={{ p: 3, mb: 4, border: "1px solid", borderColor: "divider" }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" fontWeight={600}>
            Teacher Registration Codes
          </Typography>
          <Button
            variant="contained"
            startIcon={createCode.isPending ? <CircularProgress size={16} color="inherit" /> : <Add />}
            onClick={handleGenerateCode}
            disabled={createCode.isPending}
          >
            Generate Code
          </Button>
        </Stack>

        {/* Newly created code banner */}
        {newCode && (
          <Alert
            severity="success"
            sx={{ mb: 2, fontFamily: "monospace" }}
            action={
              <Button
                size="small"
                startIcon={copied ? <CheckCircle /> : <ContentCopy />}
                onClick={() => handleCopy(newCode.code)}
              >
                {copied ? "Copied!" : "Copy"}
              </Button>
            }
          >
            <strong>New code (shown once only):</strong>{" "}
            <Typography component="span" fontFamily="monospace" fontWeight={700} fontSize={18}>
              {newCode.code}
            </Typography>
            {" "}— expires {new Date(newCode.expiresAt).toLocaleString()}
          </Alert>
        )}

        {createCode.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {(createCode.error as Error)?.message || "Failed to generate code."}
          </Alert>
        )}

        {codesLoading ? (
          <CircularProgress size={24} />
        ) : codesData?.codes.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No registration codes yet. Generate one above.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Created by</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Expires</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {codesData?.codes.map((code) => (
                  <TableRow key={code.id}>
                    <TableCell>#{code.id}</TableCell>
                    <TableCell>{code.createdByName}</TableCell>
                    <TableCell>
                      {new Date(code.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {new Date(code.expiresAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={code.status}
                        size="small"
                        color={statusColor(code.status) as "success" | "warning" | "default" | "error"}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {code.status === "active" && (
                        <Tooltip title="Revoke this code">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setRevokeTarget(code.id)}
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* ── Teachers Table ──────────────────────────────────────────────────── */}
      <Paper elevation={0} sx={{ p: 3, border: "1px solid", borderColor: "divider" }}>
        <Typography variant="h6" fontWeight={600} mb={2}>
          Registered Teachers
        </Typography>

        {teachersLoading ? (
          <CircularProgress size={24} />
        ) : teachersError ? (
          <Alert severity="error">Failed to load teachers.</Alert>
        ) : teachersData?.rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No teachers registered yet.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Mobile</TableCell>
                  <TableCell>Classrooms</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {teachersData?.rows.map((teacher) => (
                  <TableRow key={teacher.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {teacher.name}
                      </Typography>
                    </TableCell>
                    <TableCell>{teacher.email}</TableCell>
                    <TableCell>
                      {teacher.mobile_number ?? (
                        <Typography variant="caption" color="text.disabled">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{teacher.classroom_count ?? 0}</TableCell>
                    <TableCell>
                      <Chip
                        label={teacher.is_active ? "Active" : "Inactive"}
                        size="small"
                        color={teacher.is_active ? "success" : "default"}
                      />
                    </TableCell>
                    <TableCell>
                      {new Date(teacher.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip
                        title={teacher.is_active ? "Deactivate" : "Activate"}
                      >
                        <IconButton
                          size="small"
                          color={teacher.is_active ? "warning" : "success"}
                          onClick={() =>
                            setStatusTarget({
                              id: teacher.id,
                              name: teacher.name,
                              current: teacher.is_active,
                            })
                          }
                        >
                          {teacher.is_active ? (
                            <PersonOff fontSize="small" />
                          ) : (
                            <PersonAdd fontSize="small" />
                          )}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* ── Revoke confirmation dialog ──────────────────────────────────────── */}
      <Dialog open={revokeTarget !== null} onClose={() => setRevokeTarget(null)}>
        <DialogTitle>Revoke Registration Code?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This code will be permanently revoked. Any teacher attempting to use
            it will be rejected. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevokeTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => revokeTarget && handleRevoke(revokeTarget)}
            disabled={revokeCode.isPending}
          >
            {revokeCode.isPending ? "Revoking…" : "Revoke"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Status toggle confirmation dialog ──────────────────────────────── */}
      <Dialog open={statusTarget !== null} onClose={() => setStatusTarget(null)}>
        <DialogTitle>
          {statusTarget?.current ? "Deactivate" : "Activate"} Teacher?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {statusTarget?.current
              ? `Deactivating ${statusTarget?.name} will prevent them from logging in immediately.`
              : `Activating ${statusTarget?.name} will restore their access.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusTarget(null)}>Cancel</Button>
          <Button
            color={statusTarget?.current ? "error" : "success"}
            variant="contained"
            onClick={handleStatusToggle}
            disabled={setStatus.isPending}
          >
            {setStatus.isPending
              ? "Updating…"
              : statusTarget?.current
              ? "Deactivate"
              : "Activate"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
