import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { ShareModal } from "./ShareModal";

const { mockUser } = vi.hoisted(() => ({
  mockUser: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: mockUser() }),
}));

vi.mock("../api", () => ({
  getDrawingSharing: vi.fn(),
  resolveShareUsers: vi.fn(),
  isAxiosError: vi.fn(() => false),
}));

describe("ShareModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.mockReturnValue({
      id: "owner-1",
      name: "Owner",
      email: "owner@example.com",
    });
    vi.mocked(api.getDrawingSharing).mockResolvedValue({
      permissions: [],
      linkShares: [],
    });
    vi.mocked(api.resolveShareUsers).mockResolvedValue([
      { id: "user-2", name: "Keith", email: "keith@example.com" },
    ]);
  });

  it("searches for share candidates after one character", async () => {
    render(
      <ShareModal
        drawingId="drawing-1"
        drawingName="Bookkeeping"
        isOpen
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Add people"), {
      target: { value: "k" },
    });

    await waitFor(() => {
      expect(api.resolveShareUsers).toHaveBeenCalledWith("drawing-1", "k");
    });
    expect(await screen.findByText("Keith")).toBeInTheDocument();
  });
});
