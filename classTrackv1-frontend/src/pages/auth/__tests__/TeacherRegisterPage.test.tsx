import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TeacherRegisterPage from "../TeacherRegisterPage";
import { authApi } from "@features/auth/api/authApi";
import { tokenStorage } from "@services/tokenStorage";

// Mock modules
vi.mock("@features/auth/api/authApi", () => ({
  authApi: { registerTeacher: vi.fn() },
}));
vi.mock("@services/tokenStorage", () => ({
  tokenStorage: { setTokens: vi.fn(), getAccessToken: vi.fn(), getRefreshToken: vi.fn(), clear: vi.fn() },
}));
vi.mock("@app/AuthProvider", () => ({
  useAuth: () => ({ isAuthenticated: false, user: null }),
}));

const mockRegisterTeacher = vi.mocked(authApi.registerTeacher);

function renderPage() {
  return render(
    <MemoryRouter>
      <TeacherRegisterPage />
    </MemoryRouter>
  );
}

const VALID_FORM = {
  name: "Jane Smith",
  email: "jane@teacher.com",
  teacherCode: "ABCD-1234",
  password: "Password1",
  confirmPassword: "Password1",
};

async function fillForm(overrides: Partial<typeof VALID_FORM> = {}) {
  const values = { ...VALID_FORM, ...overrides };
  const user = userEvent.setup();

  if (values.name) {
    await user.type(screen.getByLabelText(/full name/i), values.name);
  }
  if (values.email) {
    await user.type(screen.getByLabelText(/email address/i), values.email);
  }
  if (values.teacherCode) {
    await user.type(screen.getByLabelText(/teacher registration code/i), values.teacherCode);
  }
  if (values.password) {
    const passwordInputs = screen.getAllByLabelText(/password/i);
    await user.type(passwordInputs[0], values.password);
  }
  if (values.confirmPassword) {
    await user.type(screen.getByLabelText(/confirm password/i), values.confirmPassword);
  }
}

describe("TeacherRegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the registration form with all required fields", () => {
    renderPage();
    expect(screen.getByText(/teacher registration/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/teacher registration code/i)).toBeInTheDocument();
  });

  it("shows validation errors when form is submitted empty", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /create teacher account/i }));
    await waitFor(() => {
      expect(screen.getByText(/full name must be at least/i)).toBeInTheDocument();
    });
  });

  it("shows password mismatch error", async () => {
    renderPage();
    await fillForm({ confirmPassword: "WrongPassword1" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /create teacher account/i }));
    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });

  it("shows loading state during submission", async () => {
    mockRegisterTeacher.mockImplementation(
      () => new Promise(() => undefined) // never resolves
    );
    renderPage();
    await fillForm();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /create teacher account/i }));
    await waitFor(() => {
      expect(screen.getByText(/creating account/i)).toBeInTheDocument();
    });
  });

  it("shows success state after successful registration", async () => {
    mockRegisterTeacher.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      permissions: ["classroom:manage_own"],
      user: { id: 1, name: "Jane Smith", role: "teacher", email: "jane@teacher.com" },
    });
    renderPage();
    await fillForm();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /create teacher account/i }));
    await waitFor(() => {
      expect(screen.getByText(/teacher account created/i)).toBeInTheDocument();
    });
  });

  it("displays API error message on failure", async () => {
    mockRegisterTeacher.mockRejectedValue({
      response: {
        data: {
          success: false,
          message: "Unable to create the teacher account. Please verify your registration details and teacher code.",
        },
      },
    });
    renderPage();
    await fillForm();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /create teacher account/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/unable to create the teacher account/i)
      ).toBeInTheDocument();
    });
  });

  it("displays generic error for invalid teacher code", async () => {
    mockRegisterTeacher.mockRejectedValue({
      response: {
        status: 400,
        data: {
          success: false,
          message: "Unable to create the teacher account. Please verify your registration details and teacher code.",
        },
      },
    });
    renderPage();
    await fillForm();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /create teacher account/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/unable to create the teacher account/i)
      ).toBeInTheDocument();
    });
  });

  it("stores tokens after successful registration", async () => {
    mockRegisterTeacher.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      permissions: [],
      user: { id: 1, name: "Jane Smith", role: "teacher", email: "jane@teacher.com" },
    });
    renderPage();
    await fillForm();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /create teacher account/i }));
    await waitFor(() => {
      expect(tokenStorage.setTokens).toHaveBeenCalledWith({
        accessToken: "access-token",
        refreshToken: "refresh-token",
      });
    });
  });
});
