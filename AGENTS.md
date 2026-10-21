# Working in this repo (agent notes)

Findings that are not obvious from the manifests. The two live runbooks
(`docs/RUNBOOK.md`, `docs/LAUNCH-PLAN.md`) remain the source of truth for
production state and launch blockers — keep them current.

## Sandbox environment (Base44)

The whole stack runs from `docker-compose.base44.yml`:

```bash
docker compose -f docker-compose.base44.yml up -d --build   # db, redis, api, web
docker compose -f docker-compose.base44.yml ps               # health status
docker compose -f docker-compose.base44.yml logs -f web api   # dev server output
```

Services, all from the cloned source (no prebuilt images):

| Service | What it is | Where |
|---|---|---|
| `web` | Next.js 14 dev server, the public preview entry point | host port 3000 |
| `api` | NestJS engine dev server, Swagger at `/api/docs` | host port 4000 |
| `seed` | one-shot demo-data seed, exits when done | shares the `db` netns |
| `db` | Postgres 16, holding **two** databases | internal only |
| `redis` | Redis 7, BullMQ ingestion queue | internal only |

The shell scripts under `.base44/` are the service entry points
(`start-web.sh`, `start-api.sh`: install → `prisma generate` → `prisma db push`
→ dev server; `seed-web.sh`: seed if empty). They live in the repo so the setup
is reviewable, and are bind-mounted read-only into the containers.

### Two things that will bite you

1. **Do not switch these services to the workspace install.** `web/` and
   `backend/` have different Prisma schemas that generate into the same hoisted
   `node_modules/@prisma/client` (README "Monorepo gotcha"). Because the
   sandbox runs both apps at once from one checkout, each app installs its own
   dependencies into its own directory (`npm install --workspaces=false
   --no-package-lock`, the same shape as `backend/Dockerfile`, whose build
   context is the backend directory alone). That gives each app its own Prisma
   client, at the cost of a slower first boot.
   The repo-root `package-lock.json` cannot drive the installs: it is stale with
   respect to the workspace manifests (e.g. it pins `@reown/appkit@1.7.8` while
   `web/package.json` requires `1.8.24`), so `npm ci` against it fails outright.
   Dependencies land in `web/node_modules` and `backend/node_modules`
   (gitignored, inside the checkout) — not in Docker volumes, so `rm -rf
   web/node_modules` is a clean reinstall.

2. **The seed only runs once, on an empty database, and refuses to run against a
   database that is not on localhost.** `web/prisma/seed.ts` deletes every user
   before inserting demo tipsters, so wiping the preview's data on every restart
   would be the default behaviour. Instead the one-shot `seed` service runs
   `.base44/seed-web.sh`, which seeds only when the `User` table is empty, and
   then exits. It borrows the `web` service's installed `node_modules` (so it
   waits for `web` to be healthy — two installers in one directory would corrupt
   it) and shares the `db` container's network namespace, which is what makes the
   database "local" for the seed's guard without publishing a database port. To
   re-seed from scratch: `docker compose -f docker-compose.base44.yml down -v`
   (drops `db_data`), then `up -d`.

### Environment variables

- Local infrastructure (`DATABASE_URL`, `REDIS_URL`) is set inline in compose.
- `.env.base44-defaults` holds non-secret development placeholders (signing
  keys, `ENGINE_SERVICE_KEY`, `ADMIN_EMAILS`, ingestion cadence). It is read
  **first**, `/run/base44/app.env` (platform-delivered user secrets) **last**, so
  a real credential always wins. Never put a user-supplied credential in the
  defaults file or in compose `environment:`.
- `ENGINE_SERVICE_KEY` must be identical for `web` and `api`; both read the same
  file, which is why the picks pages work in the sandbox.
- Two databases: `intellabets_web` (web app) and `intellabets_engine` (API).
  `.base44/init-databases.sql` creates the engine one on first boot of the `db`
  volume. Changing that script requires recreating `db_data`.
- `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` are derived from
  `${BASE44_PUBLIC_HOST_SUFFIX:-}` at compose time (never hardcode the resolved
  host). The empty default is deliberate: a `docker compose` invocation that
  does not carry the variable — the platform's own health probe does not — then
  resolves quietly instead of printing "variable is not set" on every run, and
  the value is identical either way (every real service creation has it set).
  `NEXT_PUBLIC_APP_URL` also feeds
  `experimental.serverActions.allowedOrigins` in `web/next.config.js`, which is
  what lets the preview origin post server actions.

### Icons

The brand mark lives in `web/app/favicon.ico` (16/32/48 PNG-in-ICO) and
`web/app/icon.svg` — Next's app-router conventions, so `/favicon.ico` is served
from the repo rather than 404ing on every page load. Both are generated art
(violet→sky gradient, rising trend line) drawn to match the wordmark's
`gradient-text`; keep the two files in step if the mark changes.

### What works without external credentials, and what does not

Everything boots with no credentials: `web` (accounts, betslips, bet tracking,
leaderboard, admin console) against local Postgres, and `api` with
`x-engine-key` auth, de-vig maths and Swagger.

- **No `THE_ODDS_API_KEY`** → `OddsAggregatorService.isConfigured()` is false, the
  BullMQ scheduler stays idle, no games or predictions exist, and the picks pages
  (`/picks`, `/ai-picks`) render empty rather than erroring. This is the single
  credential worth adding to see the product do its actual job.
- **With `THE_ODDS_API_KEY` set** the scheduler logs "Scheduled polling every 30m
  and settlement every 60m for 5 sports", and the first poll lands on the next
  30-minute cycle — so the picks pages stay empty for up to `POLL_INTERVAL_MIN`
  after a boot. Nothing is wrong; check
  `redis-cli zrange bull:ingestion:repeat 0 -1 withscores` in the `redis`
  container for the next run time. `POST /api/v1/ingestion/poll?sport=…` forces
  one immediately, but it is admin-gated on the engine's *own* user table, which
  the sandbox does not seed — lower `POLL_INTERVAL_MIN` instead if you want a
  faster cycle.
- **No `ANTHROPIC_API_KEY`** → AI analyst passes bets through unfiltered; support
  chat answers with its fallback message.
- **No payment keys** (Stripe/Authorize.Net/NOWPayments/web3) → each rail is
  dormant and checkout degrades to a clean 503. `DEMO_BILLING=true` grants
  premium with no payment for local development only (force-disabled when
  `NODE_ENV=production`); the sandbox leaves it **off** on purpose.

### Verifying a change

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/login   # web
curl -s http://localhost:4000/api/docs | head -c 200                   # engine + Swagger
docker compose -f docker-compose.base44.yml logs --tail=50 web api     # watcher output
```

Seeded logins: `demo@intellabets.com` / `password123` (premium demo account),
any tipster email e.g. `marcus@example.com` / `password123`. The demo address is
in `ADMIN_EMAILS` for the sandbox, so `/admin` is reachable with it.

Tests are per package and are already auto-prefixed with `prisma generate`:

```bash
npm test --workspace=@intellabets/web      # vitest
npm test --workspace=@intellabets/backend  # jest
npm run typecheck --workspace=@intellabets/backend
```

The engine's tests must not be run from `web/` (that regenerates the wrong Prisma
client). Outside the sandbox, run one package's tests at a time.
