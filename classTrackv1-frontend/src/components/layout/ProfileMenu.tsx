import { useState, type MouseEvent } from "react";
import {
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import LogoutIcon from "@mui/icons-material/Logout";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@app/AuthProvider";
import { UserAvatar } from "@components/ui/UserAvatar";
import { ROUTES } from "@utils/constants";

export function ProfileMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  if (!user) return null;

  const handleOpen = (event: MouseEvent<HTMLElement>) =>
    setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const handleLogout = async () => {
    handleClose();
    await logout();
  };

  const handleProfile = () => {
    handleClose();
    navigate(ROUTES.ACCOUNT.PROFILE);
  };

  return (
    <>
      <IconButton onClick={handleOpen} size="small" sx={{ ml: 1 }}>
        <UserAvatar
          name={user.name}
          avatarUrl={user.profile.avatarUrl}
          size="sm"
        />
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
      >
        <Box sx={{ px: 2, py: 1.25, minWidth: 220, display: "flex", alignItems: "center", gap: 1.5 }}>
          <UserAvatar
            name={user.name}
            avatarUrl={user.profile.avatarUrl}
            size="md"
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" noWrap>
              {user.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap component="div">
              {user.profile.email ?? user.profile.username ?? user.role}
            </Typography>
          </Box>
        </Box>
        <Divider />
        <MenuItem onClick={handleProfile}>
          <ListItemIcon>
            <PersonOutlineIcon fontSize="small" />
          </ListItemIcon>
          My profile
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Log out
        </MenuItem>
      </Menu>
    </>
  );
}
