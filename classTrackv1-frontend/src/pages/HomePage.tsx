import { Box, Button, Stack, Typography } from "@mui/material";
import { Navigate, useNavigate } from "react-router-dom";
import { useThemeMode } from "@theme/ThemeModeProvider";
import { useAuth } from "@app/AuthProvider";
import { getDashboardPathForRole } from "@utils/roleRoutes";
import { APP_NAME, ROUTES } from "@utils/constants";

/**
 * Public landing page. Authenticated users are sent straight to their
 * dashboard; everyone else sees this with a sign-in entry point.
 * Replaced by a proper marketing/landing layout in a later module.
 */
export default function HomePage() {
  const { mode, toggleMode } = useThemeMode();
  const { isAuthenticated, user, status } = useAuth();
  const navigate = useNavigate();

  if (status !== "bootstrapping" && isAuthenticated && user) {
    return <Navigate to={getDashboardPathForRole(user.role)} replace />;
  }

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        px: 3,
        textAlign: "center",
      }}
    >
      <Typography variant="h2">{APP_NAME}</Typography>
      <Typography variant="body1" color="text.secondary" maxWidth={480}>
        Frontend foundation is running. Authentication, layouts, and
        role-based dashboards are coming in the next modules.
      </Typography>
      <Stack direction="row" spacing={2} mt={2}>
        <Button variant="contained" onClick={() => navigate(ROUTES.LOGIN)}>
          Sign in
        </Button>
        <Button variant="outlined" color="inherit" onClick={toggleMode}>
          Switch to {mode === "light" ? "dark" : "light"} mode
        </Button>
      </Stack>
    </Box>
  );
}
