import { useState, type MouseEvent } from "react";
import {
  Box,
  Chip,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Pagination,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useSnackbar } from "notistack";
import { DashboardCard } from "@components/cards/DashboardCard";
import { LoadingSkeleton } from "@components/feedback/LoadingSkeleton";
import { EmptyState } from "@components/feedback/EmptyState";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
import type {
  Classroom,
  ClassroomListParams,
  ClassroomSortBy,
  ClassroomStatusFilter,
  PaginationMeta,
} from "@/types/classroom";

interface ClassroomTableProps {
  classrooms: Classroom[];
  pagination?: PaginationMeta;
  params: ClassroomListParams;
  isLoading: boolean;
  onParamsChange: (next: ClassroomListParams) => void;
  onEdit: (classroom: Classroom) => void;
  onArchive: (classroom: Classroom) => void;
  onRestore: (classroom: Classroom) => void;
  onDelete: (classroom: Classroom) => void;
  onRegenerateCode: (classroom: Classroom) => void;
  onCreateFirst: () => void;
}

const sortColumns: { key: ClassroomSortBy; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "createdAt", label: "Created" },
  { key: "studentCount", label: "Students" },
  { key: "taskCount", label: "Assignments" },
];

export function ClassroomTable({
  classrooms,
  pagination,
  params,
  isLoading,
  onParamsChange,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  onRegenerateCode,
  onCreateFirst,
}: ClassroomTableProps) {
  const { enqueueSnackbar } = useSnackbar();
  const [searchInput, setSearchInput] = useState(params.search ?? "");
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuTarget, setMenuTarget] = useState<Classroom | null>(null);

  const openMenu = (event: MouseEvent<HTMLElement>, classroom: Classroom) => {
    setMenuAnchor(event.currentTarget);
    setMenuTarget(classroom);
  };
  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuTarget(null);
  };

  const handleSort = (key: ClassroomSortBy) => {
    const sortDir = params.sortBy === key && params.sortDir === "asc" ? "desc" : "asc";
    onParamsChange({ ...params, sortBy: key, sortDir, page: 1 });
  };

  const handleStatusChange = (_: unknown, next: ClassroomStatusFilter | null) => {
    if (next) onParamsChange({ ...params, status: next, page: 1 });
  };

  const handleSearchSubmit = () => {
    onParamsChange({ ...params, search: searchInput.trim() || undefined, page: 1 });
  };

  const copyJoinCode = (code: string) => {
    navigator.clipboard?.writeText(code).then(() => {
      enqueueSnackbar("Join code copied to clipboard.", { variant: "success" });
    });
  };

  return (
    <DashboardCard disablePadding>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={{ xs: "stretch", sm: "center" }}
        justifyContent="space-between"
        sx={{ p: 2.5, pb: 2 }}
      >
        <TextField
          size="small"
          placeholder="Search classrooms…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
          onBlur={handleSearchSubmit}
          sx={{ minWidth: { sm: 260 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <ToggleButtonGroup
          size="small"
          value={params.status}
          exclusive
          onChange={handleStatusChange}
        >
          <ToggleButton value="active">Active</ToggleButton>
          <ToggleButton value="archived">Archived</ToggleButton>
          <ToggleButton value="all">All</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {isLoading ? (
        <LoadingSkeleton variant="list" rows={5} />
      ) : classrooms.length === 0 ? (
        <EmptyState
          icon={<MeetingRoomOutlinedIcon fontSize="inherit" />}
          title={params.search || params.status !== "active" ? "No classrooms match" : "No classrooms yet"}
          description={
            params.search || params.status !== "active"
              ? "Try a different search term or status filter."
              : "Create your first classroom to get started."
          }
          actionLabel={!params.search && params.status === "active" ? "Create classroom" : undefined}
          onAction={!params.search && params.status === "active" ? onCreateFirst : undefined}
        />
      ) : (
        <>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {sortColumns.map((col) => (
                    <TableCell key={col.key}>
                      <TableSortLabel
                        active={params.sortBy === col.key}
                        direction={params.sortBy === col.key ? params.sortDir : "asc"}
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                  <TableCell>Join code</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {classrooms.map((classroom) => (
                  <TableRow key={classroom.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {classroom.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {[classroom.subject, classroom.section].filter(Boolean).join(" · ") || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>{new Date(classroom.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>{classroom.studentCount}</TableCell>
                    <TableCell>{classroom.taskCount}</TableCell>
                    <TableCell>
                      <Tooltip title="Copy join code">
                        <Chip
                          label={classroom.classCode}
                          size="small"
                          onClick={() => copyJoinCode(classroom.classCode)}
                          deleteIcon={<ContentCopyIcon fontSize="inherit" />}
                          onDelete={() => copyJoinCode(classroom.classCode)}
                          sx={{ fontFamily: "monospace" }}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={classroom.isActive ? "Active" : "Archived"}
                        size="small"
                        color={classroom.isActive ? "success" : "default"}
                        variant={classroom.isActive ? "filled" : "outlined"}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={(e) => openMenu(e, classroom)}>
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {pagination && pagination.totalPages > 1 && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2.5 }}>
              <Pagination
                page={pagination.page}
                count={pagination.totalPages}
                onChange={(_, page) => onParamsChange({ ...params, page })}
                color="primary"
                size="small"
              />
            </Box>
          )}
        </>
      )}

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        {menuTarget && [
          <MenuItem key="edit" onClick={() => { onEdit(menuTarget); closeMenu(); }}>
            <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Edit</ListItemText>
          </MenuItem>,
          <MenuItem key="regen" onClick={() => { onRegenerateCode(menuTarget); closeMenu(); }}>
            <ListItemIcon><AutorenewIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Regenerate join code</ListItemText>
          </MenuItem>,
          menuTarget.isActive ? (
            <MenuItem key="archive" onClick={() => { onArchive(menuTarget); closeMenu(); }}>
              <ListItemIcon><ArchiveOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Archive</ListItemText>
            </MenuItem>
          ) : (
            <MenuItem key="restore" onClick={() => { onRestore(menuTarget); closeMenu(); }}>
              <ListItemIcon><UnarchiveOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Restore</ListItemText>
            </MenuItem>
          ),
          <MenuItem key="delete" onClick={() => { onDelete(menuTarget); closeMenu(); }} sx={{ color: "error.main" }}>
            <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>,
        ]}
      </Menu>
    </DashboardCard>
  );
}
