# Launch Plan

The single source of truth for what ships next. Both daily automated runs read
this first and update it. **Keep it honest** — a stale plan silently misdirects
every run that follows.

Last full inspection: 2026-09-22.

---

## Where we actually are

The product is built, deployed, and secure. It cannot take money.

| | Status |
|---|---|
| Site live at intellabets.com | ✅ verified |
| Engine live, serving real odds | ✅ verified |
| Revenue bypasses closed | ✅ `POST /api/premium`, `/api/subscriptions` → 404 |
| Private betslips protected | ✅ signed-out requests leak nothing |
| Legal + pricing pages public | ✅ required for store review and underwriting |
| Security headers, CORS allowlist | ✅ verified live |
| **Payment processing** | ❌ **no processor — this is the blocker** |
| Support chat | ❌ Anthropic key invalid |
| Rate limiting enforced | ⚠️ needs the `RateLimit` table in Neon |
| Mobile apps | ❌ Expo shell only, no screens |

**One sentence: everything works except the part that collects money.**

---

## P0 — blocks revenue

Nothing else matters until these are done.

### 1. Payment processor
Stripe terminated the account. Recommended: **2Accept** (https://2accept.com) —
they underwrite sports handicapping specifically, work with merchants terminated
by Stripe/PayPal, and support recurring billing.

Needs: business formation docs, a bank statement, the live site (done), and
**Stripe's termination reason code** — ask Stripe directly. "I don't know" reads
far worse to an underwriter than any actual reason.

Expect 3–10 business days and a 5–10% rolling reserve held 90–180 days.

Backups if declined: PaymentCloud, Soar Payments. Apply to one at a time —
parallel applications look like shopping for lax underwriting.

**Crypto in parallel:** NOWPayments, as a second rail. Different customers, and
no single point of failure this time.

### 2. Delete the dead Stripe key
`STRIPE_SECRET_KEY` still sits in Vercel. If it is well-formed but revoked,
checkout attempts a Stripe call and returns 500 rather than the clean 503 the
code has for "no processor". Delete it until a real processor is live.

### 3. Build the processor integration
Once approved, the webhook handler needs, *before* taking a single payment:
- **Idempotency** — a processed-events table. Retried webhooks must not double-grant or double-pay.
- **Refunds and disputes** — revoke access on refund; handle chargebacks.
- **Renewals** — already handled for Stripe's shape; re-verify against the new processor's events.
- **Crypto confirmations** — NOWPayments confirms over blocks, not instantly. Access is granted on confirmation, never on submission.

---

## P1 — before promoting

| Item | Why |
|---|---|
| Fix `ANTHROPIC_API_KEY` | Support chat is the customer's only live help channel |
| Create the `RateLimit` table | Limits fail open until it exists; `/api/support/chat` spends tokens per call |
| Let CLV accumulate | Settlement bug fixed; old rows still wrong. No performance claims until a clean sample exists |
| Terms: refund policy | Underwriters read it. Must match what the processor actually does |
| Error monitoring | Currently blind to runtime errors in production |

---

## P2 — growth

- Mobile apps (Expo shell → real screens → store submission)
- SharpSports integration for automatic bet tracking
- Tipster payouts (Stripe Connect was built, then obsoleted — needs rebuilding on the new processor)
- Email (transactional first, then lifecycle)

---

## Go-to-market

**Position on method, not on results.** Every competitor claims a win rate.
Almost none explain where their edge comes from, and the ones that do are
credible. That asymmetry is the opening — and it is also the only honest option
available, because there is no track record to point at yet.

The claim is: *"We compare every major sportsbook, strip out their margin, and
show you where the best available price beats the market's own consensus. That
gap is the entire product."* Checkable, true, and explains why the service has
value even on a losing night.

**Never:** invented win rates, fabricated testimonials, income projections,
"guaranteed" anything. That is what killed the Stripe account, and a payment
underwriter reviewing the site will be looking for exactly it.

### Content to build (repo-first — these are files, not chat output)

- [ ] **How it works** — de-vig explained plainly, with a worked example. The core asset; everything else links to it.
- [ ] **Why we don't publish a win rate** — turns the biggest objection into a credibility argument
- [ ] **CLV explainer** — what it is, why it's the honest scoreboard
- [ ] **FAQ** — is this legal (yes, it's analysis), do you take bets (no), what if I lose
- [ ] **Onboarding emails** — welcome, first pick walkthrough, how to read a caveat
- [ ] **SEO metadata** — titles, descriptions, OG tags per page
- [ ] **Responsible gambling page** — 18+, limits, self-exclusion resources

### Channels, in order of fit

1. **r/sportsbook and betting forums** — sharp audience, allergic to hype, receptive to method. Participate honestly; do not spam picks.
2. **Long-form SEO** — "de-vig calculator", "closing line value", "line shopping" have real intent and weak incumbents.
3. **YouTube/TikTok explainers** — showing the vig calculation on a real slate is inherently demonstrable.
4. **Paid** — last. Do not pay for traffic to a page that can't take payment.

### Pricing

Live in code: Premium and standalone AI. Before promoting, confirm the tiers on
`/premium` match what the processor will actually charge, and that the refund
policy in the terms matches what the processor will actually do.

---

## Open questions for the owner

1. Stripe's termination reason code — needed for the 2Accept application
2. Business entity and bank account — are formation docs ready to submit?
3. Launch target date, to work backwards from

---

## Working agreement for the automated runs

- **Morning:** inspect, fix, verify against production, advance one P0/P1 item.
- **Evening:** verify the day's claims actually hold in production, confirm the money path, advance one go-to-market item.
- Both end with **THINGS I NEED YOU TO DO** — numbered, specific, linked.
- A fix is not done until the live endpoint proves it. A green build is not evidence.
- Update this file when status changes. It is the only memory between runs.
