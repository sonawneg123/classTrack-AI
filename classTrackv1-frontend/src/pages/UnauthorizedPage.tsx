import { Box, Button, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@utils/constants";

export default function UnauthorizedPage() {
  const navigate = useNavigate();

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
        401
      </Typography>
      <Typography variant="h3">Sign in required</Typography>
      <Typography variant="body1" color="text.secondary" maxWidth={420}>
        You need to be signed in to view this page.
      </Typography>
      <Button
        variant="contained"
        sx={{ mt: 2 }}
        onClick={() => navigate(ROUTES.LOGIN, { replace: true })}
      >
        Go to login
      </Button>
    </Box>
  );
}
