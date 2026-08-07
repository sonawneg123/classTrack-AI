import { Card, CardContent, CardHeader, Divider, type SxProps, type Theme } from "@mui/material";
import type { ReactNode } from "react";

interface DashboardCardProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  disablePadding?: boolean;
  sx?: SxProps<Theme>;
}

/**
 * Base card shell every dashboard widget builds on — consistent border,
 * spacing, and optional header/action slot so widgets only need to supply
 * their content.
 */
export function DashboardCard({
  title,
  subtitle,
  action,
  children,
  disablePadding,
  sx,
}: DashboardCardProps) {
  return (
    <Card
      variant="outlined"
      sx={{ height: "100%", display: "flex", flexDirection: "column", ...sx }}
    >
      {title && (
        <>
          <CardHeader
            title={title}
            subheader={subtitle}
            action={action}
            titleTypographyProps={{ variant: "subtitle1", fontWeight: 600 }}
            subheaderTypographyProps={{ variant: "caption" }}
            sx={{ pb: 1 }}
          />
          <Divider />
        </>
      )}
      <CardContent
        sx={{
          flex: 1,
          p: disablePadding ? 0 : undefined,
          "&:last-child": { pb: disablePadding ? 0 : 2 },
        }}
      >
        {children}
      </CardContent>
    </Card>
  );
}
