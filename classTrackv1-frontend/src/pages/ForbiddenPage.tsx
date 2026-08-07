import { Box, Button, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@app/AuthProvider";
import { getDashboardPathForRole } from "@utils/roleRoutes";
import { ROUTES } from "@utils/constants";

export default function ForbiddenPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1.5,
        textAlign: "center",
        px: 3,
      }}
    >
      <Typography variant="overline" color="text.secondary">
        403
      </Typography>
      <Typography variant="h3">Access denied</Typography>
      <Typography variant="body1" color="text.secondary" maxWidth={420}>
        Your account doesn't have permission to view this page.
      </Typography>
      <Button
        variant="contained"
        sx={{ mt: 2 }}
        onClick={() =>
          navigate(user ? getDashboardPathForRole(user.role) : ROUTES.LOGIN, {
            replace: true,
          })
        }
      >
        Back to safety
      </Button>
    </Box>
  );
}
