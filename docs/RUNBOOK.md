# Runbook

How IntellaBets runs in production, and what to do when it doesn't.

Kept current by the twice-daily automated runs. If you change infrastructure,
change this file in the same commit.

---

## Where things live

| Thing | Where | Notes |
|---|---|---|
| Web app | Vercel project `intellabets` | `prj_y1o37TMmZrRAhE4KMiZSkXAJSDoO`, team `team_5F8NL4WURB1TU4ihJVAXLjBZ`. **Root Directory must be `web`.** |
| Web database | Neon Postgres | Provisioned through Vercel's Neon integration |
| Engine | Render service `intellabets-api` | Docker, `backend/Dockerfile`, free tier |
| Engine database | Render Postgres `intellabets-db` | Separate from Neon |
| Queue | Render Redis `intellabets-redis` | BullMQ jobs |
| Odds data | The Odds API | Multi-book odds, scores, player props |
| DNS | Cloudflare | `intellabets.com` → Vercel, `api.intellabets.com` → Render |

Both deploy automatically from `main`.

> **Root Directory is the setting that breaks imports.** Left at the repo root,
> Vercel reads the four npm workspaces, classifies the project as multi-service,
> finds no services declared, and the build stops with nothing useful in the log.
> It must be `web`.

---

## Environment variables

### Vercel (web)

| Variable | Purpose | If wrong |
|---|---|---|
| `DATABASE_URL` | Neon connection | Nothing works |
| `NEXTAUTH_SECRET` | Signs session cookies | Logins break; a leaked value lets anyone forge any session, including admin |
| `NEXTAUTH_URL` | Auth callback base | Login appears to work, then redirects to a dead page |
| `NEXT_PUBLIC_APP_URL` | Absolute links | Broken links in emails and redirects |
| `ADMIN_EMAILS` | Comma-separated admin list | Nobody can reach `/admin`. Matched against the sign-in email |
| `ANTHROPIC_API_KEY` | AI picks + support chat | Support chat returns "something went wrong"; AI picks fail |
| `ENGINE_API_URL` | Engine base URL | Picks pages empty |
| `ENGINE_SERVICE_KEY` | Service-to-service auth | Picks pages empty, **no error shown** |
| `STRIPE_SECRET_KEY` | *(dead — account terminated)* | See Known issues |
| `DEMO_BILLING` | **Never set in production** | Grants paid access with no payment |

### Render (engine)

`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` come from the blueprint.
`ANTHROPIC_API_KEY`, `THE_ODDS_API_KEY` and `ENGINE_SERVICE_KEY` are **not** in
`render.yaml` and must be set by hand — a rebuild from the blueprint drops them.

`ENGINE_SERVICE_KEY` must match Vercel's **exactly**.

---

## Health checks

An admin-only endpoint tests every external dependency with a real call rather
than checking that a variable is non-empty:

```
GET https://intellabets.com/api/admin/health     (signed in as an ADMIN_EMAILS address)
```

Returns per-dependency status for the database, the rate-limit table, Anthropic
and the engine, each with the reason it failed — 401 means a revoked key, 429
means out of credit, no engine response means the service keys don't match.

### Manual checks

```bash
B=https://intellabets.com

# Public pages — all must be 200 signed out
for p in / /login /register /premium /terms /privacy /contact /leaderboard; do
  printf "%-14s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$B$p")"; done

# Gated pages — must be 307
for p in /picks /dashboard /my-bets /betslips; do
  printf "%-14s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$B$p")"; done

# Revenue bypass — both MUST be 404
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B/api/premium"
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B/api/subscriptions"

# CORS — an untrusted origin must get NO allow-origin header back
curl -sD - -o /dev/null -H "Origin: https://evil.example.com" "$B/api/leaderboard" \
  | grep -i access-control-allow-origin

# Engine (free tier: retry through the cold start, up to 60s)
curl -s --max-time 60 https://api.intellabets.com/api/v1/predictions/strategies
```

---

## Symptoms → causes

| Symptom | Almost always |
|---|---|
| Picks pages empty, no error | `ENGINE_SERVICE_KEY` differs between Vercel and Render |
| Engine times out on first request | Render free tier cold start. Retry for 60s before escalating |
| Support chat: "something went wrong" | `ANTHROPIC_API_KEY` invalid, revoked, or out of credit. Check `/api/admin/health` |
| Rate limits never fire (all 200s) | `RateLimit` table missing from Neon — the limiter fails open by design |
| Login redirects to a dead page | `NEXTAUTH_URL` points somewhere DNS doesn't serve |
| Can't reach `/admin` | Your sign-in email isn't in `ADMIN_EMAILS` |
| Vercel build stops with "services" | Root Directory isn't `web` |
| `prisma db push` → `P1001` | Unquoted `&` in the URL (shell backgrounds it), or Neon compute asleep. Neon's SQL Editor sidesteps both |
| Typecheck fails in `web/` after backend work | Shared `@prisma/client` was regenerated for the other schema. `npm run dev`/`build`/`typecheck` now auto-run `prisma generate` for the current package, so no manual re-run is needed unless you invoke `tsc`/`nest`/`next` directly (then `npx prisma generate` in `web/`) |

---

## Deploying

Push to `main`. Both platforms build automatically.

Before pushing anything in `web/`:

```bash
cd web && npx prisma generate && npx tsc --noEmit && npx next build
```

After the deploy, **re-check the live endpoint the change was meant to affect.**
A green build is not evidence that production behaviour changed.

### Schema migrations

The project uses `prisma db push`, not migration files.

```bash
cd web && DATABASE_URL="<quoted neon url>" npx prisma db push
```

If that can't connect, Neon's dashboard SQL Editor runs the same DDL with no
local setup and no connection string to get wrong.

---

## Known issues

**Stripe is dead.** The account was terminated — almost certainly over
fabricated statistics published on the site, since removed. The
`STRIPE_*` variables still exist in Vercel and the integration code is still
present. `isStripeConfigured()` only accepts a well-formed `sk_test_`/`sk_live_`
key, so a revoked-but-well-formed key would make checkout attempt a Stripe call
and return 500 instead of a clean 503. **Delete `STRIPE_SECRET_KEY` from Vercel
until a real processor is live.**

**A stray `Database_url` variable exists in Vercel** (lowercase). Environment
variables are case-sensitive, so it does nothing — the real `DATABASE_URL` comes
from the Neon integration. Delete it; it invites a debugging wild goose chase.

**CLV figures are unreliable right now.** Settlement used to read the closing
price from whatever odds snapshot was most recent, which after a game ends is an
in-play price — a team down 9-0 quotes ~15.00 against a pregame 2.10, recording
-86% CLV that means nothing. Fixed, but already-settled rows keep their bad
values. Treat the reported average as unmeasured until enough games settle under
the corrected logic. **Do not publish a CLV number before then.**

**Rate limits are database-backed and fail open.** If the `RateLimit` table is
missing or Postgres is unreachable, requests are allowed. That is deliberate —
a database problem must not stop signups — but it means "no 429s" can mean
"limiter broken" rather than "under the limit".

**Webhook idempotency is not implemented.** No processed-events table, and no
`charge.refunded` / `charge.dispute.created` handling. Both must be built before
a processor goes live.
