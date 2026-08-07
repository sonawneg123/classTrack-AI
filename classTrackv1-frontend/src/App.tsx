import { useEffect } from "react";
import { Box } from "@mui/material";
import { useNavigate } from "react-router-dom";
import AppRoutes from "@routes/AppRoutes";
import { setNavigate } from "@services/navigationService";

export default function App() {
  const navigate = useNavigate();

  // Give the axios interceptor (outside the React tree) a way to redirect
  // when a token refresh fails and the session has to be torn down.
  useEffect(() => {
    setNavigate(navigate);
  }, [navigate]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <AppRoutes />
    </Box>
  );
}
