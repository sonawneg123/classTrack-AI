import type { PaletteOptions } from "@mui/material/styles";

/**
 * ClassTrack AI design tokens — Notebook / Classroom visual identity.
 *
 * Primary: deep crimson red — the dominant classroom accent (sidebar, headings,
 *   primary buttons). Matches the Admin screenshot reference.
 * Secondary: academic navy — structural headings, data emphasis.
 * Background: warm paper off-white — notebook feel throughout.
 */
export const brand = {
  // Deep red classroom identity
  red800:  "#9B1C1C",
  red700:  "#B91C1C",
  red600:  "#C53030",  // ← primary brand accent (sidebar, buttons)
  red500:  "#DC2626",
  red100:  "#FEE2E2",
  // Structural navy
  navy900: "#0B1220",
  navy800: "#111C34",
  navy700: "#14213D",
  navy600: "#1E2E52",
  navy100: "#E7EBF5",
  // Warm paper
  paper:   "#FAFAF7",
  paperInner: "#F7F6F2",
  // Neutrals
  slate500: "#5A6B87",
  amber500: "#D97706",
};

export const lightPalette: PaletteOptions = {
  mode: "light",
  primary: {
    main: brand.red600,
    light: brand.red500,
    dark: brand.red800,
    contrastText: "#FFFFFF",
  },
  secondary: {
    main: brand.navy700,
    light: brand.navy600,
    dark: brand.navy900,
    contrastText: "#FFFFFF",
  },
  error: { main: brand.red500 },
  warning: { main: brand.amber500 },
  success: { main: "#2E9E5B" },
  info: { main: "#0369A1" },
  background: {
    // Warm off-white notebook paper background for the whole app
    default: brand.paper,
    paper: "#FFFFFF",
  },
  text: {
    primary: "#101828",
    secondary: brand.slate500,
  },
  divider: "rgba(16, 24, 40, 0.08)",
};

export const darkPalette: PaletteOptions = {
  mode: "dark",
  primary: {
    main: "#F87171",    // soft red — readable on dark backgrounds
    light: "#FCA5A5",
    dark: "#EF4444",
    contrastText: brand.navy900,
  },
  secondary: {
    main: brand.navy100,
    contrastText: brand.navy900,
  },
  error: { main: "#F0685A" },
  warning: { main: brand.amber500 },
  success: { main: "#4CBB7D" },
  info: { main: "#38BDF8" },
  background: {
    default: brand.navy900,
    paper: brand.navy800,
  },
  text: {
    primary: "#E9ECF5",
    secondary: "#9AA6C0",
  },
  divider: "rgba(233, 236, 245, 0.08)",
};
