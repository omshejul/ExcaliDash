import crypto from "crypto";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const DEFAULT_JOIN_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const SEND_TIMEOUT_MS = 10_000;

export type ShareInvitationEmail = {
  drawingId: string;
  drawingName: string;
  inviterName: string;
  permission: "view" | "edit";
  recipientEmail: string;
  recipientName: string;
  permissionId: string;
};

export type JoinAlertEmail = {
  drawingId: string;
  drawingName: string;
  joiningUserKey: string;
  joiningUserName: string;
  recipientEmail: string;
  recipientName: string;
};

export type CollaborationEmailNotifier = {
  enabled: boolean;
  sendShareInvitation: (input: ShareInvitationEmail) => Promise<boolean>;
  sendJoinAlert: (input: JoinAlertEmail) => Promise<boolean>;
};

type CreateNotifierOptions = {
  apiKey?: string | null;
  from?: string | null;
  frontendUrl?: string | null;
  joinCooldownMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>'"]/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return replacements[character];
  });

const safeHeaderText = (value: string): string =>
  value.replace(/[\r\n]+/g, " ").trim();

const resolveFrontendUrl = (raw: string | null | undefined): string => {
  const first = raw?.split(",")[0]?.trim() || "http://localhost:6767";
  const withProtocol = /^https?:\/\//i.test(first) ? first : `https://${first}`;
  return withProtocol.replace(/\/$/, "");
};

const parsePreference = (
  raw: string | null | undefined,
  key: "emailShareInvitations" | "emailCollaborationJoins",
): boolean => {
  if (!raw) return true;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed[key] !== false;
  } catch {
    return true;
  }
};

export const shouldSendShareInvitation = (preferences?: string | null) =>
  parsePreference(preferences, "emailShareInvitations");

export const shouldSendJoinAlert = (preferences?: string | null) =>
  parsePreference(preferences, "emailCollaborationJoins");

export const createCollaborationEmailNotifier = ({
  apiKey,
  from,
  frontendUrl,
  joinCooldownMs = DEFAULT_JOIN_COOLDOWN_MS,
  fetchImpl = fetch,
  now = Date.now,
}: CreateNotifierOptions = {}): CollaborationEmailNotifier => {
  const resolvedApiKey = apiKey?.trim() || "";
  const resolvedFrom = from?.trim() || "";
  const baseUrl = resolveFrontendUrl(frontendUrl);
  const enabled = Boolean(resolvedApiKey && resolvedFrom);
  const joinCooldowns = new Map<string, number>();

  const send = async ({
    to,
    subject,
    text,
    html,
    idempotencyKey,
  }: {
    to: string;
    subject: string;
    text: string;
    html: string;
    idempotencyKey: string;
  }): Promise<boolean> => {
    if (!enabled) return false;
    try {
      const response = await fetchImpl(RESEND_EMAILS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resolvedApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.slice(0, 256),
          "User-Agent": "ExcaliDash/1.0",
        },
        body: JSON.stringify({
          from: `ExcaliDash <${resolvedFrom}>`,
          to: [to],
          subject: safeHeaderText(subject),
          text,
          html,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!response.ok) {
        console.error("[email] Resend rejected collaboration email", {
          status: response.status,
        });
        return false;
      }
      return true;
    } catch (error) {
      console.error("[email] Failed to send collaboration email", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  };

  return {
    enabled,
    async sendShareInvitation(input) {
      const drawingUrl = `${baseUrl}/editor/${encodeURIComponent(input.drawingId)}`;
      const accessLabel = input.permission === "edit" ? "edit" : "view";
      const subject = `${input.inviterName} shared ${input.drawingName} with you`;
      const text = `${input.inviterName} invited you to ${accessLabel} "${input.drawingName}" in ExcaliDash. Open it: ${drawingUrl}`;
      const html = `<p>Hi ${escapeHtml(input.recipientName)},</p><p><strong>${escapeHtml(input.inviterName)}</strong> invited you to ${accessLabel} <strong>${escapeHtml(input.drawingName)}</strong> in ExcaliDash.</p><p><a href="${escapeHtml(drawingUrl)}">Open drawing</a></p>`;
      return send({
        to: input.recipientEmail,
        subject,
        text,
        html,
        idempotencyKey: `drawing-share/${input.permissionId}`,
      });
    },
    async sendJoinAlert(input) {
      const cooldownKey = `${input.drawingId}:${input.joiningUserKey}`;
      const currentTime = now();
      const lastSentAt = joinCooldowns.get(cooldownKey);
      if (lastSentAt !== undefined && currentTime - lastSentAt < joinCooldownMs) {
        return false;
      }
      joinCooldowns.set(cooldownKey, currentTime);

      const drawingUrl = `${baseUrl}/editor/${encodeURIComponent(input.drawingId)}`;
      const subject = `${input.joiningUserName} joined ${input.drawingName}`;
      const text = `${input.joiningUserName} joined "${input.drawingName}" in ExcaliDash. Open it: ${drawingUrl}`;
      const html = `<p>Hi ${escapeHtml(input.recipientName)},</p><p><strong>${escapeHtml(input.joiningUserName)}</strong> joined <strong>${escapeHtml(input.drawingName)}</strong> in ExcaliDash.</p><p><a href="${escapeHtml(drawingUrl)}">Open drawing</a></p>`;
      const bucket = Math.floor(currentTime / joinCooldownMs);
      const stableUserKey = crypto
        .createHash("sha256")
        .update(input.joiningUserKey)
        .digest("hex")
        .slice(0, 24);
      const sent = await send({
        to: input.recipientEmail,
        subject,
        text,
        html,
        idempotencyKey: `drawing-join/${input.drawingId}/${stableUserKey}/${bucket}`,
      });
      if (!sent) joinCooldowns.delete(cooldownKey);
      return sent;
    },
  };
};

export const collaborationEmailNotifier = createCollaborationEmailNotifier({
  apiKey: process.env.RESEND_KEY,
  from: process.env.DOMAIN,
  frontendUrl: process.env.FRONTEND_URL,
  joinCooldownMs: (() => {
    const parsed = Number(process.env.EMAIL_JOIN_COOLDOWN_MS);
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_JOIN_COOLDOWN_MS;
  })(),
});
