import { Box, Typography } from "@mui/material";
import { APP_NAME } from "@utils/constants";

export function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        py: 2,
        px: 3,
        borderTop: "1px solid",
        borderColor: "divider",
        textAlign: "center",
      }}
    >
      <Typography variant="caption" color="text.secondary">
        © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
      </Typography>
    </Box>
  );
}
