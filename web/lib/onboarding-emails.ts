/**
 * Onboarding email content (LAUNCH-PLAN Go-to-market → onboarding emails).
 *
 * Templates only: pure functions returning { subject, text, html }, the same
 * shape as passwordResetEmail in lib/email.ts, so a caller can hand the result
 * straight to sendEmail(). Nothing here sends anything, and nothing calls these
 * yet — wiring them in is an owner decision (RUNBOOK / LAUNCH-PLAN).
 *
 * Copy rules (docs/LAUNCH-PLAN.md): no win rates, ROI, records, testimonials,
 * subscriber counts, earnings or guarantees. Positive expected value describes
 * a price, not a result. 21+ and responsible-gambling wording in every email.
 * lib/onboarding-emails.test.ts enforces the checkable parts of those rules.
 */

export interface EmailContent {
  subject: string
  text: string
  html: string
}

/** Every email links back into the site; the base URL comes from the caller. */
interface BaseEmailInput {
  /** Site origin, e.g. "https://intellabets.com" — no trailing slash needed. */
  appUrl: string
}

export interface WelcomeEmailInput extends BaseEmailInput {
  /** The account's display name. User-supplied, so it is escaped in HTML. */
  name?: string | null
}

/**
 * Marketing (non-transactional) email. US law (CAN-SPAM) requires a working
 * unsubscribe link and a postal address on every commercial message, so both
 * are required by the type: a caller cannot build this email without them.
 */
export interface LifecycleEmailInput extends BaseEmailInput {
  unsubscribeUrl: string
  postalAddress: string
}

const SUPPORT_ADDRESS = "support@intellabets.com"
const RESPONSIBLE_GAMBLING_TEXT =
  "21+ only. Betting involves risk and no outcome is guaranteed. If gambling is causing you harm, call 1-800-GAMBLER (US, 24/7, confidential)."

/** Escape user-supplied text for HTML so a display name cannot inject markup. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function link(appUrl: string, path: string): string {
  return `${appUrl.replace(/\/+$/, "")}${path}`
}

/** First name for a greeting, or a neutral greeting when none is usable. */
function greeting(name?: string | null): string {
  const first = name?.trim().split(/\s+/)[0]
  return first ? `Hi ${first},` : "Hi,"
}

interface LayoutInput {
  heading: string
  paragraphsHtml: string[]
  button?: { label: string; href: string }
  footerExtraHtml?: string
  appUrl: string
}

/** Shared HTML shell so every onboarding email looks and closes the same way. */
function renderLayout({ heading, paragraphsHtml, button, footerExtraHtml, appUrl }: LayoutInput): string {
  const paragraphs = paragraphsHtml
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5">${p}</p>`)
    .join("\n  ")
  const buttonHtml = button
    ? `<p style="margin:0 0 20px"><a href="${button.href}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600">${button.label}</a></p>`
    : ""
  return `<!doctype html>
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
  <h2 style="margin:0 0 16px;font-size:18px">${heading}</h2>
  ${paragraphs}
  ${buttonHtml}
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">
  <p style="margin:0 0 8px;color:#888;font-size:12px;line-height:1.5">${RESPONSIBLE_GAMBLING_TEXT} <a href="${link(appUrl, "/responsible-gambling")}" style="color:#888">Responsible gambling resources</a>.</p>
  <p style="margin:0;color:#888;font-size:12px">IntellaBets is not a sportsbook and does not take bets. &middot; ${SUPPORT_ADDRESS}</p>
  ${footerExtraHtml ?? ""}
</div>`
}

/**
 * Sent once, when an account is created. Transactional: it confirms the
 * account exists and says what the free tools are. No promotional claims.
 */
