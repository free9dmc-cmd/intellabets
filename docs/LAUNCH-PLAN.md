# Launch Plan

The single source of truth for what ships next. Both daily automated runs read
this first and update it. **Keep it honest** — a stale plan silently misdirects
every run that follows.

Last full inspection: 2026-09-24 (evening run). No commits landed on `main`
today before this run — the scheduled morning run left no trace (no commits
since 65322e9 on 2026-09-22, and this file was still dated 2026-09-22),
so whatever it inspected was not verified against production and did not
change anything. Treat its earlier "everything works except payment" verdict
below as **not current** — it missed the item at the top of P0.

---

## Where we actually are

The product is built and deployed. It cannot take money, and right now it
cannot even let anyone sign up.

| | Status |
|---|---|
| **Login and registration** | ❌ **broken in production — see P0.1. Nobody can create an account or log in.** |
| Site live at intellabets.com | ✅ verified |
| Engine live, serving real odds | ✅ verified |
| Revenue bypasses closed | ✅ `POST /api/premium`, `/api/subscriptions` → 404 |
| Checkout fails safely when unauthenticated | ✅ `POST /api/checkout` → 401 (code inspection: falls through to a clean 503 once authenticated, if `STRIPE_SECRET_KEY` is absent/malformed — **not re-verified live**, since no account could be created to test it authenticated) |
| Private betslips protected | ✅ signed-out requests leak nothing |
| Legal + pricing pages public | ✅ required for store review and underwriting |
| Security headers, CORS allowlist | ✅ verified live |
| **Payment processing** | ❌ **no processor** |
| Support chat | ❌ Anthropic key invalid (unverified today — could not reach `/api/admin/health`, itself blocked by the same DB drift) |
| Rate limiting enforced | ⚠️ needs the `RateLimit` table in Neon |
| Mobile apps | ❌ Expo shell only, no screens |

**One sentence: the funnel is dead at the front door, before payment even enters the picture.**

---

## P0 — blocks revenue

Nothing else matters until these are done, in this order — #1 first, since
nothing downstream of it is reachable.

### 1. Fix the broken database schema — login and registration are down
Confirmed live on 2026-09-24:
- `POST /api/register` with valid, unique input → 500 `{"error":"Failed to create account"}`
- `POST /api/auth/callback/credentials` with any credentials → NextAuth error URL containing
  `The column User.premiumStripeSubId does not exist in the current database`

Root cause: `User.premiumStripeSubId` (and likely `User.payoutsEnabled`) were
added to `web/prisma/schema.prisma` in commit `26e6abf` on **2026-09-10** and
never applied to the production Neon database with `prisma db push`. Every
Prisma query that touches the full `User` row — which includes both login and
registration — has been failing since. This has nothing to do with the
payment processor; it means **no new user has been able to sign up, and no
existing user has been able to log in fresh, for two weeks.**

This run could not fix it directly: the fix needs the production
`DATABASE_URL`, which is a Vercel secret this run has no access to. See
"Open questions for the owner" below — this is now #1 there, not the Stripe
termination code.

Fix, once someone with Vercel/Neon access is available:
1. Open the Neon dashboard → the project backing `DATABASE_URL` → SQL Editor, and run whatever `prisma db push` would generate for the current schema (safest: pull the real `DATABASE_URL` from Vercel and run `cd web && npx prisma db push` locally — it reconciles all drift in one shot, including the `RateLimit` table below).
2. Re-verify: `curl -s -X POST https://intellabets.com/api/register -d '{"name":"t","email":"t@example.com","username":"testuser1","password":"testpass123"}' -H 'Content-Type: application/json'` should return 201, not 500.
3. Then re-check `GET /api/admin/health` (now checks for this exact class of drift — see `web/app/api/admin/health/route.ts`).

### 2. Payment processor
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

### 3. Delete the dead Stripe key
`STRIPE_SECRET_KEY` still sits in Vercel. If it is well-formed but revoked,
checkout attempts a Stripe call and returns 500 rather than the clean 503 the
code has for "no processor". Delete it until a real processor is live.

### 4. Build the processor integration
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

- [x] **How it works** — `/how-it-works`, shipped 2026-09-24. De-vig explained with a worked numeric example (labeled illustrative, not a real game), why we don't publish a win rate, and an FAQ (legal, do we take bets, what if you lose). Linked from the homepage nav, homepage footer, and the picks-page caveat.
- [x] **Why we don't publish a win rate** — folded into `/how-it-works` rather than a separate page, since it's the natural next paragraph after the de-vig explanation.
- [ ] **CLV explainer** — what it is, why it's the honest scoreboard. `/how-it-works` mentions CLV briefly; a dedicated page with a worked example (mirroring the de-vig one) is still open. **Do not add a live average to it** — the CLV sample is still too small and too new (see Known issues in RUNBOOK.md).
- [x] **FAQ** — folded into `/how-it-works` (see above) rather than a separate page.
- [ ] **Onboarding emails** — still open. Blocked in practice: there's no transactional email sending configured yet (P1), and no new users are being created right now (P0.1), so nothing would trigger them today anyway.
- [x] **SEO metadata** — `/how-it-works` has full metadata + OG tags; added `app/sitemap.ts` and `app/robots.ts` (Next.js auto-generates `/sitemap.xml` and `/robots.txt` from these), listing only routes actually public per `middleware.ts`. Per-page metadata on the other marketing pages (terms/privacy/contact/premium) already existed before this run.
- [ ] **Responsible gambling page** — still open as a *dedicated* page. 18+ and responsible-gambling wording already exists on the homepage footer, `/contact`, `/terms`, and now `/how-it-works`'s footer, all linking out to ncpgambling.org — a standalone page with self-exclusion resources per state/country is the remaining gap, useful for underwriting.

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

1. **Vercel/Neon access to fix P0.1** — someone needs to pull the production `DATABASE_URL` from Vercel (Project → intellabets → Settings → Environment Variables) and run `prisma db push` against it, or run the equivalent DDL in Neon's SQL Editor. This run had no credentials to do it and login/registration stay broken until it happens.
2. Stripe's termination reason code — needed for the 2Accept application
3. Business entity and bank account — are formation docs ready to submit?
4. Launch target date, to work backwards from

---

## Working agreement for the automated runs

- **Morning:** inspect, fix, verify against production, advance one P0/P1 item.
- **Evening:** verify the day's claims actually hold in production, confirm the money path, advance one go-to-market item.
- Both end with **THINGS I NEED YOU TO DO** — numbered, specific, linked.
- A fix is not done until the live endpoint proves it. A green build is not evidence.
- Update this file when status changes. It is the only memory between runs.
