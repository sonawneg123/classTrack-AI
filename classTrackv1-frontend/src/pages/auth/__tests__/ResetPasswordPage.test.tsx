/**
 * src/pages/auth/__tests__/ResetPasswordPage.test.tsx
 *
 * Frontend tests for ResetPasswordPage (Part 10 — frontend).
 *
 * Scenarios covered:
 *  1.  Missing token in URL → MissingTokenScreen rendered
 *  2.  Invalid/expired token (backend returns 400) → InvalidTokenScreen
 *  3.  Used token (backend returns 400) → same generic InvalidTokenScreen (no enumeration)
 *  4.  Valid token → form rendered with account name + email
 *  5.  Account name and email displayed from backend (not from URL)
 *  6.  Empty password → validation error
 *  7.  Password mismatch → "Passwords do not match." error
 *  8.  Valid matching passwords → resetPassword API called correctly
 *  9.  Submit button disabled while submitting (double-submit prevention)
 * 10.  Successful reset → SuccessScreen rendered with "Sign in" link
 * 11.  Backend error on reset → inline error Alert displayed
 * 12.  "Sign in" on success screen navigates to /login
 *
 * QUERY NOTES (MUI specifics):
 *  - MUI <Button component={RouterLink}> renders as an <a> element,
 *    so getByRole("link") must be used, not getByRole("button").
 *  - Input fields have both aria-label and the MUI label text in the DOM.
 *    Use getByRole("textbox") / getByLabelText with exact strings to avoid
 *    "Found multiple elements" errors.
 *  - The "Confirm new password" input's aria-label is "Confirm new password"
 *    (set by inputProps.aria-label in the component), so we use getByLabelText
 *    with the exact label.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material";
import { SnackbarProvider } from "notistack";
import ResetPasswordPage from "../ResetPasswordPage";

// ── Mock the auth API ─────────────────────────────────────────────────────────
vi.mock("@features/auth/api/authApi", () => ({
  authApi: {
    validateResetToken: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

// ── Mock AuthProvider: always unauthenticated ─────────────────────────────────
vi.mock("@app/AuthProvider", () => ({
  useAuth: () => ({ isAuthenticated: false, user: null, status: "unauthenticated" }),
}));

// ── Minimal stubs for utilities used by the page ─────────────────────────────
vi.mock("@utils/roleRoutes", () => ({
  getDashboardPathForRole: (role: string) => `/${role}/dashboard`,
}));

// ── Import the mock so tests can configure it ─────────────────────────────────
import { authApi } from "@features/auth/api/authApi";

// ── Helpers ───────────────────────────────────────────────────────────────────

const theme = createTheme();

function renderPage(search = "?token=valid-token-abc") {
  return render(
    <ThemeProvider theme={theme}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={[`/reset-password${search}`]}>
          <Routes>
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            {/* Stub routes so navigation doesn't crash */}
            <Route path="/login" element={<div data-testid="login-page">Login</div>} />
            <Route path="/forgot-password" element={<div data-testid="forgot-page">Forgot</div>} />
          </Routes>
        </MemoryRouter>
      </SnackbarProvider>
    </ThemeProvider>
  );
}

/** Waits for the form to be visible (token validated) */
async function waitForForm() {
  // The form has an explicit aria-label
  return waitFor(() => screen.getByRole("form", { name: /reset password form/i }));
}

