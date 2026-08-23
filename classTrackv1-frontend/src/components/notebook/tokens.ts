/**
 * src/components/notebook/tokens.ts
 *
 * Notebook design tokens — separated from components so react-refresh is satisfied.
 * Aligned with the Admin/Classroom screenshot reference:
 *   - Deep red sidebar + accents
 *   - Warm paper off-white backgrounds
 *   - Subtle horizontal ruled lines
 *   - Faint red vertical margin line
 */
export const notebookTokens = {
  /** Warm paper-like background (matches theme background.default) */
  paperBg: "#FAFAF7",
  /** Slightly warmer paper for inner cards */
  innerPaperBg: "#F7F6F2",
  /** Notebook line color — very subtle blue-grey rule */
  ruleColor: "rgba(0, 40, 80, 0.05)",
  /** Spacing between ruled lines (px) */
  ruleSpacing: 28,
  /** Red margin line — matches the brand primary red */
  marginColor: "rgba(197, 48, 48, 0.20)",
  /** Margin offset from left edge of the page */
  marginLeft: 56,
  /** Brand accent for header underlines / highlights */
  accentLine: "#C53030",
};
