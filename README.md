# IntellaBets

Sports betting analytics. The engine compares every major sportsbook's prices,
removes each book's margin, and surfaces the bets where the best available
price beats the market consensus.

**IntellaBets does not accept wagers, hold customer funds, or place bets.** It
publishes analysis. Customers place their own bets at their own sportsbooks.

- Live: https://intellabets.com
- Engine API: https://api.intellabets.com/api/v1
- Status: deployed and secure; **not yet able to charge customers** — see
  [docs/LAUNCH-PLAN.md](docs/LAUNCH-PLAN.md)

---

## How the edge works

This is the whole product, and it is worth being precise about because it is
easy to overstate.

1. **De-vig each book.** A bookmaker's prices imply probabilities summing to
   more than 1. The excess is their margin. Dividing each implied probability
   by that total removes the margin proportionally, leaving fair probabilities
   summing to exactly 1.
2. **Average across books.** Each book's de-vigged view is one estimate of the
   true probability. The average across many is the consensus — the sharpest
   estimate available without inside information.
3. **Line shop.** Compare the best available price against that consensus.
   Where the best price implies a *lower* probability than consensus, the bet
   carries positive expected value.
4. **Size with fractional Kelly.** Quarter-Kelly, capped at 5% of bankroll.
   Full Kelly is optimal only if the probability estimate is exactly right,
   which it never is.

The edge is **a pricing disagreement between bookmakers**, not a prediction
about the game. Positive expected value means the price is better than the true
probability — it says nothing about whether any individual bet wins.

**Closing line value is the honest scoreboard.** CLV compares the price taken
against the price at kickoff. It shows up immediately, while win rate takes
hundreds of bets to separate skill from variance.

---

## Architecture

```
                    ┌──────────────────────┐
  intellabets.com → │  web/  Next.js 14    │ ── NextAuth ──→ Neon Postgres
                    │  Vercel              │                 (users, betslips,
                    └──────────┬───────────┘                  placed bets)
                               │
                   x-engine-key│ (ENGINE_SERVICE_KEY)
                               ▼
                    ┌──────────────────────┐
  api.intellabets → │  backend/  NestJS    │ ──→ Render Postgres
         .com       │  Render (Docker)     │     (games, odds snapshots,
                    └──────────┬───────────┘      predictions)
                               │
                               ▼
                         The Odds API
                    (multi-book odds, scores, props)
```

| Package | Stack | Role |
|---|---|---|
| `web/` | Next.js 14 App Router, Prisma, NextAuth | Customer site, accounts, subscriptions, support chat |
| `backend/` | NestJS, Prisma, BullMQ | Odds ingestion, de-vig engine, predictions, settlement |
| `skills/` | Agent Skills | `pick-writeup`, `bet-grading`, plus the analyst agent config |
| `mobile/` | Expo / React Native | Shell only — no screens built yet |
| `admin-web/` | React + Vite | Admin console (early) |

### The two-database split

`web/` and `backend/` have **separate databases and separate user tables**. A
web customer has no account on the engine.

They are bridged by a shared secret. `web/` authenticates its own user, checks
their entitlement, then calls the engine server-to-server with `x-engine-key`.
`ServiceOrPremiumGuard` on the engine accepts either that key or a premium JWT.

`ENGINE_SERVICE_KEY` must be identical in Vercel and Render. If the two drift,
the picks pages load but come back empty, with no error explaining why.

---

## Running locally

```bash
npm install                       # workspace root — installs all packages

cp web/.env.example web/.env      # fill in DATABASE_URL, NEXTAUTH_SECRET, ...
cd web && npx prisma db push && npm run dev        # → localhost:3000

cp .env.example backend/.env      # fill in DATABASE_URL, THE_ODDS_API_KEY, ...
cd backend && npx prisma db push && npm run dev    # → localhost:4000
```

> **Monorepo gotcha:** `web/` and `backend/` have different Prisma schemas that
> generate into the same hoisted `node_modules/@prisma/client`. Running
> `prisma generate` in one breaks type-checking in the other. Re-run it in
> whichever package you are working on.

Engine API docs: `http://localhost:4000/api/docs` (Swagger).

---

## Operations

Deployment, environment variables, health checks and incident response are in
**[docs/RUNBOOK.md](docs/RUNBOOK.md)**.

Launch status, what blocks revenue, and the go-to-market plan are in
**[docs/LAUNCH-PLAN.md](docs/LAUNCH-PLAN.md)**.

Two automated runs operate against this repo daily — a morning diagnose-and-fix
pass and an evening review-and-ship pass. Both read those two documents first,
so keep them current: they are the shared state between runs.

---

## Non-negotiables

These are enforced in code, in the agent skills, and in the automated runs.
They exist because breaking them has already cost this business a payment
processor.

- **No fabricated numbers.** Never publish a win rate, ROI, record, testimonial,
  subscriber count or earnings figure that did not come from real settled data.
  No income projections.
- **No guaranteed outcomes.** +EV is a statement about price, not about whether
  a bet wins.
- **Legal pages stay public.** `/terms`, `/privacy`, `/contact`, `/premium` must
  load without an account — Apple, Google and payment underwriters all require
  it.
- **`DEMO_BILLING` never ships to production.** It grants paid entitlements with
  no payment. It is force-disabled when `NODE_ENV=production` regardless of its
  value, and `POST /api/premium` returning anything but 404 in production is a
  live revenue bypass.
- **No sportsbook credential storage, ever.** Storing a customer's sportsbook
  login or placing bets on their behalf violates every book's terms, likely
  violates the CFAA, and would require gaming licensure.
- **18+ and responsible gambling** wording on anything customer-facing.

## Licence

Proprietary. All rights reserved.
