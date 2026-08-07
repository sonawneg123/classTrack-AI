import { Box, Card, Stack, Typography, alpha, useTheme } from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingFlatIcon from "@mui/icons-material/TrendingFlat";
import type { ReactNode } from "react";
import type { StatColor, TrendDirection } from "@/types/dashboard";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  trendLabel?: string;
  trendDirection?: TrendDirection;
  color?: StatColor;
}

const trendIconMap: Record<TrendDirection, ReactNode> = {
  up: <TrendingUpIcon fontSize="small" />,
  down: <TrendingDownIcon fontSize="small" />,
  flat: <TrendingFlatIcon fontSize="small" />,
};

const trendColorMap: Record<TrendDirection, "success.main" | "error.main" | "text.secondary"> = {
  up: "success.main",
  down: "error.main",
  flat: "text.secondary",
};

export function StatCard({
  label,
  value,
  icon,
  trendLabel,
  trendDirection,
  color = "primary",
}: StatCardProps) {
  const theme = useTheme();
  const mainColor = theme.palette[color].main;

  return (
    <Card variant="outlined" sx={{ p: 2.5, height: "100%" }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h4" fontWeight={700}>
            {value}
          </Typography>
        </Stack>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: alpha(mainColor, theme.palette.mode === "dark" ? 0.18 : 0.1),
            color: mainColor,
          }}
        >
          {icon}
        </Box>
      </Stack>

      {trendLabel && trendDirection && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.5}
          sx={{ mt: 2, color: trendColorMap[trendDirection] }}
        >
          {trendIconMap[trendDirection]}
          <Typography variant="caption" fontWeight={500}>
            {trendLabel}
          </Typography>
        </Stack>
      )}
    </Card>
  );
}
