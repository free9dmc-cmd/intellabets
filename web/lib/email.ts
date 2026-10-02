/**
 * Transactional email.
 *
 * Uses Resend's HTTP API directly rather than an SDK: it is one POST, and this
 * project does not need another dependency to send one kind of message.
 *
 * Returns a result rather than throwing, because every caller here has to
 * behave correctly when email is unconfigured. Password reset in particular
 * must return the same response to the user whether or not a message went out
 * -- otherwise the response itself reveals whether an address has an account.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails"

export type EmailResult =
  | { ok: true }
  | { ok: false; reason: "unconfigured" | "failed"; detail: string }

export function isEmailConfigured(): boolean {
  const key = process.env.RESEND_API_KEY?.trim()
  return Boolean(key && key.startsWith("re_"))
}

/** The From address. Must be on a domain verified with the email provider. */
function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || "IntellaBets <support@intellabets.com>"
}

export async function sendEmail(opts: {
  to: string
  subject: string
  text: string
  html?: string
}): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key || !key.startsWith("re_")) {
    return {
      ok: false,
      reason: "unconfigured",
      detail: "RESEND_API_KEY is not set or malformed - no email was sent",
    }
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
      }),
    })

    if (!res.ok) {
      // Read the body: the provider says why, and "domain not verified" is by
      // far the most common cause of a silent reset-email failure.
      const body = await res.text().catch(() => "")
      return { ok: false, reason: "failed", detail: `${res.status}: ${body.slice(0, 300)}` }
    }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      reason: "failed",
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

/** The reset email. Plain text and HTML, since some clients get only one. */
export function passwordResetEmail(resetUrl: string, expiresInMinutes: number) {
  const text = [
    "Someone asked to reset the password on your IntellaBets account.",
    "",
    `Open this link to choose a new one (it expires in ${expiresInMinutes} minutes and works once):`,
    resetUrl,
    "",
    "If that wasn't you, ignore this email. Your password has not changed and",
    "nobody can use this link without opening it from your inbox.",
    "",
    "IntellaBets - support@intellabets.com",
  ].join("\n")

  const html = `<!doctype html>
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <h2 style="margin:0 0 16px;font-size:18px">Reset your IntellaBets password</h2>
  <p style="margin:0 0 16px;line-height:1.5">
    Someone asked to reset the password on your account. Choose a new one here:
  </p>
  <p style="margin:0 0 20px">
    <a href="${resetUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600">Choose a new password</a>
  </p>
  <p style="margin:0 0 16px;line-height:1.5;color:#555;font-size:14px">
    This link expires in ${expiresInMinutes} minutes and can be used once.
  </p>
  <p style="margin:0;line-height:1.5;color:#555;font-size:14px">
    If that wasn't you, ignore this email. Your password has not changed.
  </p>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">
  <p style="margin:0;color:#888;font-size:12px">IntellaBets &middot; support@intellabets.com</p>
</div>`

  return { text, html }
}
