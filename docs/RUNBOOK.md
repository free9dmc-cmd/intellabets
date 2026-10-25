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
| `ANTHROPIC_API_KEY` | AI picks + support chat | Support chat returns "something went wrong". AI Picks still builds slips, but from the engine's ranking, labelled "Engine Analysis" with no write-up; Vercel logs `AI picks: ... using the engine's ranking` |
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
| Picks pages and AI Picks empty, `/api/admin/health` `odds-feed` failing with 401 | The Odds API rejects `THE_ODDS_API_KEY` (revoked key or plan out of credits). The engine logs `The Odds API 401 <error_code>` and the credits left. Fix the key or plan on the-odds-api.com, then update `THE_ODDS_API_KEY` on Render |
| Picks go stale for hours, then recover | The engine is on Render's **free** plan and sleeps after 15 min without traffic; nothing polls while it sleeps. Move `intellabets-api` to Starter |
| Picks pages empty, no error | `ENGINE_SERVICE_KEY` differs between Vercel and Render (`/api/admin/health` `engine` check now says so) |
| Picks pages empty, engine healthy | Check `ACTIVE_SPORTS` on Render. A sport out of season has no games, so no odds and no picks. MLB alone goes dead from October to March |
| Engine times out on first request | Render free tier cold start. Retry for 60s before escalating |
| Support chat: "something went wrong" | `ANTHROPIC_API_KEY` invalid, revoked, or out of credit. Check `/api/admin/health` |
| Rate limits never fire (all 200s) | `RateLimit` table missing from Neon — the limiter fails open by design |
| Login redirects to a dead page | `NEXTAUTH_URL` points somewhere DNS doesn't serve |
| Can't reach `/admin` | Your sign-in email isn't in `ADMIN_EMAILS` |
| Vercel build stops with "services" | Root Directory isn't `web` |
| Push builds green but the site does not change | The production deployment has no `intellabets.com` alias. Two causes found, check both: (1) **a manual Promote or Rollback turns off `autoAssignCustomDomains`** — turn it back on (Settings → Environments → Production, or the API) and stop promoting by hand; (2) **git-triggered production deploys still were not aliased with that setting on** (2026-10-23), while an API redeploy of the same commit was. Suspected but unconfirmed: a required deployment check is blocking promotion — the Cloudflare "Workers Builds: intellabets" check has failed on every commit since 2026-10-22. Disconnect that Cloudflare build (it is not part of this stack) and remove it from any required checks in Vercel. Until fixed, ship by redeploying the latest production deployment via the API, not by Promote. **2026-10-25:** an API redeploy was not aliased either, so the domain was moved by assigning the `intellabets.com` alias to the new deployment directly (Vercel API `POST /v2/deployments/{id}/aliases`). Check which deployment serves the site with `curl -s https://intellabets.com/login \| grep -o 'dpl=dpl_[A-Za-z0-9]*' \| sort -u`. |
| `prisma db push` → `P1001` | Unquoted `&` in the URL (shell backgrounds it), or Neon compute asleep. Neon's SQL Editor sidesteps both |
| Typecheck fails in `web/` after backend work | Shared `@prisma/client` was regenerated for the other schema. `npm run dev`/`build`/`typecheck` now auto-run `prisma generate` for the current package, so no manual re-run is needed unless you invoke `tsc`/`nest`/`next` directly (then `npx prisma generate` in `web/`) |
| Login/register return 500, `prisma...findUnique()` error mentions "does not exist in the current database" | `schema.prisma` has a column the production Neon DB doesn't have — someone committed a schema change without running `prisma db push` against production. `GET /api/admin/health` now catches this (`database` check runs a real `findFirst`, not just `count`). Fix: `cd web && DATABASE_URL="<neon url>" npx prisma db push`, or run the equivalent `ALTER TABLE` in Neon's SQL Editor |

---

## Deploying

Push to `main`. Both platforms build automatically.

**When a web change calls a new engine route, ship the engine first.** Let
Render finish, then confirm each new route answers 403 without a key (it
exists) rather than 404, e.g.
`curl -s -o /dev/null -w '%{http_code}' https://api.intellabets.com/api/v1/predictions/board`.
Only then deploy Vercel or move the `intellabets.com` alias. If the Render
build fails, leave the web alias where it is.

Before pushing anything in `web/`:

```bash
cd web && npx prisma generate && npx tsc --noEmit && npx next build
```

After the deploy, **re-check the live endpoint the change was meant to affect.**
A green build is not evidence that production behaviour changed.

