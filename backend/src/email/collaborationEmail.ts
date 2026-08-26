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

const renderCompactEmail = ({
  title,
  summary,
  drawingName,
  drawingMeta,
  drawingUrl,
  icon,
}: {
  title: string;
  summary: string;
  drawingName: string;
  drawingMeta: string;
  drawingUrl: string;
  icon: string;
}): string => {
  const safeUrl = escapeHtml(drawingUrl);
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f1f3f6;color:#111827;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f1f3f6;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #d7dce5;border-radius:10px;overflow:hidden;">
        <tr><td style="padding:18px 24px;background:#111827;color:#ffffff;font-size:16px;font-weight:700;line-height:22px;">ExcaliDash</td></tr>
        <tr><td style="padding:28px 24px 20px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td width="52" valign="top" style="width:52px;">
                <div style="width:38px;height:38px;border:1px solid #c7d2fe;border-radius:20px;background:#eef2ff;color:#4f46e5;text-align:center;font-size:20px;font-weight:700;line-height:38px;">${escapeHtml(icon)}</div>
              </td>
              <td valign="top">
                <div style="font-size:20px;font-weight:700;line-height:26px;color:#111827;">${escapeHtml(title)}</div>
                <div style="padding-top:5px;font-size:14px;line-height:21px;color:#526078;">${escapeHtml(summary)}</div>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;background:#f7f8fa;border-left:3px solid #5b4ff5;">
            <tr><td style="padding:14px 16px 4px;font-size:15px;font-weight:700;line-height:21px;color:#111827;">${escapeHtml(drawingName)}</td></tr>
            <tr><td style="padding:0 16px 14px;font-size:12px;line-height:18px;color:#526078;">${escapeHtml(drawingMeta)}</td></tr>
          </table>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;">
            <tr><td style="border-radius:6px;background:#5648e8;"><a href="${safeUrl}" style="display:inline-block;padding:11px 18px;color:#ffffff;font-size:14px;font-weight:700;line-height:18px;text-decoration:none;">Open drawing</a></td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:14px 24px;border-top:1px solid #e4e7ec;color:#8490a5;font-size:11px;line-height:16px;">ExcaliDash collaboration notification</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

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
      const html = renderCompactEmail({
        title: "New drawing invitation",
        summary: `${input.inviterName} gave you ${accessLabel} access.`,
        drawingName: input.drawingName,
        drawingMeta: `Shared with ${input.recipientName} · Can ${accessLabel}`,
        drawingUrl,
        icon: "+",
      });
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
      const html = renderCompactEmail({
        title: "Live collaboration activity",
        summary: `${input.joiningUserName} joined your drawing.`,
        drawingName: input.drawingName,
        drawingMeta: `${input.joiningUserName} · Active now`,
        drawingUrl,
        icon: "•",
      });
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
