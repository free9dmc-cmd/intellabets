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
| Login and registration | ✅ sign-in reaches the database again (verified 2026-11-02: a sign-in with an unregistered email returns "No account found with that email", not the missing-column error). Creating an account was **not** re-tested live — it would add a real user |
| Site live at intellabets.com | ✅ verified |
| Engine live, serving real odds | ✅ verified 2026-10-25 (the feed was down 2026-09-14 to 2026-10-25 on a rejected Odds API key; see RUNBOOK) |
| Revenue bypasses closed | ✅ `POST /api/premium`, `/api/subscriptions` → 404. Every payment webhook refuses an unsigned request (verified 2026-11-02): RevenueCat 401 (secret set, fails closed), web3 `/confirm` 401, Stripe / NOWPayments / Authorize.Net 400 on the missing or invalid signature |
| Checkout fails safely when unauthenticated | ✅ `POST /api/checkout` → 401 (code inspection: falls through to a clean 503 once authenticated, if `STRIPE_SECRET_KEY` is absent/malformed — **not re-verified live**, since no account could be created to test it authenticated) |
| Private betslips protected | ✅ signed-out requests leak nothing |
| Legal + pricing pages public | ✅ required for store review and underwriting |
| Security headers, CORS allowlist | ✅ verified live |
| **Payment processing** | ❌ **no processor** |
| Support chat | ❌ Anthropic key invalid (unverified today — could not reach `/api/admin/health`, itself blocked by the same DB drift) |
| Rate limiting enforced | ⚠️ unverified — the 7-request test cannot work from the cloud sandbox (its IP changes per request; RUNBOOK). Check the `rate-limit-store` row of `/api/admin/health` |
| Mobile apps | ❌ Expo shell only, no screens |

**One sentence: visitors can get in the door again; the funnel now stops at payment, because there is no processor.**

---

## P0 — blocks revenue

Nothing else matters until these are done, in this order — #1 first, since
nothing downstream of it is reachable.

### 1. ~~Fix the broken database schema~~ — resolved (verified 2026-11-02)
**Status 2026-11-02:** the schema was synced at some point after this was
written (the log does not record when). Sign-in now reaches a `User` lookup
that selects every column without error, and the RevenueCat webhook answers
401, so its secret is set. Still open from the steps below: step 6, the audit
for free grants made while the webhook was open — nothing in the repo records
that it was done. Not re-verified: account creation itself, and whether the
other missing tables (`SupportTicket`, `SupportMessage`, `PlacedBet`,
`RateLimit`) now exist; `docs/sql/verify.sql` answers both.

The original diagnosis, kept for the record:

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

Confirmed 2026-09-25 by reproducing locally: of seven historical schema
states, only the 7308b97-era web schema gives production's exact error. Also
missing: `User.payoutsEnabled`, `User.preferredBook`, and the `SupportTicket`,
`SupportMessage`, `PlacedBet` and `RateLimit` tables (inferred from linear
history; `docs/sql/verify.sql` settles it). The deployed build already knows
these objects, so **no redeploy is needed for the DB fix**.

Fix, in this order (owner; needs the Vercel and Neon dashboards, no code):
1. **First, close the RevenueCat hole.** The deployed webhook skips auth when
   `REVENUECAT_WEBHOOK_SECRET` is unset, and fixing the database is what makes
   that exploitable (anyone could register, then grant themselves premium or
   credit tipster earnings). Vercel → project → Settings → Environment
   Variables → add `REVENUECAT_WEBHOOK_SECRET` (Production) = a long random
   string → Deployments → Redeploy the current production deployment. The
   unpushed code change makes the webhook fail closed, which removes this step
   once it ships.
2. Neon console → SQL Editor → select the branch and database behind Vercel's
   `DATABASE_URL` → paste `docs/sql/verify.sql` → Run (read-only; shows what's
   missing, plus a CONTEXT row with the user count so you can tell it's the
   real data).
3. Paste `docs/sql/schema-sync.sql` (the whole file) → Run. It is one
   statement, applies fully or not at all, refuses the wrong database, and is
   safe to re-run. A lock-timeout error means "nothing changed, run it again".
4. Run `docs/sql/verify.sql` again → the first row must read `SUMMARY … OK`.
5. Log in on intellabets.com. **Do not run `prisma/seed.ts`** — it deletes
   every user (it now refuses non-local databases, but the deployed copy of
   the docs said to run it).
6. Audit for free grants made through the old open webhook (DEPLOY.md
   "audit for free grants"), especially `AISubscription` / `Subscription`
   rows with `stripeSubId IS NULL` and any pending `Payout` rows.

