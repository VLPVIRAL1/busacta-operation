/**
 * E-signature email delivery.
 *
 * Sends via the shared Resend helper (`src/lib/email/send.server.ts`). If email
 * isn't configured (no RESEND_API_KEY), `sendEmail` throws — the caller should
 * treat this as non-fatal: the signing link is still returned to the operator
 * via the API response so they can copy + send manually.
 */

export type SignerEmailInput = {
  to: string;
  full_name: string | null;
  envelope_title: string;
  envelope_message: string | null;
  signing_url: string;
  is_reminder: boolean;
  /** Optional per-firm sender display name (e.g. "Viral Patel & Co"). */
  sender_name?: string | null;
  /** Optional per-firm reply-to email. */
  reply_to?: string | null;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(input: SignerEmailInput): string {
  const heading = input.is_reminder ? "Reminder: please sign" : "You've been asked to sign";
  const greeting = input.full_name ? `Hi ${esc(input.full_name)},` : "Hi,";
  const sender = input.sender_name?.trim();
  const fromLine = sender
    ? `<p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.5">From <strong style="color:#0f172a">${esc(sender)}</strong> via BusAcTa Operations.</p>`
    : "";
  const message = input.envelope_message
    ? `<p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.5">${esc(input.envelope_message)}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Inter,Arial,sans-serif;color:#0f172a">
    <table width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;padding:32px 16px">
      <tr><td align="center">
        <table width="100%" style="max-width:520px" cellspacing="0" cellpadding="0">
          <tr><td>
            <h1 style="font-size:20px;margin:0 0 8px">${heading}</h1>
            <p style="margin:0 0 8px;color:#0f172a;font-size:14px">${greeting}</p>
            <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.5">
              <strong style="color:#0f172a">${esc(input.envelope_title)}</strong> is ready for your signature${sender ? "" : " on BusAcTa Operations"}.
            </p>
            ${fromLine}
            ${message}
            <p style="margin:24px 0;text-align:center">
              <a href="${input.signing_url}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:14px">Review &amp; sign</a>
            </p>
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5">
              If the button doesn't work, paste this link into your browser:<br/>
              <span style="word-break:break-all;color:#64748b">${input.signing_url}</span>
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

export async function sendSignerLinkEmail(input: SignerEmailInput): Promise<void> {
  const { sendEmail } = await import("@/lib/email/send.server");
  const subject = input.is_reminder
    ? `Reminder: please sign "${input.envelope_title}"`
    : `Please sign "${input.envelope_title}"`;
  await sendEmail({
    to: input.to,
    subject,
    html: renderHtml(input),
    fromName: input.sender_name ?? undefined,
    replyTo: input.reply_to ?? undefined,
  });
}
