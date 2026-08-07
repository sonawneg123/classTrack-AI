import { type ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { SnackbarProvider } from "notistack";
import { ThemeModeProvider } from "@theme/ThemeModeProvider";
import { AuthProvider } from "./AuthProvider";
import { queryClient } from "./queryClient";

/**
 * Single composition root for every cross-cutting provider.
 * Keeping this isolated means main.tsx / App.tsx stay declarative,
 * and new global concerns (auth, i18n, etc.) plug in here only.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeModeProvider>
        <SnackbarProvider
          maxSnack={3}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          autoHideDuration={4000}
        >
          <BrowserRouter>
            <AuthProvider>{children}</AuthProvider>
          </BrowserRouter>
        </SnackbarProvider>
      </ThemeModeProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
