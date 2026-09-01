/**
 * src/components/ui/__tests__/UserAvatar.test.tsx
 *
 * Tests for the reusable UserAvatar component.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UserAvatar, initialsFor } from "../UserAvatar";

// ── initialsFor ────────────────────────────────────────────────────────────────
describe("initialsFor", () => {
  it("returns first + last initials for a two-word name", () => {
    expect(initialsFor("John Doe")).toBe("JD");
  });

  it("returns single initial for a single-word name", () => {
    expect(initialsFor("Alice")).toBe("A");
  });

  it("returns first + last for multi-word names", () => {
    expect(initialsFor("John Michael Doe")).toBe("JD");
  });

  it("handles empty string gracefully", () => {
    expect(initialsFor("")).toBe("?");
  });

  it("is uppercased", () => {
    expect(initialsFor("john doe")).toBe("JD");
  });
});

// ── UserAvatar component ────────────────────────────────────────────────────────
describe("UserAvatar", () => {
  it("renders initials when no avatarUrl is provided", () => {
    render(<UserAvatar name="Jane Smith" avatarUrl={null} />);
    const avatar = screen.getByTestId("user-avatar");
    expect(avatar).toBeTruthy();
    expect(avatar.textContent).toContain("JS");
  });

  it("renders initials when avatarUrl is undefined", () => {
    render(<UserAvatar name="Bob Jones" />);
    const avatar = screen.getByTestId("user-avatar");
    expect(avatar.textContent).toContain("BJ");
  });

  it("renders an <img> when avatarUrl is provided", () => {
    render(
      <UserAvatar name="Jane Smith" avatarUrl="http://example.com/photo.jpg" />
    );
    const img = screen.queryByRole("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("http://example.com/photo.jpg");
  });

  it("falls back to initials when image fails to load", () => {
    render(
      <UserAvatar name="Jane Smith" avatarUrl="http://example.com/broken.jpg" />
    );
    const img = screen.getByRole("img");
    // Simulate broken image
    fireEvent.error(img);
    // After error, initials should be visible
    const avatar = screen.getByTestId("user-avatar");
    expect(avatar.textContent).toContain("JS");
  });

  it("shows a skeleton when loading=true", () => {
    render(<UserAvatar name="Admin" loading={true} />);
    expect(screen.getByTestId("avatar-skeleton")).toBeTruthy();
  });

  it("does not show skeleton when loading=false", () => {
    render(<UserAvatar name="Admin" loading={false} />);
    expect(screen.queryByTestId("avatar-skeleton")).toBeNull();
  });

  it("applies the correct size (xl)", () => {
    render(<UserAvatar name="Admin" size="xl" />);
    const avatar = screen.getByTestId("user-avatar");
    expect(avatar).toBeTruthy();
  });

  it("renders alt text from name by default", () => {
    render(<UserAvatar name="Test User" avatarUrl="http://example.com/p.jpg" />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("alt")).toBe("Test User profile photo");
  });

  it("renders custom alt text when provided", () => {
    render(
      <UserAvatar
        name="Test User"
        avatarUrl="http://example.com/p.jpg"
        alt="custom alt"
      />
    );
    const img = screen.getByRole("img");
    expect(img.getAttribute("alt")).toBe("custom alt");
  });
});