// ── Typed mock helpers ────────────────────────────────────────────────────────
const mockValidate = authApi.validateResetToken as ReturnType<typeof vi.fn>;
const mockReset = authApi.resetPassword as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Test 1 — Missing token in URL
// =============================================================================
describe("Test 1 — missing token in URL", () => {
  it("shows the 'Invalid reset link' screen when no token query param is present", () => {
    renderPage("");

    expect(screen.getByText(/invalid reset link/i)).toBeInTheDocument();
    // MUI <Button component={RouterLink}> renders as an <a> (link role)
    expect(screen.getByRole("link", { name: /request a new link/i })).toBeInTheDocument();
    // Form must NOT be rendered
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
});

// =============================================================================
// Test 2 — Invalid / expired token (backend returns error)
// =============================================================================
describe("Test 2 — invalid / expired token", () => {
  it("shows the 'Reset link expired' screen when validateResetToken rejects", async () => {
    mockValidate.mockRejectedValue({
      response: { status: 400, data: { success: false, message: "invalid" } },
    });

    renderPage("?token=expired-token-abc");

    // While verifying
    expect(screen.getByText(/verifying reset link/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/reset link expired/i)).toBeInTheDocument();
    });

    // MUI RouterLink button renders as <a>
    expect(screen.getByRole("link", { name: /request new reset link/i })).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
});

// =============================================================================
// Test 3 — Used token (same generic screen as expired — no enumeration)
// =============================================================================
describe("Test 3 — used / already-consumed token", () => {
  it("shows the same generic 'Reset link expired' screen for a used token", async () => {
    mockValidate.mockRejectedValue({
      response: { status: 400, data: { success: false, message: "used" } },
    });

    renderPage("?token=used-token-abc");

    await waitFor(() => {
      expect(screen.getByText(/reset link expired/i)).toBeInTheDocument();
    });

    // Message is generic — does not distinguish between expired / used / nonexistent
    expect(screen.getByText(/no longer valid/i)).toBeInTheDocument();
  });
});

// =============================================================================
// Test 4 — Valid token → form rendered
// =============================================================================
describe("Test 4 — valid token shows the reset form", () => {
  it("renders the password reset form when the token is valid", async () => {
    mockValidate.mockResolvedValue({ name: "Ganesh Sonawne", email: "sonawneg123@gmail.com" });

    renderPage();
    await waitForForm();

    // Use exact aria-label strings to avoid "Found multiple elements" error
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
    // Submit button is a real <button> (not a RouterLink)
    expect(screen.getByRole("button", { name: /reset password/i })).toBeInTheDocument();
    expect(screen.getByText(/back to sign in/i)).toBeInTheDocument();
  });
});

// =============================================================================
// Test 5 — Account identity shown safely (from backend, not URL)
// =============================================================================
describe("Test 5 — account identity displayed from backend", () => {
  it("shows name and email returned by the backend — not from the URL", async () => {
    mockValidate.mockResolvedValue({ name: "Ganesh Sonawne", email: "sonawneg123@gmail.com" });

    renderPage("?token=some-raw-token");

    await waitFor(() => {
      expect(screen.getByText("Ganesh Sonawne")).toBeInTheDocument();
      expect(screen.getByText("sonawneg123@gmail.com")).toBeInTheDocument();
    });

    // The raw token must never appear as visible text on the page
    expect(screen.queryByText("some-raw-token")).not.toBeInTheDocument();
  });
});

// =============================================================================
// Test 6 — Empty password validation
// =============================================================================
describe("Test 6 — empty password blocked by validation", () => {
  it("shows validation error when submitting with empty passwords", async () => {
    mockValidate.mockResolvedValue({ name: "Test User", email: "test@example.com" });

    renderPage();
    await waitForForm();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    });

    // resetPassword must NOT have been called
    expect(mockReset).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Test 7 — Password mismatch validation
// =============================================================================
describe("Test 7 — password mismatch", () => {
  it("shows 'Passwords do not match.' when confirm password differs", async () => {
    mockValidate.mockResolvedValue({ name: "Test User", email: "test@example.com" });

    renderPage();
    await waitForForm();

    const user = userEvent.setup();
    // Use exact aria-label strings (set by inputProps in the component)
    await user.type(screen.getByLabelText("New password"), "SecurePass@123");
    await user.type(screen.getByLabelText("Confirm new password"), "DifferentPass@456");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });

    expect(mockReset).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Test 8 — Valid matching passwords — form submits
// =============================================================================
describe("Test 8 — valid matching passwords submit successfully", () => {
  it("calls resetPassword when both password fields match", async () => {
    mockValidate.mockResolvedValue({ name: "Test User", email: "test@example.com" });
    mockReset.mockResolvedValue("Password reset successfully.");

    renderPage("?token=valid-token-abc");
    await waitForForm();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("New password"), "NewSecure@Pass1");
    await user.type(screen.getByLabelText("Confirm new password"), "NewSecure@Pass1");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(mockReset).toHaveBeenCalledWith("valid-token-abc", "NewSecure@Pass1");
    });
  });
});

// =============================================================================
// Test 9 — Submit button disabled while submitting
// =============================================================================
describe("Test 9 — submit button disabled while submitting", () => {
  it("disables the Reset Password button while the request is in-flight", async () => {
    mockValidate.mockResolvedValue({ name: "Test User", email: "test@example.com" });

    // Slow mock — stays pending long enough to observe the disabled state
    let resolveReset!: (v: string) => void;
    mockReset.mockReturnValue(
      new Promise<string>((res) => {
        resolveReset = res;
      })
    );

    renderPage();
    await waitForForm();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("New password"), "NewSecure@Pass1");
    await user.type(screen.getByLabelText("Confirm new password"), "NewSecure@Pass1");

    const submitBtn = screen.getByRole("button", { name: /reset password/i });
    await user.click(submitBtn);

    // Button should show "Updating password…" and be disabled
    await waitFor(() => {
      expect(screen.getByText(/updating password/i)).toBeInTheDocument();
    });
    expect(submitBtn).toBeDisabled();

    // Resolve to clean up pending state
    resolveReset("done");
    // Wait for state to settle before test ends
    await waitFor(() => {
      expect(screen.queryByText(/updating password/i)).not.toBeInTheDocument();
    });
  });
});

// =============================================================================
// Test 10 — Successful reset shows SuccessScreen
// =============================================================================
describe("Test 10 — successful reset shows success screen", () => {
  it("shows the success screen with a 'Sign in' link after successful reset", async () => {
    mockValidate.mockResolvedValue({ name: "Test User", email: "test@example.com" });
    mockReset.mockResolvedValue("Password reset successfully.");

    renderPage();
    await waitForForm();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("New password"), "NewSecure@Pass1");
    await user.type(screen.getByLabelText("Confirm new password"), "NewSecure@Pass1");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/password reset successful/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/updated successfully/i)).toBeInTheDocument();
    // MUI Button component={RouterLink} renders as <a>
    expect(screen.getByRole("link", { name: /^sign in$/i })).toBeInTheDocument();
    // Form must no longer be visible
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
});

// =============================================================================
// Test 11 — Backend error on reset
// =============================================================================
describe("Test 11 — backend error on reset submit", () => {
  it("shows an inline error alert when resetPassword returns a 400 error", async () => {
    mockValidate.mockResolvedValue({ name: "Test User", email: "test@example.com" });
    mockReset.mockRejectedValue({
      response: {
        status: 400,
        data: {
          success: false,
          message: "This password reset link is invalid or has expired.",
        },
      },
    });

    renderPage();
    await waitForForm();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("New password"), "NewSecure@Pass1");
    await user.type(screen.getByLabelText("Confirm new password"), "NewSecure@Pass1");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // The page does NOT navigate away — form is still visible
    expect(screen.getByRole("form")).toBeInTheDocument();
  });

  it("never shows internal server error details to the user — maps to generic message", async () => {
    mockValidate.mockResolvedValue({ name: "Test User", email: "test@example.com" });
    // Build an error that satisfies isAxiosError() (axios checks for the
    // isAxiosError own property being true) with a 500 response.
    // getAuthErrorMessage maps status >= 500 → hardcoded "Something went wrong. Please try again."
    const axiosLikeError = Object.assign(new Error("Internal server error"), {
      isAxiosError: true,
      code: "ERR_BAD_RESPONSE",
      response: {
        status: 500,
        data: {
          success: false,
          message: "Error: relation 'users' does not exist at line 1",
        },
      },
    });
    mockReset.mockRejectedValue(axiosLikeError);

    renderPage();
    await waitForForm();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("New password"), "NewSecure@Pass1");
    await user.type(screen.getByLabelText("Confirm new password"), "NewSecure@Pass1");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // 5xx errors must never expose the raw server message
    expect(screen.queryByText(/does not exist at line/i)).not.toBeInTheDocument();
    // getAuthErrorMessage maps status >= 500 to a generic user-friendly message
    expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong/i);
  });
});

// =============================================================================
// Test 12 — Navigation to login after success
// =============================================================================
describe("Test 12 — navigation to login after successful reset", () => {
  it("navigates to /login when the 'Sign in' link is clicked after successful reset", async () => {
    mockValidate.mockResolvedValue({ name: "Test User", email: "test@example.com" });
    mockReset.mockResolvedValue("Password reset successfully.");

    renderPage();
    await waitForForm();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("New password"), "NewSecure@Pass1");
    await user.type(screen.getByLabelText("Confirm new password"), "NewSecure@Pass1");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /^sign in$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("link", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeInTheDocument();
    });
  });
});
