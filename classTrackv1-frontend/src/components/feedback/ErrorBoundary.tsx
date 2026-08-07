import { Component, type ErrorInfo, type ReactNode } from "react";
import { Box, Button, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional label shown in the fallback UI, e.g. "the assignments list". */
  section?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Generic, reusable error boundary. React only supports this via a class
 * component — there's no hook equivalent. Catches render-time errors in
 * its subtree and shows a recoverable fallback instead of a blank page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught an error:", error, info.componentStack);
  }

  private handleRetry = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <Box
          sx={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 1.5, py: 6, px: 3, textAlign: "center",
          }}
        >
          <ErrorOutlineIcon color="error" sx={{ fontSize: 36 }} />
          <Typography variant="subtitle1">
            Something went wrong{this.props.section ? ` loading ${this.props.section}` : ""}.
          </Typography>
          <Typography variant="body2" color="text.secondary" maxWidth={360}>
            Try again, or refresh the page if the problem continues.
          </Typography>
          <Button variant="outlined" onClick={this.handleRetry} sx={{ mt: 1 }}>
            Try again
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}
