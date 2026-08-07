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
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Stack
        direction="row"
        spacing={1.25}
        alignItems="center"
        sx={{ px: 2.5, py: 2.5 }}
      >
        <SchoolIcon color="primary" />
        <Typography variant="subtitle1" fontWeight={700} noWrap>
          {APP_NAME}
        </Typography>
      </Stack>

      <List sx={{ px: 1.5, flex: 1 }}>
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
                "&.Mui-selected": {
                  bgcolor: "action.selected",
                  fontWeight: 600,
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: isActive ? "primary.main" : "inherit" }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ variant: "body2", fontWeight: isActive ? 600 : 500 }}
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
          "& .MuiDrawer-paper": { boxSizing: "border-box", width: SIDEBAR_WIDTH },
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
            borderRight: "1px solid",
            borderColor: "divider",
          },
        }}
        open
      >
        <SidebarContent role={role} />
      </Drawer>
    </Box>
  );
}
