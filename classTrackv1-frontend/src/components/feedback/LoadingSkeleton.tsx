import { Box, Skeleton, Stack } from "@mui/material";

type SkeletonVariant = "card" | "chart" | "list";

interface LoadingSkeletonProps {
  variant: SkeletonVariant;
  rows?: number;
  height?: number;
}

/**
 * Shape-aware loading placeholder. Reused anywhere a query is in flight —
 * stat cards, chart containers, and list-style widgets each get a
 * skeleton shaped like the content they're standing in for.
 */
export function LoadingSkeleton({ variant, rows = 4, height = 260 }: LoadingSkeletonProps) {
  if (variant === "card") {
    return (
      <Box sx={{ p: 2.5 }}>
        <Skeleton variant="text" width="60%" height={20} />
        <Skeleton variant="text" width="40%" height={36} sx={{ mt: 1 }} />
        <Skeleton variant="text" width="50%" height={16} sx={{ mt: 1 }} />
      </Box>
    );
  }

  if (variant === "chart") {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rounded" width="100%" height={height} />
      </Box>
    );
  }

  return (
    <Stack spacing={1.5} sx={{ p: 2 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Stack key={i} direction="row" spacing={1.5} alignItems="center">
          <Skeleton variant="circular" width={36} height={36} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="70%" height={16} />
            <Skeleton variant="text" width="40%" height={14} />
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}