Tested on local Postgres 16 across all seven schema states, the wrong
(engine) database, stray lowercase objects, editor statement-splitting, lock
contention, and three consecutive runs; after the fix, `prisma migrate diff`
and a real `prisma db push` both report no changes, and the real app (HEAD
build) registers, logs in, and returns 503 from checkout with no processor.

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
no single point of failure this time. The code is built and dormant; the
activation steps and what is still unverified are in RUNBOOK "Crypto payments
(NOWPayments)" (2026-11-09).

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
- [x] **CLV explainer** — `/closing-line-value`, shipped 2026-10-07. Worked example labeled illustrative, limits of CLV, and an explicit statement that no average is published yet (sample too small under corrected settlement). Added to middleware publicRoutes and sitemap. Linked from `/how-it-works` footer 2026-10-08.
- [x] **FAQ** — folded into `/how-it-works` (see above) rather than a separate page.
- [ ] **Onboarding emails** — copy written 2026-11-02, not yet sent. `web/lib/onboarding-emails.ts` has two templates in the same `{ subject, text, html }` shape as the password-reset email, ready for `sendEmail()`: a **welcome** email (transactional, once at signup) and a **method explainer** follow-up (marketing). The follow-up's input type requires an unsubscribe URL and a postal address (CAN-SPAM), so it cannot be built without them. Display names are HTML-escaped. `onboarding-emails.test.ts` enforces the copy rules: 21+ and 1-800-GAMBLER in every part, no percentage other than the 100% in the margin explanation, no ROI / win-rate / earnings wording, "guarantee" only as a denial. Still needed before sending (owner): `RESEND_API_KEY` and a verified sending domain (`/api/admin/health` "email" row), a postal address for the footer, an unsubscribe endpoint, and a decision on whether to send the follow-up at all. Sign-ups work again (P0.1 resolved), so wiring the welcome email into `/api/register` is the next code step once email is configured.
- [x] **SEO metadata** — `/how-it-works` has full metadata + OG tags; added `app/sitemap.ts` and `app/robots.ts` (Next.js auto-generates `/sitemap.xml` and `/robots.txt` from these), listing only routes actually public per `middleware.ts`. Per-page metadata on the other marketing pages (terms/privacy/contact/premium) already existed before this run.
- [x] **Responsible gambling page** — `/responsible-gambling`, added 2026-10-08 (not yet deployed/verified live at time of writing). Warning signs, control tips, US/UK help lines, no performance figures. In middleware publicRoutes and sitemap; linked from `/how-it-works`. Linked from the homepage footer (replacing the external NCPG link) and from a caveat line at the foot of `/premium` on 2026-10-30. Verified live 2026-10-31 after the `intellabets.com` alias was moved (it had not deployed — see RUNBOOK "Push builds green but the site does not change"). The shared in-app footer (`components/Footer.tsx`) still pointed at the external NCPG site; switched to `/responsible-gambling` 2026-10-31.
- [x] **No-vig calculator** — `/devig-calculator`, built 2026-10-31 for the "de-vig calculator" search term (Channels → long-form SEO). One book's 2-way or 3-way prices in; margin, fair probabilities and no-vig prices out, plus an optional expected-value check of another book's price. Maths in `lib/devig.ts`, mirroring the engine's proportional method, unit-tested against the `/how-it-works` worked example. No performance figures. Public in middleware, in the sitemap, linked from `/how-it-works`. Live 2026-11-01 (PR #20, alias moved by hand).
- [x] **Line shopping explainer** — `/line-shopping`, built 2026-11-01 for the "line shopping" search term (Channels → long-form SEO). Worked example of one side at three books with break-even rates and payouts, computed at build time from `lib/devig.ts` / `lib/utils.ts` rather than typed in; why -3 and -3.5 are different bets; what a better price does and does not do. Illustrative prices only, no performance figures. Public in middleware, in the sitemap, linked from `/devig-calculator`. Ships via PR, not yet live.

### Channels, in order of fit

1. **r/sportsbook and betting forums** — sharp audience, allergic to hype, receptive to method. Participate honestly; do not spam picks. Drafts for the owner to post personally: `docs/marketing/forum-posts.md` (2026-11-03). It has a by-hand de-vig explainer, the "what's your record?" answer, and a line-shopping post that waits on PR #21. It also has a pre-posting checklist: read each forum's self-promotion rules, disclose affiliation, no performance figures or picks, and 21+ wording on any post with a link.
2. **Long-form SEO** — "de-vig calculator", "closing line value", "line shopping" have real intent and weak incumbents.
3. **YouTube/TikTok explainers** — showing the vig calculation on a real slate is inherently demonstrable. Three short scripts for the owner to record: `docs/marketing/video-scripts.md` (2026-11-08). They cover "-110/-110 isn't a coin flip", "same bet, three prices", and "why we don't post our record". Each has timed shots and a voice-over. Rules: real prices yes, results and picks never; 21+ / 1-800-GAMBLER on screen throughout; a standard description; check each platform's gambling rules first.
4. **Paid** — last. Do not pay for traffic to a page that can't take payment.

### Pricing

Live in code: Premium and standalone AI. Before promoting, confirm the tiers on
`/premium` match what the processor will actually charge, and that the refund
policy in the terms matches what the processor will actually do.

---

## Open questions for the owner

1. **Finish P0.1:** the schema fix is in (verified 2026-11-02). Remaining: run `docs/sql/verify.sql` in the Neon SQL Editor to confirm the `SUMMARY … OK` row, and do step 6, the audit for free grants made while the RevenueCat webhook was open.
2. **Push access for the automated runs** — resolved: since 2026-10-31 the runs push to their own branch and open a draft PR for the owner to merge (they still cannot push to `main`). Do not give the runs production database credentials.
3. Stripe's termination reason code — needed for the 2Accept application
4. Business entity and bank account — are formation docs ready to submit?
5. Launch target date, to work backwards from

---

## Working agreement for the automated runs

- **Morning:** inspect, fix, verify against production, advance one P0/P1 item.
- **Evening:** verify the day's claims actually hold in production, confirm the money path, advance one go-to-market item.
- Both end with **THINGS I NEED YOU TO DO** — numbered, specific, linked.
- A fix is not done until the live endpoint proves it. A green build is not evidence.
- Update this file when status changes. It is the only memory between runs.
