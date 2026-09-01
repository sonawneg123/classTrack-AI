/**
 * src/components/ui/UserAvatar.tsx
 *
 * Reusable avatar component used everywhere a user's photo or initials
 * should appear:
 *   - Topbar / ProfileMenu
 *   - Profile page
 *   - Anywhere user identity is displayed
 *
 * Features:
 *   - Shows profile photo when available
 *   - Falls back to initials when no photo is set
 *   - Falls back to initials on broken-image error
 *   - Supports xs / sm / md / lg / xl sizes matching the design system
 *   - Loading skeleton state
 */
import { useState } from "react";
import { Avatar, Skeleton, type SxProps, type Theme } from "@mui/material";

// ── Size presets ─────────────────────────────────────────────────────────────
type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_MAP: Record<AvatarSize, { width: number; height: number; fontSize: string }> = {
  xs: { width: 24,  height: 24,  fontSize: "0.65rem" },
  sm: { width: 32,  height: 32,  fontSize: "0.75rem" },
  md: { width: 40,  height: 40,  fontSize: "0.9rem"  },
  lg: { width: 56,  height: 56,  fontSize: "1.1rem"  },
  xl: { width: 80,  height: 80,  fontSize: "1.4rem"  },
};

// ── Helper: derive initials from a name string ────────────────────────────────
export function initialsFor(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last  = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface UserAvatarProps {
  /** Display name — used to generate initials fallback. */
  name: string;
  /** Profile photo URL (from profile.avatarUrl). Null/undefined → initials. */
  avatarUrl?: string | null;
  /** One of the predefined size tokens. Default: "md". */
  size?: AvatarSize;
  /** Extra MUI sx overrides. */
  sx?: SxProps<Theme>;
  /** Whether the parent is loading the user profile. */
  loading?: boolean;
  /** Alt text for the <img> element. Defaults to "{name} profile photo". */
  alt?: string;
}

/**
 * UserAvatar — single canonical avatar for all roles.
 *
 * Usage:
 *   <UserAvatar name={user.name} avatarUrl={user.profile.avatarUrl} size="sm" />
 */
export function UserAvatar({
  name,
  avatarUrl,
  size = "md",
  sx,
  loading = false,
  alt,
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const { width, height, fontSize } = SIZE_MAP[size];

  if (loading) {
    return (
      <Skeleton
        variant="circular"
        width={width}
        height={height}
        sx={sx}
        data-testid="avatar-skeleton"
      />
    );
  }

  const showPhoto = avatarUrl && !imgError;
  const initials  = initialsFor(name);
  const altText   = alt ?? `${name} profile photo`;

  return (
    <Avatar
      src={showPhoto ? avatarUrl : undefined}
      alt={altText}
      imgProps={
        showPhoto
          ? {
              onError: () => setImgError(true),
              crossOrigin: "anonymous" as const,
            }
          : undefined
      }
      sx={{
        width,
        height,
        fontSize,
        bgcolor: showPhoto ? "transparent" : "primary.main",
        color: "primary.contrastText",
        fontWeight: 600,
        ...sx,
      }}
      data-testid="user-avatar"
    >
      {/* Rendered only when no image is showing (initials fallback) */}
      {!showPhoto && initials}
    </Avatar>
  );
}