export function welcomeEmail({ appUrl, name }: WelcomeEmailInput): EmailContent {
  const subject = "Your IntellaBets account is ready"
  const hello = greeting(name)
  const howItWorks = link(appUrl, "/how-it-works")
  const calculator = link(appUrl, "/devig-calculator")
  const dashboard = link(appUrl, "/dashboard")

  const text = [
    hello,
    "",
    "Your IntellaBets account is set up. Here is what IntellaBets actually does, so you know what to expect:",
    "",
    "We compare prices across major sportsbooks, remove each book's built-in margin, and show where the best available price beats the market's own consensus. That is a statement about prices, not a prediction of who wins, and any bet can lose.",
    "",
    `How the method works: ${howItWorks}`,
    `Free no-vig calculator: ${calculator}`,
    `Your dashboard: ${dashboard}`,
    "",
    "If you didn't create this account, reply to this email and we'll remove it.",
    "",
    RESPONSIBLE_GAMBLING_TEXT,
    `IntellaBets is not a sportsbook and does not take bets. - ${SUPPORT_ADDRESS}`,
  ].join("\n")

  const html = renderLayout({
    appUrl,
    heading: "Your IntellaBets account is ready",
    paragraphsHtml: [
      escapeHtml(hello),
      "Here is what IntellaBets actually does, so you know what to expect: we compare prices across major sportsbooks, remove each book's built-in margin, and show where the best available price beats the market's own consensus.",
      "That is a statement about prices, not a prediction of who wins, and any bet can lose.",
      `Start with <a href="${howItWorks}">how the method works</a> or try the free <a href="${calculator}">no-vig calculator</a>.`,
      "If you didn't create this account, reply to this email and we'll remove it.",
    ],
    button: { label: "Go to your dashboard", href: dashboard },
  })

  return { subject, text, html }
}

/**
 * Follow-up a few days after signup: the method, in plain terms. Marketing,
 * so it carries an unsubscribe link and postal address (required by type).
 */
export function methodExplainerEmail({ appUrl, unsubscribeUrl, postalAddress }: LifecycleEmailInput): EmailContent {
  const subject = "How IntellaBets decides what to show you"
  const howItWorks = link(appUrl, "/how-it-works")
  const lineShopping = link(appUrl, "/line-shopping")
  const clv = link(appUrl, "/closing-line-value")

  const text = [
    "Hi,",
    "",
    "A short explanation of how IntellaBets works, in three steps:",
    "",
    "1. Every sportsbook builds a margin into its prices. Add up the implied probabilities on both sides of a market and you get more than 100%; the extra is the margin.",
    "2. We remove that margin from each book's prices and average the results across books. That consensus is our estimate of the fair price.",
    "3. When one book's price beats that consensus, we show it. The edge is a disagreement between books' prices - not a forecast of the result.",
    "",
    "A better price means a win pays more and you need to win less often to break even. It does not make any single bet more likely to win, and no service can guarantee a profit.",
    "",
    `The full explanation: ${howItWorks}`,
    `Why the same bet pays differently at different books: ${lineShopping}`,
    `How to judge prices after the fact (closing line value): ${clv}`,
    "",
    RESPONSIBLE_GAMBLING_TEXT,
    `IntellaBets is not a sportsbook and does not take bets. - ${SUPPORT_ADDRESS}`,
    "",
    `Unsubscribe from these emails: ${unsubscribeUrl}`,
    postalAddress,
  ].join("\n")

  const html = renderLayout({
    appUrl,
    heading: "How IntellaBets decides what to show you",
    paragraphsHtml: [
      "Three steps:",
      "<strong>1.</strong> Every sportsbook builds a margin into its prices. Add up the implied probabilities on both sides of a market and you get more than 100%; the extra is the margin.",
      "<strong>2.</strong> We remove that margin from each book's prices and average the results across books. That consensus is our estimate of the fair price.",
      "<strong>3.</strong> When one book's price beats that consensus, we show it. The edge is a disagreement between books' prices &mdash; not a forecast of the result.",
      "A better price means a win pays more and you need to win less often to break even. It does not make any single bet more likely to win, and no service can guarantee a profit.",
      `More: <a href="${lineShopping}">why the same bet pays differently</a> and <a href="${clv}">closing line value</a>.`,
    ],
    button: { label: "Read how it works", href: howItWorks },
    footerExtraHtml: `<p style="margin:8px 0 0;color:#888;font-size:12px"><a href="${unsubscribeUrl}" style="color:#888">Unsubscribe</a> &middot; ${escapeHtml(postalAddress)}</p>`,
  })

  return { subject, text, html }
}
