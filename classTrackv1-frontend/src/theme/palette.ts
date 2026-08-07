import type { PaletteOptions } from "@mui/material/styles";

/**
 * ClassTrack AI design tokens.
 * Primary: deep academic navy — trust, structure, institutional weight.
 * Secondary: signal teal — reserved for AI-assisted features & highlights.
 * Semantic colors follow MUI conventions so status chips/alerts stay consistent.
 */
export const brand = {
  navy900: "#0B1220",
  navy800: "#111C34",
  navy700: "#14213D",
  navy600: "#1E2E52",
  navy100: "#E7EBF5",
  teal500: "#0FA3A3",
  teal400: "#3DC1C1",
  amber500: "#E0A82E",
  coral500: "#E0533D",
  slate500: "#5A6B87",
};

export const lightPalette: PaletteOptions = {
  mode: "light",
  primary: {
    main: brand.navy700,
    light: brand.navy600,
    dark: brand.navy900,
    contrastText: "#FFFFFF",
  },
  secondary: {
    main: brand.teal500,
    light: brand.teal400,
    dark: "#0B7A7A",
    contrastText: "#FFFFFF",
  },
  error: { main: brand.coral500 },
  warning: { main: brand.amber500 },
  success: { main: "#2E9E5B" },
  info: { main: brand.teal400 },
  background: {
    default: "#F5F7FB",
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
    main: brand.teal400,
    light: brand.teal400,
    dark: brand.teal500,
    contrastText: brand.navy900,
  },
  secondary: {
    main: brand.teal500,
    contrastText: "#FFFFFF",
  },
  error: { main: "#F0685A" },
  warning: { main: brand.amber500 },
  success: { main: "#4CBB7D" },
  info: { main: brand.teal400 },
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
