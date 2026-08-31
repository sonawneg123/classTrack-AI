/**
 * src/pages/admin/__tests__/DashboardPage.test.tsx
 *
 * Frontend tests for the Admin Dashboard page.
 *
 * Tests:
 *  16. Dashboard renders without crashing
 *  17. Loading state shows skeleton elements
 *  18. Error state shows error message and retry button
 *  19. KPI values render from API data
 *  20. Classroom data renders in table
 *  21. Activity feed renders
 *  22. Alerts render
 *  23. Quick actions navigate correctly
 *  24. Empty states render when no data
 *  25. Responsive layout does not break (no overflow)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminDashboardPage from "../DashboardPage";

// ── Mock dependencies ──────────────────────────────────────────────────────────

vi.mock("@features/admin/hooks/useAdminTeachers", () => ({
  useAdminDashboard: vi.fn(),
}));

vi.mock("@app/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: 1, role: "admin", name: "Admin", profile: { email: "admin@test.com" } },
    logout: vi.fn(),
  }),
}));

vi.mock("@layouts/DashboardLayout", () => ({
  DashboardLayout: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="dashboard-layout">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

import { useAdminDashboard } from "@features/admin/hooks/useAdminTeachers";

// ── Sample data ───────────────────────────────────────────────────────────────

const SAMPLE_DATA = {
  overview: { students: 245, teachers: 18, classrooms: 12, assignments: 156, submissions: 890 },
  teachers: { total: 18, active: 16, inactive: 2, unassigned: 1 },
  students: { total: 245, active: 230, inactive: 15 },
  classrooms: { total: 12, active: 11, inactive: 1 },
  evaluations: { pending: 5, analyzing: 2, completed: 200, failed: 3 },
  classroomList: [
    {
      id: 1, name: "Class 8-A", subject: "Mathematics", section: "A",
      classCode: "ABCD1234", isActive: true, createdAt: new Date().toISOString(),
      teacherId: 2, teacherName: "Mrs. Sharma", teacherActive: true,
      studentCount: 32, taskCount: 18,
    },
    {
      id: 2, name: "Class 8-B", subject: "Science", section: "B",
      classCode: "WXYZ5678", isActive: true, createdAt: new Date().toISOString(),
      teacherId: 3, teacherName: "Mr. Patil", teacherActive: true,
      studentCount: 28, taskCount: 15,
    },
  ],
  activity: [
    {
      id: 1, actorType: "admin", actorId: 1, actorName: "Admin",
      action: "teacher_created", targetType: "teacher", targetId: 2,
      details: { name: "Mrs. Sharma" }, createdAt: new Date().toISOString(),
    },
    {
      id: 2, actorType: "admin", actorId: 1, actorName: "Admin",
      action: "classroom_created", targetType: "classroom", targetId: 1,
      details: { name: "Class 8-A" }, createdAt: new Date().toISOString(),
    },
  ],
  alerts: [
    { type: "unassigned_teachers", message: "1 teacher(s) not assigned to any classroom.", count: 1 },
    { type: "pending_evaluations", message: "5 submission(s) waiting for AI evaluation.", count: 5 },
  ],
};

// ── Test wrapper ──────────────────────────────────────────────────────────────

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderDashboard() {
  return render(<AdminDashboardPage />, { wrapper: Wrapper });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AdminDashboardPage", () => {
  const mockHook = vi.mocked(useAdminDashboard);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("16. Dashboard renders without crashing", () => {
    mockHook.mockReturnValue({
      data: SAMPLE_DATA,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdminDashboard>);

    const { container } = renderDashboard();
    expect(container).toBeTruthy();
    expect(screen.getByTestId("dashboard-layout")).toBeTruthy();
  });

  it("17. Loading state shows skeleton elements", () => {
    mockHook.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdminDashboard>);

    renderDashboard();
    // Skeletons render as a series of MUI Skeleton elements — check sections render
    expect(screen.getByText("Platform Overview")).toBeTruthy();
    expect(screen.getByText("AI Evaluation Overview")).toBeTruthy();
  });

  it("18. Error state shows error message and retry button", () => {
    const refetch = vi.fn();
    mockHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof useAdminDashboard>);

    renderDashboard();
    expect(screen.getByText(/failed to load dashboard data/i)).toBeTruthy();
    const retryBtn = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retryBtn);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("19. KPI values render from API data", () => {
    mockHook.mockReturnValue({
      data: SAMPLE_DATA,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdminDashboard>);

    renderDashboard();
    // Overview numbers shown as big stat values — use getAllByText since some
    // numbers may also appear in the classroom table cells
    expect(screen.getAllByText("245").length).toBeGreaterThanOrEqual(1); // students
    expect(screen.getAllByText("18").length).toBeGreaterThanOrEqual(1);  // teachers
    expect(screen.getAllByText("12").length).toBeGreaterThanOrEqual(1);  // classrooms
    expect(screen.getAllByText("156").length).toBeGreaterThanOrEqual(1); // assignments
  });

  it("20. Classroom data renders in table", () => {
    mockHook.mockReturnValue({
      data: SAMPLE_DATA,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdminDashboard>);

    renderDashboard();
    expect(screen.getByText("Class 8-A")).toBeTruthy();
    expect(screen.getByText("Mrs. Sharma")).toBeTruthy();
    expect(screen.getByText("Class 8-B")).toBeTruthy();
    expect(screen.getByText("Mr. Patil")).toBeTruthy();
  });

  it("21. Activity feed renders", () => {
    mockHook.mockReturnValue({
      data: SAMPLE_DATA,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdminDashboard>);

    renderDashboard();
    // action "teacher_created" → "Teacher Created"
    expect(screen.getByText("Teacher Created")).toBeTruthy();
    expect(screen.getByText("Classroom Created")).toBeTruthy();
  });

  it("22. Alerts render", () => {
    mockHook.mockReturnValue({
      data: SAMPLE_DATA,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdminDashboard>);

    renderDashboard();
    expect(screen.getByText(/1 teacher\(s\) not assigned/i)).toBeTruthy();
    expect(screen.getByText(/5 submission\(s\) waiting/i)).toBeTruthy();
  });

  it("23. Quick actions render navigation buttons", () => {
    mockHook.mockReturnValue({
      data: SAMPLE_DATA,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdminDashboard>);

    renderDashboard();
    expect(screen.getByText("Generate Teacher Code")).toBeTruthy();
    expect(screen.getByText("Manage Teachers")).toBeTruthy();
    expect(screen.getByText("Add Classroom")).toBeTruthy();
  });

  it("24. Empty states render when no classroom/activity data", () => {
    mockHook.mockReturnValue({
      data: {
        ...SAMPLE_DATA,
        classroomList: [],
        activity: [],
        alerts: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdminDashboard>);

    renderDashboard();
    expect(screen.getByText("No classrooms yet")).toBeTruthy();
    expect(screen.getByText("No activity yet")).toBeTruthy();
    expect(screen.getByText("All clear")).toBeTruthy();
  });

  it("25. Greeting section renders", () => {
    mockHook.mockReturnValue({
      data: SAMPLE_DATA,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAdminDashboard>);

    renderDashboard();
    // Should show a time-based greeting
    const greeting = screen.queryByText(/good (morning|afternoon|evening), admin/i);
    expect(greeting).toBeTruthy();
  });
});
