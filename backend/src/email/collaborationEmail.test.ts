import { describe, expect, it, vi } from "vitest";
import {
  createCollaborationEmailNotifier,
  shouldSendJoinAlert,
  shouldSendShareInvitation,
} from "./collaborationEmail";

const successfulFetch = () =>
  vi.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;

describe("collaboration email notifier", () => {
  it("sends a drawing invitation through Resend", async () => {
    const fetchImpl = successfulFetch();
    const notifier = createCollaborationEmailNotifier({
      apiKey: "resend-test-key",
      from: "excalidash@example.com",
      frontendUrl: "https://draw.example.com",
      fetchImpl,
    });

    const sent = await notifier.sendShareInvitation({
      drawingId: "drawing-1",
      drawingName: "Books & records",
      inviterName: "Om",
      permission: "edit",
      recipientEmail: "keith@example.com",
      recipientName: "Keith",
      permissionId: "permission-1",
    });

    expect(sent).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, request] = vi.mocked(fetchImpl).mock.calls[0];
    expect(request?.headers).toEqual(expect.objectContaining({
      Authorization: "Bearer resend-test-key",
      "Idempotency-Key": "drawing-share/permission-1",
    }));
    expect(JSON.parse(String(request?.body))).toEqual(expect.objectContaining({
      from: "ExcaliDash <excalidash@example.com>",
      to: ["keith@example.com"],
      subject: "Om shared Books & records with you",
    }));
    expect(String(request?.body)).toContain("Books &amp; records");
    expect(String(request?.body)).toContain("https://draw.example.com/editor/drawing-1");
    expect(String(request?.body)).toContain("New drawing invitation");
    expect(String(request?.body)).toContain("ExcaliDash collaboration notification");
    expect(String(request?.body)).not.toContain("email settings");
  });

  it("limits join alerts by drawing and collaborator", async () => {
    const fetchImpl = successfulFetch();
    let currentTime = 10_000;
    const notifier = createCollaborationEmailNotifier({
      apiKey: "resend-test-key",
      from: "excalidash@example.com",
      fetchImpl,
      joinCooldownMs: 1_000,
      now: () => currentTime,
    });
    const input = {
      drawingId: "drawing-1",
      drawingName: "Bookkeeping",
      joiningUserKey: "user-2",
      joiningUserName: "Keith",
      recipientEmail: "owner@example.com",
      recipientName: "Om",
    };

    expect(await notifier.sendJoinAlert(input)).toBe(true);
    expect(await notifier.sendJoinAlert(input)).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, firstRequest] = vi.mocked(fetchImpl).mock.calls[0];
    expect(String(firstRequest?.body)).toContain("Live collaboration activity");
    expect(String(firstRequest?.body)).toContain("Keith joined your drawing.");
    expect(String(firstRequest?.body)).not.toContain("email settings");

    currentTime += 1_001;
    expect(await notifier.sendJoinAlert(input)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("allows a failed join alert to retry", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, status: 200 }) as unknown as typeof fetch;
    const notifier = createCollaborationEmailNotifier({
      apiKey: "resend-test-key",
      from: "excalidash@example.com",
      fetchImpl,
    });
    const input = {
      drawingId: "drawing-1",
      drawingName: "Bookkeeping",
      joiningUserKey: "user-2",
      joiningUserName: "Keith",
      recipientEmail: "owner@example.com",
      recipientName: "Om",
    };

    expect(await notifier.sendJoinAlert(input)).toBe(false);
    expect(await notifier.sendJoinAlert(input)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("treats missing preferences as enabled and explicit false as disabled", () => {
    expect(shouldSendShareInvitation(null)).toBe(true);
    expect(shouldSendJoinAlert("{}" )).toBe(true);
    expect(shouldSendShareInvitation('{"emailShareInvitations":false}')).toBe(false);
    expect(shouldSendJoinAlert('{"emailCollaborationJoins":false}')).toBe(false);
  });
});
