import type { TypographyVariantsOptions } from "@mui/material/styles";

export const typography: TypographyVariantsOptions = {
  fontFamily: [
    '"Inter"',
    '"Segoe UI"',
    "Roboto",
    "-apple-system",
    "BlinkMacSystemFont",
    "sans-serif",
  ].join(","),
  h1: { fontWeight: 700, fontSize: "2.5rem", letterSpacing: "-0.02em" },
  h2: { fontWeight: 700, fontSize: "2rem", letterSpacing: "-0.02em" },
  h3: { fontWeight: 600, fontSize: "1.625rem", letterSpacing: "-0.01em" },
  h4: { fontWeight: 600, fontSize: "1.375rem" },
  h5: { fontWeight: 600, fontSize: "1.125rem" },
  h6: { fontWeight: 600, fontSize: "1rem" },
  subtitle1: { fontWeight: 500 },
  subtitle2: { fontWeight: 500, fontSize: "0.875rem" },
  body1: { fontSize: "0.9375rem" },
  body2: { fontSize: "0.8125rem" },
  button: { fontWeight: 600, textTransform: "none" as const },
  caption: { fontSize: "0.75rem" },
  overline: { fontSize: "0.6875rem", letterSpacing: "0.08em" },
};
