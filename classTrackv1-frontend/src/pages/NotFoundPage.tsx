import { Box, Button, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        flex: 1,
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
        404
      </Typography>
      <Typography variant="h3">Page not found</Typography>
      <Typography variant="body1" color="text.secondary" maxWidth={420}>
        The page you're looking for doesn't exist or may have moved.
      </Typography>
      <Button variant="contained" sx={{ mt: 2 }} onClick={() => navigate("/")}>
        Back to home
      </Button>
    </Box>
  );
}
