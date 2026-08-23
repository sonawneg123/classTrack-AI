/**
 * src/components/notebook/index.tsx
 *
 * Notebook-themed design primitives for ClassTrack AI.
 *
 * Visual language:
 *   - Warm off-white paper-like background
 *   - Subtle horizontal ruled lines
 *   - Faint red vertical margin line (where appropriate)
 *   - Cards that feel like paper sheets
 *   - Restrained academic color palette
 *
 * These wrap MUI components so all existing functionality
 * (theming, dark mode, accessibility) is preserved.
 */
import { type ReactNode } from "react";
import { Box, Card, CardContent, CardHeader, Divider, Stack, Typography, alpha, useTheme, type SxProps, type Theme } from "@mui/material";
import { notebookTokens } from "./tokens";

// ---------------------------------------------------------------------------
// NotebookPage — full-width page background with subtle ruled lines
// ---------------------------------------------------------------------------
interface NotebookPageProps {
  children: ReactNode;
  showMargin?: boolean;
  sx?: SxProps<Theme>;
}

export function NotebookPage({ children, showMargin = false, sx }: NotebookPageProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const bgColor = isDark ? theme.palette.background.default : notebookTokens.paperBg;
  const ruleColor = isDark ? "rgba(255,255,255,0.04)" : notebookTokens.ruleColor;
  const marginColor = isDark ? "rgba(200,80,80,0.12)" : notebookTokens.marginColor;

  return (
    <Box
      sx={{
        position: "relative",
        minHeight: "100%",
        bgcolor: bgColor,
        // Horizontal ruled lines via repeating-linear-gradient
        backgroundImage: `
          repeating-linear-gradient(
            transparent,
            transparent ${notebookTokens.ruleSpacing - 1}px,
            ${ruleColor} ${notebookTokens.ruleSpacing - 1}px,
            ${ruleColor} ${notebookTokens.ruleSpacing}px
          )
          ${showMargin ? `,linear-gradient(90deg, transparent ${notebookTokens.marginLeft}px, ${marginColor} ${notebookTokens.marginLeft}px, ${marginColor} ${notebookTokens.marginLeft + 1}px, transparent ${notebookTokens.marginLeft + 1}px)` : ""}
        `,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// NotebookCard — paper-sheet card
// ---------------------------------------------------------------------------
interface NotebookCardProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  disablePadding?: boolean;
  accentColor?: string;
  sx?: SxProps<Theme>;
}

export function NotebookCard({
  title,
  subtitle,
  action,
  children,
  disablePadding,
  accentColor,
  sx,
}: NotebookCardProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const bg = isDark ? theme.palette.background.paper : notebookTokens.innerPaperBg;

  return (
    <Card
      variant="outlined"
      sx={{
        bgcolor: bg,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderColor: isDark ? theme.palette.divider : "rgba(0,0,0,0.10)",
        borderRadius: 2,
        ...(accentColor && {
          borderLeft: `4px solid ${accentColor}`,
        }),
        ...sx,
      }}
    >
      {title && (
        <>
          <CardHeader
            title={title}
            subheader={subtitle}
            action={action}
            titleTypographyProps={{ variant: "subtitle1", fontWeight: 700 }}
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

// ---------------------------------------------------------------------------
// NotebookStatCard — metric tile with notebook paper feel
// ---------------------------------------------------------------------------
interface NotebookStatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  color?: "primary" | "secondary" | "success" | "warning" | "error" | "info";
  caption?: string;
  /** Optional click handler — when provided the card becomes interactive
   *  (pointer cursor, hover elevation) without changing its visual identity. */
  onClick?: () => void;
}

export function NotebookStatCard({ label, value, icon, color = "primary", caption, onClick }: NotebookStatCardProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const mainColor = theme.palette[color].main;
  const bg = isDark ? theme.palette.background.paper : notebookTokens.innerPaperBg;

  return (
    <Card
      variant="outlined"
      onClick={onClick}
      sx={{
        p: 2.5,
        height: "100%",
        bgcolor: bg,
        borderColor: isDark ? theme.palette.divider : "rgba(0,0,0,0.10)",
        borderRadius: 2,
        borderTop: `3px solid ${mainColor}`,
        ...(onClick && {
          cursor: "pointer",
          transition: "box-shadow 0.15s ease, border-color 0.15s ease",
          "&:hover": {
            boxShadow: `0 2px 8px ${alpha(mainColor, 0.18)}`,
            borderColor: alpha(mainColor, 0.45),
          },
        }),
      }}
    >
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h4" fontWeight={700}>
            {value}
          </Typography>
          {caption && (
            <Typography variant="caption" color="text.secondary">
              {caption}
            </Typography>
          )}
          {onClick && (
            <Typography variant="caption" color={mainColor} sx={{ fontWeight: 600, mt: 0.25 }}>
              View all →
            </Typography>
          )}
        </Stack>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: alpha(mainColor, isDark ? 0.18 : 0.10),
            color: mainColor,
          }}
        >
          {icon}
        </Box>
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// NotebookSection — labeled divider for page sections
// ---------------------------------------------------------------------------
interface NotebookSectionProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  sx?: SxProps<Theme>;
}

export function NotebookSection({ title, subtitle, children, sx }: NotebookSectionProps) {
  return (
    <Box sx={sx}>
      <Box sx={{ mb: 1.5, pb: 1, borderBottom: "2px solid", borderColor: "divider" }}>
        <Typography variant="h6" fontWeight={700}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </Box>
      {children}
    </Box>
  );
}
