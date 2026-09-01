/**
 * src/pages/account/__tests__/ProfilePage.test.tsx
 *
 * Tests for the ProfilePage component.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnackbarProvider } from "notistack";

// ── Static mocks (hoisted) ─────────────────────────────────────────────────────

const mockUploadMutate = vi.fn();
const mockDeleteMutate = vi.fn();

let profileData = {
  id: 1,
  name: "Admin User",
  role: "admin",
  email: "admin@test.com",
  avatarUrl: null as string | null,
  isActive: true,
  createdAt: "2024-01-01T00:00:00Z",
  lastLoginAt: null,
};
let uploadPending = false;
let deletePending = false;

vi.mock("@app/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: 1,
      role: "admin",
      name: "Admin User",
      permissions: [],
      profile: {
        isActive: true,
        email: "admin@test.com",
        avatarUrl: null,
        createdAt: "2024-01-01T00:00:00Z",
        lastLoginAt: null,
      },
    },
    logout: vi.fn(),
    refreshUser: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@layouts/DashboardLayout", () => ({
  DashboardLayout: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title: string;
  }) => (
    <div data-testid="dashboard-layout">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock("@features/account/hooks/useProfile", () => ({
  useProfile: () => ({ data: profileData, isLoading: false }),
  useUploadAvatar: () => ({ mutate: mockUploadMutate, isPending: uploadPending }),
  useDeleteAvatar: () => ({ mutate: mockDeleteMutate, isPending: deletePending }),
  validateAvatarFile: vi.fn().mockReturnValue(null),
}));

// Mock AvatarCropDialog — simulates the crop/adjust step.
// Renders a visible confirm button; clicking it calls onConfirm with the same file.
vi.mock("@components/ui/AvatarCropDialog", () => ({
  AvatarCropDialog: ({
    file,
    onConfirm,
    onCancel,
  }: {
    file: File | null;
    onConfirm: (f: File) => void;
    onCancel: () => void;
  }) => {
    if (!file) return null;
    return (
      <div data-testid="crop-dialog">
        <button data-testid="crop-confirm" onClick={() => onConfirm(file)}>
          Use photo
        </button>
        <button data-testid="crop-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  },
}));

import ProfilePage from "../ProfilePage";
import { validateAvatarFile } from "@features/account/hooks/useProfile";

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <SnackbarProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  );
}

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileData = {
      id: 1,
      name: "Admin User",
      role: "admin",
      email: "admin@test.com",
      avatarUrl: null,
      isActive: true,
      createdAt: "2024-01-01T00:00:00Z",
      lastLoginAt: null,
    };
    uploadPending = false;
    deletePending = false;
    vi.mocked(validateAvatarFile).mockReturnValue(null);
  });

  it("renders the profile page with user information", () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    expect(screen.getByTestId("dashboard-layout")).toBeTruthy();
    expect(screen.getByText("My Profile")).toBeTruthy();
    // Name may appear in multiple places (page header + avatar area)
    expect(screen.getAllByText("Admin User").length).toBeGreaterThan(0);
    expect(screen.getByText("admin@test.com")).toBeTruthy();
  });

  it("shows upload photo button when no photo is set", () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    // aria-label is set on the Button component
    expect(screen.getByLabelText("Change profile photo")).toBeTruthy();
  });

  it("does not show remove photo button when no photo is set", () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    expect(screen.queryByLabelText("Remove profile photo")).toBeNull();
  });

  it("shows both change and remove buttons when photo is set", () => {
    profileData = { ...profileData, avatarUrl: "/api/v1/account/avatar/photo.jpg" };
    render(<ProfilePage />, { wrapper: Wrapper });
    expect(screen.getByLabelText("Change profile photo")).toBeTruthy();
    expect(screen.getByLabelText("Remove profile photo")).toBeTruthy();
  });

  it("calls delete mutation when remove photo is clicked", async () => {
    profileData = { ...profileData, avatarUrl: "/api/v1/account/avatar/photo.jpg" };
    render(<ProfilePage />, { wrapper: Wrapper });

    const removeBtn = screen.getByLabelText("Remove profile photo");
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(mockDeleteMutate).toHaveBeenCalledTimes(1);
    });
  });

  it("disables the upload button when upload is pending", () => {
    uploadPending = true;
    render(<ProfilePage />, { wrapper: Wrapper });
    const uploadBtn = screen.getByLabelText("Change profile photo");
    expect(uploadBtn).toBeDisabled();
  });

  it("disables the remove button when delete is pending", () => {
    profileData   = { ...profileData, avatarUrl: "/api/v1/account/avatar/photo.jpg" };
    deletePending = true;
    render(<ProfilePage />, { wrapper: Wrapper });
    const removeBtn = screen.getByLabelText("Remove profile photo");
    expect(removeBtn).toBeDisabled();
  });

  it("shows validation error for wrong file type", async () => {
    vi.mocked(validateAvatarFile).mockReturnValue(
      "Please select a JPEG, PNG, or WebP image."
    );
    render(<ProfilePage />, { wrapper: Wrapper });

    const fileInput = screen.getByLabelText("Select profile photo file");
    const file = new File(["content"], "hack.txt", { type: "text/plain" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(
        screen.getByText("Please select a JPEG, PNG, or WebP image.")
      ).toBeTruthy();
    });
  });

  it("does not call upload mutation when file validation fails", async () => {
    vi.mocked(validateAvatarFile).mockReturnValue("Image must be smaller than 5 MB.");
    render(<ProfilePage />, { wrapper: Wrapper });

    const fileInput = screen.getByLabelText("Select profile photo file");
    const file = new File(["x".repeat(10)], "large.jpg", { type: "image/jpeg" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(screen.getByText("Image must be smaller than 5 MB.")).toBeTruthy();
    });
    expect(mockUploadMutate).not.toHaveBeenCalled();
  });

  it("opens crop dialog when a valid file is selected", async () => {
    render(<ProfilePage />, { wrapper: Wrapper });

    const fileInput = screen.getByLabelText("Select profile photo file");
    const file = new File(["fake-jpeg"], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(screen.queryByTestId("crop-dialog")).toBeTruthy();
    });
    // Upload mutation must NOT be called yet — only after crop confirm
    expect(mockUploadMutate).not.toHaveBeenCalled();
  });

  it("calls upload mutation when crop dialog is confirmed", async () => {
    render(<ProfilePage />, { wrapper: Wrapper });

    const fileInput = screen.getByLabelText("Select profile photo file");
    const file = new File(["fake-jpeg"], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);

    // Wait for crop dialog to appear (mock renders it)
    const confirmBtn = await screen.findByTestId("crop-confirm");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockUploadMutate).toHaveBeenCalledWith(file, expect.any(Object));
    });
  });

  it("does not call upload mutation when crop dialog is cancelled", async () => {
    render(<ProfilePage />, { wrapper: Wrapper });

    const fileInput = screen.getByLabelText("Select profile photo file");
    const file = new File(["fake-jpeg"], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);

    const cancelBtn = await screen.findByTestId("crop-cancel");
    fireEvent.click(cancelBtn);

    // Dialog should close and upload should NOT have been called
    await waitFor(() => {
      expect(screen.queryByTestId("crop-dialog")).toBeNull();
    });
    expect(mockUploadMutate).not.toHaveBeenCalled();
  });

  it("shows role chip", () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    // Role chip is an MUI Chip — it has the "Admin" role label inside a Chip element
    const chips = screen.getAllByText("Admin");
    // At least one should be a chip (may also appear in name)
    expect(chips.length).toBeGreaterThanOrEqual(1);
  });

  it("shows member since year in date", () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    // Date format varies by locale — just verify year appears
    expect(screen.getByText(/2024/)).toBeTruthy();
  });

  it("renders the UserAvatar component", () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    const avatars = screen.getAllByTestId("user-avatar");
    expect(avatars.length).toBeGreaterThan(0);
  });

  it("renders profile section title", () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    expect(screen.getByText("Profile")).toBeTruthy();
  });

  it("renders account information section", () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    expect(screen.getByText("ACCOUNT INFORMATION")).toBeTruthy();
  });

  it("shows hidden file input", () => {
    render(<ProfilePage />, { wrapper: Wrapper });
    const input = screen.getByLabelText("Select profile photo file");
    expect(input).toBeTruthy();
    expect((input as HTMLInputElement).type).toBe("file");
    expect((input as HTMLInputElement).accept).toContain("image/jpeg");
  });
});