**If this push changes `schema.prisma`, run `prisma db push` against production
in the same session.** `next build` and `tsc` both pass against the schema
file, not the live database — they cannot tell you the migration was never
run. This exact gap took `User.premiumStripeSubId` (committed 2026-09-10) out
of sync with production and broke every login and registration for two weeks
before it was caught on 2026-09-24. `GET /api/admin/health` now checks for
this class of drift on every run — check it after any schema change.

### Schema migrations

The project uses `prisma db push`, not migration files.

```bash
cd web && DATABASE_URL="<quoted neon url>" npx prisma db push
```

If that can't connect, Neon's dashboard SQL Editor runs the same DDL with no
local setup and no connection string to get wrong.

---

## AI Picks

AI Picks builds betslips from the engine's **board**
(`GET /api/v1/predictions/board`): every upcoming bet that licensed books
price, ranked by price against the engine's fair probability. It is not
limited to +EV picks, so most legs are priced slightly below fair (the
book's margin). The page says so on every leg.

How a slip is built:
1. The user picks sport, bet type, risk level, sportsbook, state and stake.
2. The web app takes the board at that book, keeps the risk band (the
   engine's win chance), and lets Claude choose the legs by label and write
   the explanation. If Claude is unavailable, slow (25 s cap), refuses,
   breaks a rule, or writes banned words (`copyProblem` in
   `web/lib/ai-picks.ts`), the engine's own ranking is used.
3. `GET /predictions/betslip?refs=...` turns each chosen leg into a
   `Prediction` with `source = "board"` and returns its price, link and
   edge at the user's book, plus a one-tap parlay link where the book has a
   sourced format (DraftKings, FanDuel, BetMGM, Caesars).

`source = "board"` predictions are settled like any other, but never appear
on Engine Picks and never count in the engine's scoreboard
(`/predictions/performance`).

Which books can be chosen depends on `ODDS_REGIONS` on Render. `us` covers
DraftKings, FanDuel, BetMGM, BetRivers and, when The Odds API lists them,
Caesars and Fanatics. `us2` adds Hard Rock, theScore Bet, Bally Bet and
betPARX. If a book has no prices, AI Picks names the books that do.

## Dependency security

Last cleanup 2026-10-24. Root `npm audit` went from 139 vulnerable packages
(10 critical, 59 high) to 21 (0 critical, 16 high, 5 moderate). Those 21 all
trace back to just two advisories (below). The backend's standalone install,
which is exactly what Render's Docker build runs, audits at **0**.
Versions moved:

| Package | From | To |
|---|---|---|
| Next.js | 14.2.16 | 15.5.28 |
| React | 18 | 19 |
| next-auth | 4.24.13 (`^4.24.10`) | 4.24.15 |
| NestJS | 10.4.22 | 11 |
| Vitest | 2 | 5 |
| Capacitor | 6 | 7 |
| Docker base image | `node:20-slim` | `node:22-slim` (Node 20 is end-of-life) |

The workspace now needs **Node 22.12+** (root `engines`; Vitest 5 requires it).
Vercel runs Node 24.

Removed:
- unused GraphQL/Apollo packages in `backend/`;
- unused `@auth/prisma-adapter` in `web/`;
- `mobile/` from the npm workspace. It pins React 18.2 for React Native 0.74
  and would otherwise hoist an old React next to `next` (see README).

**npm `overrides` live in three files and must stay in step.**

| File | Covers |
|---|---|
| root `package.json` | Workspace installs: Vercel and local development |
| `web/package.json` | The sandbox's standalone web install, which ignores the root |
| `backend/package.json` | The Docker build, which also installs standalone |

Most are scoped, semver-compatible security bumps:
- `axios` under `authorizenet`;
- `ws` under `viem`;
- `postcss` under `next`;
- `multer`, `js-yaml` and `uuid` under Nest, Swagger and bull;
- `uuid` under the MetaMask packages;
- `postcss-selector-parser` 7 under `tailwindcss`. This one was checked to
  produce byte-identical CSS.

Two of them are build fixes, not security patches. Do not drop them:
- **`@reown/appkit-adapter-wagmi` → `@wagmi/connectors ^6.2.0`.** Without it
  npm resolves connectors 8.x, which needs `@wagmi/core` 3, and `next build`
  fails on `@wagmi/core/tempo`.
- **`valtio` → `use-sync-external-store ^1.4.0`.** Without it a second React 18
  copy is nested under WalletConnect.

Overrides only take effect on a fresh resolve. After changing one, delete
`package-lock.json` and every `node_modules`, then reinstall. The sandbox
scripts already wipe `node_modules` whenever `package.json` changes.

**What is left, and why it is accepted for now.**

`zod` <4.6.6 (high):
- **Source.** Zod 3, inside the wallet-checkout chain: `@reown/appkit-wallet`
  pins `zod 3.22.4` exactly, and `@coinbase/cdp-sdk` requires `^3.25.76`.
  Both are still true in their latest releases (AppKit 1.8.24, CDP SDK
  1.60.0), so **there is no upstream fix yet**. Upgrading to wagmi 3 would not
  clear it.
- **Impact.** Memory exhaustion on oversized input, in code that runs in the
  visitor's own browser.
- **Next step.** Re-check when AppKit 2.x ships.

`decode-uri-component` (moderate):
- **Source.** It reaches the tree only through `@walletconnect/ethereum-provider`
  2.21.1, which `@wagmi/connectors` 6.2.0 pins, via `query-string`.
- **Impact.** Denial of service, in the browser.
- **Possible fix.** Overriding the provider to ≥2.23 (latest 2.26.0) would drop
  it, but that changes the WalletConnect provider version. Do it only with a
  live wallet test, i.e. a WalletConnect project id. Fixed versions of the
  package itself are ESM-only and would break `query-string`'s `require()`.

`mobile/` is outside the root lockfile now. It keeps its own Expo 51 alerts
until it is moved to a current Expo SDK or removed.

---

## Known issues

**Resolved 2026-10-25: no live odds from 2026-09-14 to 2026-10-25.** The owner
replaced the key, moved The Odds API to the 100K plan and the engine to
Render Starter; odds resumed at 09:00 UTC. Kept for reference:
- **What fails.** Every poll returns `401` for every sport, so there are no
  upcoming games or picks. The Engine Picks page and AI Picks are empty, and AI
  Picks says live odds are unavailable rather than inventing games.
- **Fix (owner).** On the-odds-api.com check the plan and credits, create a new
  key (the old one was also exposed in a chat), and set `THE_ODDS_API_KEY` on
  Render. The engine redeploys and polls on the next 30-minute boundary;
  `/api/admin/health` → `odds-feed` shows when odds last arrived and the
  credits left.
- **Plan size.** At the defaults (3 markets x 1 region per `/odds` call, 5
  sports, every 30 min, plus `/scores` settlement hourly) the engine uses
  roughly 28,000 credits a month while awake, more than the 20K plan. Use the
  100K plan, or cut `ACTIVE_SPORTS` / raise `POLL_INTERVAL_MIN`.
- **Also.** The engine is on Render's free plan, which sleeps after 15 minutes
  without traffic, and nothing polls while it sleeps. Move it to Starter for
  odds that stay current.

**Resolved 2026-10-25: the site was offline (`402 DEPLOYMENT_DISABLED`) on
2026-10-24** because of Vercel account billing. The owner fixed billing. The
security upgrade (`baac150`) was then deployed by API and the `intellabets.com`
alias assigned by hand (see "Symptoms → causes").

**Login and registration are broken in production right now (found 2026-09-24).**
`prisma.user.findUnique()` / `.create()` fail because `User.premiumStripeSubId`
(schema change committed 2026-09-10, `payoutsEnabled` likely too) was never
applied to the production Neon database. Confirmed live: `POST /api/register`
with valid, unique input returns 500 `{"error":"Failed to create account"}`,
and `POST /api/auth/callback/credentials` with any credentials returns a
NextAuth error URL containing `The column User.premiumStripeSubId does not
exist in the current database`. **This has blocked every new signup and every
fresh login since the schema change shipped — independent of, and upstream
of, the payment processor gap.** Fix: `docs/sql/schema-sync.sql` in the Neon
SQL Editor, then `docs/sql/verify.sql` — but set `REVENUECAT_WEBHOOK_SECRET`
and redeploy first (see LAUNCH-PLAN.md P0.1 for the order and why).

**The deployed RevenueCat webhook has no auth when `REVENUECAT_WEBHOOK_SECRET`
is unset** (found 2026-09-25). Anyone can POST a purchase event and grant any
user premium or AI access, or credit tipster earnings; user ids are public via
`/api/leaderboard` and profiles. Fixed in code (fails closed with 503 when the
secret is unset) but not yet deployed — until then, keep the variable set.

**Support chat is failing for a non-schema reason.** One anonymous test message
got the catch-branch reply ("Something went wrong on our side..."), which wraps
only the Anthropic call. Likely an invalid, revoked or out-of-credit
`ANTHROPIC_API_KEY` (or a bad `SUPPORT_MODEL`); only Vercel function logs or
`/api/admin/health` can tell which, and the latter needs an admin login.

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
