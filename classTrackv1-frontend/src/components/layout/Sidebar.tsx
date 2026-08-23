import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import SchoolIcon from "@mui/icons-material/School";
import { APP_NAME } from "@utils/constants";
import { navConfigByRole, SIDEBAR_WIDTH, type NavItem } from "@layouts/navConfig";
import type { Role } from "@/types/common";

// Deep red sidebar — the classroom identity color from the Admin reference.
const SIDEBAR_BG    = "#7F1D1D";  // very deep red
const SIDEBAR_HOVER = "rgba(255,255,255,0.10)";
const SIDEBAR_ACTIVE_BG  = "#FAFAF7"; // warm paper — active item stands out
const SIDEBAR_ACTIVE_TEXT = "#7F1D1D"; // deep red text on paper background

interface SidebarProps {
  role: Role;
  mobileOpen: boolean;
  onClose: () => void;
}

function SidebarContent({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const items = navConfigByRole[role];

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: SIDEBAR_BG,
        color: "#FFFFFF",
      }}
    >
      {/* ── Logo / brand ──────────────────────────────────────────────── */}
      <Stack
        direction="row"
        spacing={1.25}
        alignItems="center"
        sx={{ px: 2.5, py: 2.5, borderBottom: "1px solid rgba(255,255,255,0.10)" }}
      >
        <SchoolIcon sx={{ color: "#FFFFFF" }} />
        <Typography
          variant="subtitle1"
          fontWeight={700}
          noWrap
          sx={{ color: "#FFFFFF", letterSpacing: "-0.3px" }}
        >
          {APP_NAME}
        </Typography>
      </Stack>

      {/* ── Navigation items ──────────────────────────────────────────── */}
      <List sx={{ px: 1.5, flex: 1, pt: 1.5 }}>
        {items.map((item: NavItem) => {
          const isActive = location.pathname === item.path && !item.disabled;

          const button = (
            <ListItemButton
              key={item.label}
              selected={isActive}
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                navigate(item.path);
                onNavigate?.();
              }}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                color: isActive ? SIDEBAR_ACTIVE_TEXT : "rgba(255,255,255,0.85)",
                bgcolor: isActive ? SIDEBAR_ACTIVE_BG : "transparent",
                "&:hover": {
                  bgcolor: isActive ? SIDEBAR_ACTIVE_BG : SIDEBAR_HOVER,
                },
                "&.Mui-selected": {
                  bgcolor: SIDEBAR_ACTIVE_BG,
                  "&:hover": { bgcolor: SIDEBAR_ACTIVE_BG },
                },
                "&.Mui-disabled": {
                  opacity: 0.4,
                  color: "rgba(255,255,255,0.50)",
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 36,
                  color: isActive ? SIDEBAR_ACTIVE_TEXT : "rgba(255,255,255,0.75)",
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  variant: "body2",
                  fontWeight: isActive ? 700 : 500,
                  color: "inherit",
                }}
              />
            </ListItemButton>
          );

          return item.disabled ? (
            <Tooltip key={item.label} title="Coming in a future module" placement="right">
              <span>{button}</span>
            </Tooltip>
          ) : (
            button
          );
        })}
      </List>
    </Box>
  );
}

export function Sidebar({ role, mobileOpen, onClose }: SidebarProps) {
  return (
    <Box component="nav" sx={{ width: { md: SIDEBAR_WIDTH }, flexShrink: { md: 0 } }}>
      {/* Mobile drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            boxSizing: "border-box",
            width: SIDEBAR_WIDTH,
            bgcolor: SIDEBAR_BG,
            borderRight: "none",
          },
        }}
      >
        <SidebarContent role={role} onNavigate={onClose} />
      </Drawer>

      {/* Desktop permanent sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", md: "block" },
          "& .MuiDrawer-paper": {
            boxSizing: "border-box",
            width: SIDEBAR_WIDTH,
            bgcolor: SIDEBAR_BG,
            borderRight: "none",
          },
        }}
        open
      >
        <SidebarContent role={role} />
      </Drawer>
    </Box>
  );
}
