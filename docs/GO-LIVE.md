# IntellaBets — GO-LIVE Runbook

The one current, actionable runbook for taking IntellaBets live. It reflects the
**actual code on `main`** after the payment layer + launch-hardening merge
(`web/lib/billing/**`, three payment rails, `ProcessedEvent` + `PaymentOrder`
Prisma models, `/refund`, graceful 503 degradation).

It supersedes the launch steps scattered across `docs/DEPLOY.md`, `docs/LAUNCH.md`
and `docs/LAUNCH-PLAN.md` where those still assume a single Stripe processor and
an unpushed production schema. `docs/RUNBOOK.md` remains the day-2 operations
reference (health checks, symptoms → causes); this document is the day-0/day-1
sequence. Where a prior doc is still correct it is cited inline.

> Guardrail for operators and agents: never run a credentialed helper script
> blindly (e.g. `scripts/prep-deploy.sh` generates secrets and prints env), never
> invent secret values, and do not set `DEMO_BILLING` in production.

---

## 1. Overview

### Architecture (unchanged from `README.md`)

```
                    ┌──────────────────────┐
  intellabets.com → │  web/  Next.js 14    │ ── NextAuth ──→ Neon Postgres
                    │  Vercel (root: web)  │                 (users, betslips,
                    └──────────┬───────────┘                  placed bets, PAYMENTS)
                               │
                   x-engine-key│ (ENGINE_SERVICE_KEY)
                               ▼
                    ┌──────────────────────┐
  api.intellabets → │  backend/  NestJS    │ ──→ Render Postgres
         .com       │  Render (Docker)     │     (games, odds, predictions)
                    └──────────┬───────────┘  + Render Redis (BullMQ ingestion queue)
                               │
                               ▼
                         The Odds API
```

- **Web app** → Vercel project `intellabets`, **Root Directory must be `web`**
  (`docs/RUNBOOK.md`). Its database is **Neon Postgres** (provisioned via Vercel's
  Neon integration). This database holds users **and all payment state**
  (`PaymentOrder`, `ProcessedEvent`, premium columns).
- **Backend engine** → Render service `intellabets-api` (Docker,
  `backend/Dockerfile`), with its **own** Render Postgres (`intellabets-db`) and
  Render Redis (`intellabets-redis`), provisioned from `render.yaml`.
- **Two separate databases, two separate user tables.** A web customer has no
  engine account; the web app calls the engine server-to-server with
  `x-engine-key` (`ENGINE_SERVICE_KEY`), which must be **identical** on Vercel and
  Render or the picks pages load empty with no error (`web/lib/engine.ts`,
  `backend/src/modules/auth/guards/service-or-premium.guard.ts`).
- **DNS** → Cloudflare: `intellabets.com` → Vercel, `api.intellabets.com` → Render.

### Three payment rails (first-party Premium + AI plans)

`web/lib/billing/` is processor-agnostic. The consumer plans — **Premium
$19.99/mo** and **AI Picks $9.99/mo** (`web/lib/billing/pricing.ts`) — route
through whichever of three rails are configured:

| Rail | Provider id | File | Shape |
|---|---|---|---|
| Card | `authorizenet` | `web/lib/billing/providers/authorizenet.ts` | Accept Hosted redirect; recurring via ARB |
| Crypto (custodial) | `nowpayments` | `web/lib/billing/providers/nowpayments.ts` | Hosted invoice; per-month grant |
| Self-custody web3 | `web3` | `web/lib/billing/providers/web3.ts` | USDC on Base, verified by tx hash; per-month grant |

> Tipster subscriptions still go through Stripe Connect (`web/app/api/checkout/route.ts`,
> `type === "tipster"`). That rail is independent of the three above and is not
> required for Stage A/B of the consumer launch.

### Key principle: payments stay DORMANT until configured

Every rail reads its env **lazily** and reports `isConfigured()` per request
(`web/lib/billing/registry.ts`). With **no** payment env set:

- `resolveProvider()` returns `undefined`,
- `POST /api/checkout` returns a **clean 503** `{ code: "BILLING_UNAVAILABLE" }`
  (`web/lib/billing/degradation.ts`), not a 500,
- `GET /api/billing/providers` returns `{ providers: [], defaultProviderId: null }`.

A rail turns on/off purely by the presence of its keys **in the running
deployment's environment** — but on Vercel that environment is captured at deploy
time. `isConfigured()` is re-read per request, yet `process.env` itself does not
change until you **redeploy**: adding or removing a key in the Vercel dashboard
has **no effect on the live deployment until it is redeployed** (promote a new
deployment). This is what makes **Stage A (free product live) safe without any
payment setup**: deploy with no payment env and the site is fully live, checkout
degrading gracefully, until you set keys and redeploy for Stage B.

---

## 2. Stage A — free product live (no payments)

Goal: the public product is fully usable on the **free tier** — sign up,
dashboard, engine picks (`/picks`), leaderboard, betslips, support chat, and the
public legal/marketing pages — with payments cleanly dormant. **AI Picks and
premium tipster features are paid-gated**: a free account sees an upgrade prompt
on `/ai-picks` until it holds a subscription (see §A.5 for what is free vs. paid
and how to grant a test entitlement before Stage B).

### A.1 Deploy the backend engine to Render

Follow `docs/DEPLOY.md` Part 1: Render → New → Blueprint → pick
`free9dmc-cmd/intellabets` → Apply. `render.yaml` provisions `intellabets-api`,
`intellabets-db`, `intellabets-redis`.

Then set the variables that are **not** in the blueprint (Render dashboard →
`intellabets-api` → Environment). Per `docs/RUNBOOK.md`, a rebuild from the
blueprint drops these, so they must be set by hand:

- `ANTHROPIC_API_KEY` (marked `sync: false`)
- `THE_ODDS_API_KEY` (marked `sync: false`) — **the single credential that makes
  the product do its job**; with no key the engine ingests nothing and the picks
  pages stay empty.
- `ENGINE_SERVICE_KEY` — **not in `render.yaml` at all**. Generate with
  `openssl rand -hex 32`. Must match Vercel's value exactly.

`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `NODE_ENV=production`, `ADMIN_EMAILS`,
`ACTIVE_SPORTS`, `POLL_INTERVAL_MIN`, `SETTLE_INTERVAL_MIN` come from the
blueprint automatically.

The backend **auto-runs `prisma db push` on every boot** — `backend/Dockerfile`
CMD is `npx prisma db push --skip-generate --accept-data-loss && node dist/main`
— so the engine schema (users, games, odds snapshots, predictions, betslips) is
created on first deploy with no manual step.

Verify: `https://intellabets-api.onrender.com/api/docs` serves Swagger (free tier
cold-start can take ~30-60s).

### A.2 Create the Neon database and deploy the web app to Vercel

Import the repo in Vercel, **Root Directory = `web`** (the one setting that breaks
the build if wrong — `docs/RUNBOOK.md`). Set these env vars (Settings →
Environment Variables, Production):

| Var | Value | Get it from |
|---|---|---|
| `DATABASE_URL` | Neon connection string (web DB) | Neon / Vercel Neon integration |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` | generate |
| `NEXTAUTH_URL` | `https://intellabets.com` | your domain |
| `NEXT_PUBLIC_APP_URL` | `https://intellabets.com` | your domain (builds webhook/return URLs) |
| `ADMIN_EMAILS` | `free9dmc@icloud.com` | your admin email |
| `ANTHROPIC_API_KEY` | `sk-ant-…` | console.anthropic.com |
| `ENGINE_API_URL` | `https://api.intellabets.com/api/v1` | Render service URL |
| `ENGINE_SERVICE_KEY` | same value set on Render | must match Render exactly |
| `RESEND_API_KEY` / `EMAIL_FROM` | **required for account recovery** | resend.com — sends the password-reset email. Omit `RESEND_API_KEY` and **no reset email is ever sent**: `/api/auth/forgot-password` still returns its generic "if an account exists, a link is on its way" response (identical by design, so the response can't reveal who has an account — `web/lib/email.ts`, `web/app/api/auth/forgot-password/route.ts`), so the UI *looks* successful but the user never receives the link and **cannot recover the account**. `EMAIL_FROM` must be on a domain verified with Resend (defaults to `support@intellabets.com`). |

> A valid `ANTHROPIC_API_KEY` on **both** web and backend is what the Launch-Plan
> flagged as the fix for the AI-picks / support-chat **infra 503s**. The web key
> powers `/ai-picks` generation and support chat; the backend key powers the
> analyst that filters value bets. Note the distinction: the key clears the 503
> and powers the AI responses, but it does **not** grant AI Picks *access* —
> `/ai-picks` still returns **403 `NO_AI_SUB`** without an active Premium or AI
> subscription (`hasAIAccess()`, `web/lib/entitlements.ts`). Support chat needs no
> entitlement (auth optional).

### A.3 Push the WEB database schema (the manual, easy-to-forget step)

Unlike the backend, **the Vercel build does NOT push the schema** — `vercel.json`
`buildCommand` is only `prisma generate && next build`. The web Neon database must
be pushed by hand, once, and again after any `web/prisma/schema.prisma` change:

```bash
cd web
DATABASE_URL="<neon DIRECT (non-pooled) connection string>" npx prisma db push
# equivalently: DATABASE_URL="..." npm run db:push --workspace=@intellabets/web
```

If a local connection is awkward, Neon's dashboard **SQL Editor** runs the same
DDL (and sidesteps the `P1001` unquoted-`&` / sleeping-compute pitfalls noted in
`docs/RUNBOOK.md`).

This creates/reconciles (see §4 for the full list): tables `RateLimit`,
`ProcessedEvent`, `PaymentOrder`, `SupportTicket`, `SupportMessage`, `PlacedBet`,
`PasswordResetToken`, `Subscription`, `Payout`, `Betslip`, `Bet`; and the new
premium columns on `User` and `AISubscription`.

> **`RateLimit` must exist** or the shared rate limiter **fails open** by design
> (`web/prisma/schema.prisma`, `docs/RUNBOOK.md`) — `/api/support/chat` and
> others spend tokens per call with no cap until the table is present.

> **Never run `web/prisma/seed.ts` against production** — it deletes every user.
> It now refuses non-local databases, but the warning stands (`docs/LAUNCH.md`,
> `docs/LAUNCH-PLAN.md`).

### A.4 Point DNS (Cloudflare)

Per `docs/DEPLOY.md` Parts 2-3: `api.intellabets.com` → CNAME to the Render host;
`intellabets.com` + `www` → Vercel's A/CNAME records. Grey cloud (DNS only) during
verification.

### A.5 Stage A verification checklist

- [ ] Sign up a new account on `https://intellabets.com` (proves the web schema is
      pushed — a missing column returns 500 "Failed to create account").
- [ ] Log in; `/dashboard` loads.
- [ ] `/picks` loads real games/odds (needs `THE_ODDS_API_KEY` on Render +
      matching `ENGINE_SERVICE_KEY`; a sport out of season is empty, not broken).
- [ ] **Support chat** returns real AI answers (not the "live chat is unavailable"
      fallback) — confirms the web `ANTHROPIC_API_KEY`. Support chat is **free**:
      `POST /api/support/chat` only requires `isSupportConfigured()` (a well-formed
      Anthropic key); auth is optional and **no paid entitlement is needed**
      (`web/app/api/support/chat/route.ts`).
- [ ] `/ai-picks` as a brand-new **free** account shows the **"Unlock AI
      Predictions" upgrade screen**, not generated betslips — this is correct.
      AI Picks is **paid-gated**: `POST /api/ai-picks` returns **403 `NO_AI_SUB`**
      unless the account has active Premium or a standalone AI subscription
      (`hasAIAccess()`, `web/lib/entitlements.ts`). A valid `ANTHROPIC_API_KEY`
      clears the infra 503 and powers the AI responses, but it does **not** grant
      access — feature access still requires a subscription. In Stage A checkout
      is dormant (503), so a free user cannot self-upgrade; use the admin grant
      below to exercise the paid path before Stage B.
- [ ] **Test the paid path pre-payments:** as an `ADMIN_EMAILS` account, grant a
      test user Premium from `/admin` (or `PATCH /api/admin/users/<id>` with
      `{ "isPremium": true }`, which sets `isPremium=true` and `premiumUntil` to
      one year out — `web/app/api/admin/users/[id]/route.ts`). That user's
      `/ai-picks` then generates real betslips. (`DEMO_BILLING=true` also grants
      premium but is force-disabled when `NODE_ENV=production` — never use it in
      prod.)
- [ ] `/terms`, `/privacy`, `/refund`, `/contact` all load **signed out** (public
      per `web/middleware.ts`; underwriters and store review require this).
- [ ] `GET /api/billing/providers` returns `{ providers: [], defaultProviderId: null }`
      and `POST /api/checkout` (authenticated, `type: "premium"`) returns **503**
      `BILLING_UNAVAILABLE` — confirms payments are cleanly dormant.
- [ ] Revenue bypass closed: `POST /api/premium` and `POST /api/subscriptions`
      return **404** in production (`docs/RUNBOOK.md` manual checks).
- [ ] As an `ADMIN_EMAILS` address, `GET /api/admin/health` is green for database,
      RateLimit, Anthropic and engine.

---

## 3. Stage B — enable payments

Prerequisite for all rails: a **legal entity + business address** (needed to
underwrite the card rail and to register NOWPayments). Once the entity is formed,
**update the entity name in the policy pages** (`web/app/(main)/terms`,
`/privacy`, `/refund`) so they match the merchant of record the underwriter
reviews.

Enable rails independently. Each one you configure turns on **after you redeploy**
— set its env vars on Vercel, then redeploy/promote so a new deployment picks them
up; the checkout picker (`GET /api/billing/providers`) then offers only the rails
whose keys are present in that deployment.
`BILLING_PROVIDER` (`authorizenet` | `nowpayments` | `web3`, default
`authorizenet`) selects the default rail when the client doesn't specify one
(`web/lib/billing/registry.ts`).

### B.1 Card — Authorize.Net (the gateway behind "2Accept")

Env (all on **Vercel web**; read in `web/lib/billing/providers/authorizenet.ts`):

| Var | What it is | Where to get it |
|---|---|---|
| `AUTHNET_API_LOGIN_ID` | merchant API Login ID | Authorize.Net merchant account |
| `AUTHNET_TRANSACTION_KEY` | transaction key | Authorize.Net → Account → Security → API Credentials |
| `AUTHNET_SIGNATURE_KEY` | **distinct** from the transaction key; webhooks are HMAC-SHA512 signed with it | Authorize.Net → Account → Security → API Credentials |
| `AUTHNET_ENV` | `production` for live; anything else = sandbox | you set it |

> **Confirm the MID gateway type with 2Accept first.** The implemented card rail
> speaks **Authorize.Net's** API (Accept Hosted + ARB). The code documents an
> **NMI "SEAM" that is a future drop-in and is NOT built** (see the header comment
> in `authorizenet.ts`). If 2Accept provisions an **NMI** gateway rather than an
> **Authorize.Net** one, these three credentials won't exist and the rail won't
> work until an `nmi.ts` provider is written. Ask 2Accept to confirm you are
> getting an Authorize.Net MID (API Login ID + Transaction Key + Signature Key).

Register the webhook in the Authorize.Net merchant interface (Account →
Notifications / Webhooks):
- URL: `https://intellabets.com/api/webhooks/authorizenet`
- Events the code acts on (`verifyWebhook` in `authorizenet.ts`):
  - `net.authorize.payment.authcapture.created` (initial + ARB-renewal captures → grant)
  - `net.authorize.customer.subscription.cancelled` (→ revoke)
- Authorize.Net signs with header `X-ANET-Signature: sha512=<HEX>` using the
  **Signature Key** (hex-decoded) — so the Signature Key in the dashboard and in
  `AUTHNET_SIGNATURE_KEY` must match.

Test → flip:
1. Set `AUTHNET_ENV=sandbox` with sandbox credentials. Run a Premium checkout; the
   hosted page is `test.authorize.net`. Confirm the authcapture webhook grants
   premium (user `isPremium=true`, `premiumProvider="authorizenet"`).
2. Swap to production credentials and set `AUTHNET_ENV=production`. Re-register the
   webhook against the production account. Do one live low-value capture, confirm
   the grant, then refund it in the Authorize.Net dashboard.

### B.2 Crypto (custodial) — NOWPayments

Env (**Vercel web**; read in `web/lib/billing/providers/nowpayments.ts`):

| Var | What it is | Where to get it |
|---|---|---|
| `NOWPAYMENTS_API_KEY` | API key (enables the rail) | NOWPayments dashboard → Store Settings → API keys |
| `NOWPAYMENTS_IPN_SECRET` | **distinct** from the API key; verifies the `x-nowpayments-sig` HMAC-SHA512 on callbacks | NOWPayments dashboard → Store Settings → IPN |
| `NOWPAYMENTS_SANDBOX` | `true` → `api-sandbox.nowpayments.io` | you set it |

In the NOWPayments dashboard also:
- Set your **outcome/payout wallet** (where settled funds go) — this lives in
  NOWPayments, not in app env.
- Enable **IPN** and set/confirm the callback. The app sends the callback URL
  automatically on each invoice (`ipn_callback_url: ${NEXT_PUBLIC_APP_URL}/api/webhooks/nowpayments`),
  so make sure IPN is turned on and the IPN secret matches `NOWPAYMENTS_IPN_SECRET`.

Test → flip:
1. `NOWPAYMENTS_SANDBOX=true` with a sandbox API key + IPN secret. Run a Premium
   checkout, pay the sandbox invoice, confirm the IPN grants one month
   (`payment_status` `finished`/`confirmed` → grant; underpayment is rejected).
2. Set `NOWPAYMENTS_SANDBOX=false` (or remove it) with production keys; re-set the
   IPN secret for the live store.

### B.3 Self-custody web3 — USDC on Base

Env (read in `web/lib/billing/providers/web3.ts`; browser vars are `NEXT_PUBLIC_*`):

| Var | Service | What it is | Where to get it |
|---|---|---|---|
| `WEB3_RECEIVING_ADDRESS` | Vercel web (server) | the single address that receives USDC on Base | your wallet |
| `WEB3_RPC_URL` | Vercel web (server) | server-side Base RPC used to verify transactions | Alchemy / Infura / QuickNode Base endpoint |
| `WEB3_CONFIRMATIONS` | Vercel web (server) | confirmations before crediting (default `3`) | you set it |
| `WEB3_SANDBOX` | Vercel web (server) | `true` → Base Sepolia testnet | you set it |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Vercel web (public) | Reown Cloud / WalletConnect project id | cloud.reown.com |
| `NEXT_PUBLIC_WEB3_RPC_URL` | Vercel web (public) | Base RPC the wallet UI uses | RPC provider |
| `NEXT_PUBLIC_WEB3_SANDBOX` | Vercel web (public) | **must match** `WEB3_SANDBOX` | you set it |

The rail reports configured once `WEB3_RECEIVING_ADDRESS` **and** `WEB3_RPC_URL`
are set. There is **no webhook** — the browser does the USDC ERC-20 transfer, then
the authenticated client POSTs the tx hash + order id to the confirm endpoint,
which reads the chain and verifies the Transfer against the server-pinned order:

- Confirm endpoint: `POST https://intellabets.com/api/webhooks/web3/confirm`
  (`web/app/api/webhooks/web3/confirm/route.ts`). Returns 503 if the rail is
  unconfigured. Trust comes entirely from on-chain verification
  (`web/lib/billing/providers/web3-verify.ts`), not from the client.

Test → flip:
1. `WEB3_SANDBOX=true` / `NEXT_PUBLIC_WEB3_SANDBOX=true`, a Base Sepolia RPC, and a
   testnet receiving address. Pay the exact per-order amount with testnet USDC,
   wait `WEB3_CONFIRMATIONS` blocks, confirm the grant.
2. Set both sandbox flags to `false`, point both RPC URLs at Base mainnet, set the
   mainnet receiving address.

---

## 4. The `prisma db push` details

- **No migrations directory exists** in either package — the project uses
  `prisma db push` as the schema mechanism (`docs/RUNBOOK.md` "Schema
  migrations"). There is nothing to `prisma migrate deploy`.
- **Backend (Render): automatic.** `backend/Dockerfile` CMD runs
  `npx prisma db push --skip-generate --accept-data-loss && node dist/main` on
  every boot, so the engine schema is synced on each deploy.
- **Web (Vercel): manual.** `vercel.json` build is only `prisma generate &&
  next build`; it never touches the live database. You must run (once, and after
  any schema change):
  ```bash
  cd web && DATABASE_URL="<neon direct url>" npx prisma db push
  ```
  This exact gap previously took `User.premiumStripeSubId` out of sync with
  production and broke every login/registration for two weeks
  (`docs/LAUNCH-PLAN.md` P0.1, `docs/RUNBOOK.md` Known issues). `next build` and
  `tsc` validate against the schema file, **not** the live DB, so they cannot warn
  you the push was skipped.

What the web push creates/reconciles for the payment merge
(`web/prisma/schema.prisma`):

- **New tables:**
  - `ProcessedEvent` — idempotency ledger; `@@unique([provider, eventId])`. Every
    webhook / on-chain confirmation is claimed here before the grant is applied so
    retries never double-grant.
  - `PaymentOrder` — the server-pinned pending order (`provider`, `plan`,
    `userId`, `expectedAmount`, `currency`, `invoiceNumber`, web3 fields
    `chainId`/`tokenAddress`/`recipient`/`fromAddress`, `status`, `txHash`), with
    `@@unique([txHash])` so one settled tx can't settle two orders.
  - `RateLimit` — durable, shared fixed-window counter (limiter fails open if
    absent).
- **New columns (additive — existing rows keep nulls):**
  - `User.premiumProvider`, `User.premiumProviderSubId` (provider-neutral backing,
    additive to the existing `premiumStripeSubId`).
  - `AISubscription.provider`, `AISubscription.providerSubId`.
  - Written only by `web/lib/billing/events.ts` on a verified grant/revoke.
- Plus any earlier drift (`SupportTicket`, `SupportMessage`, `PlacedBet`,
  `PasswordResetToken`, `payoutsEnabled`, `preferredBook`) that a long-unsynced
  production DB may still be missing; `db push` reconciles everything to the
  current schema in one shot.

> **Monorepo footgun** (`README.md`, `AGENTS.md`): `web/` and `backend/` have
> different Prisma schemas that both generate into the hoisted
> `node_modules/@prisma/client`. Each package's `prebuild`/`postinstall` re-runs
> `prisma generate` for itself, so run `prisma db push` / tests **from inside the
> package you mean** — running the engine's push from `web/` regenerates the wrong
> client.

---

## 5. Environment variable reference

Secret = never `NEXT_PUBLIC_`; Public = `NEXT_PUBLIC_*` (shipped to the browser).
Authoritative source: `web/.env.example`, root `.env.example`, `render.yaml`, and
the billing provider files. (There is no `backend/.env.example`; the root
`.env.example` is the engine/web combined reference.)

### Vercel (web)

| Variable | Stage | Secret/Public | Purpose / where to get it |
|---|---|---|---|
| `DATABASE_URL` | A | Secret | Neon web DB connection string |
| `NEXTAUTH_SECRET` | A | Secret | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | A | Public-ish | `https://intellabets.com` |
| `NEXT_PUBLIC_APP_URL` | A | Public | `https://intellabets.com` — builds webhook/return URLs |
| `ADMIN_EMAILS` | A | Public-ish | `free9dmc@icloud.com` — grants `/admin` |
| `ANTHROPIC_API_KEY` | A | Secret | console.anthropic.com — AI picks + support chat |
| `ENGINE_API_URL` | A | Public-ish | `https://api.intellabets.com/api/v1` |
| `ENGINE_SERVICE_KEY` | A | Secret | `openssl rand -hex 32`; **must match Render** |
| `RESEND_API_KEY` / `EMAIL_FROM` | A (**required for password reset**) | Secret / plain | resend.com — sends the password-reset email; omit `RESEND_API_KEY` and no reset email is sent (the API still returns its generic success, so account recovery silently fails). `EMAIL_FROM` domain must be verified with Resend |
| `BILLING_PROVIDER` | B (optional) | plain | `authorizenet`\|`nowpayments`\|`web3` (default `authorizenet`) |
| `AUTHNET_API_LOGIN_ID` | B (card) | Secret | Authorize.Net merchant |
| `AUTHNET_TRANSACTION_KEY` | B (card) | Secret | Authorize.Net API credentials |
| `AUTHNET_SIGNATURE_KEY` | B (card) | Secret | Authorize.Net API credentials (distinct from txn key) |
| `AUTHNET_ENV` | B (card) | plain | `production` for live |
| `NOWPAYMENTS_API_KEY` | B (crypto) | Secret | NOWPayments dashboard |
| `NOWPAYMENTS_IPN_SECRET` | B (crypto) | Secret | NOWPayments IPN settings |
| `NOWPAYMENTS_SANDBOX` | B (crypto) | plain | `true` for sandbox |
| `WEB3_RECEIVING_ADDRESS` | B (web3) | Secret-ish | your USDC-on-Base address |
| `WEB3_RPC_URL` | B (web3) | Secret | server-side Base RPC provider |
| `WEB3_CONFIRMATIONS` | B (web3) | plain | default `3` |
| `WEB3_SANDBOX` | B (web3) | plain | `true` = Base Sepolia |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | B (web3) | Public | Reown/WalletConnect Cloud |
| `NEXT_PUBLIC_WEB3_RPC_URL` | B (web3) | Public | Base RPC for wallet UI |
| `NEXT_PUBLIC_WEB3_SANDBOX` | B (web3) | Public | must match `WEB3_SANDBOX` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | optional | Secret | tipster subscriptions only; Stripe account was terminated — delete unless a live Stripe account exists (`docs/RUNBOOK.md`) |
| `REVENUECAT_WEBHOOK_SECRET` | optional | Secret | mobile IAP; keep set so the webhook fails closed |
| `DEMO_BILLING` | — | — | **NEVER set in production** (force-disabled when `NODE_ENV=production`; grants free premium) |

### Render (backend engine)

| Variable | Stage | Source | Purpose |
|---|---|---|---|
| `DATABASE_URL` | A | blueprint (from Render Postgres) | engine DB |
| `REDIS_URL` | A | blueprint (from Render Redis) | BullMQ queue |
| `JWT_SECRET` | A | blueprint (`generateValue`) | engine auth |
| `NODE_ENV` | A | blueprint (`production`) | — |
| `ADMIN_EMAILS` | A | blueprint (`free9dmc@icloud.com`) | engine admin |
| `ACTIVE_SPORTS` | A | blueprint | which sports ingest |
| `POLL_INTERVAL_MIN` / `SETTLE_INTERVAL_MIN` | A | blueprint | scheduler cadence |
| `ANTHROPIC_API_KEY` | A | **set by hand** (`sync: false`) | analyst value-bet filter |
| `THE_ODDS_API_KEY` | A | **set by hand** (`sync: false`) | odds data — no key, no picks |
| `ENGINE_SERVICE_KEY` | A | **set by hand (not in `render.yaml`)** | must match Vercel exactly |

---

## 6. Post-launch / recommended next

- **Valid `ANTHROPIC_API_KEY`** on web + backend resolves the current AI-picks /
  support-chat infra **503s** (`docs/LAUNCH-PLAN.md` P1). It powers the AI
  responses but does not unlock AI Picks — access to `/ai-picks` still requires a
  subscription (`hasAIAccess()`); support chat is free.
- **Error monitoring** — add Sentry (or equivalent); production is otherwise blind
  to runtime errors.
- **Dependency advisories** — ~94 npm vulnerabilities outstanding and a Next.js
  14 → 15 upgrade advisory; schedule the bump and audit.
- **Stubs** — `admin-web/` (React/Vite) and `mobile/` (Expo) are early/shell-only;
  not on the launch path.
- **Legacy Stripe** — delete `STRIPE_SECRET_KEY` from Vercel until a live Stripe
  account exists, so the tipster rail returns a clean 503 instead of a 500 on a
  revoked-but-well-formed key.

---

## 7. Verification & rollback

### Confirm each stage

- **Stage A live:** sign up + log in succeed; `/picks` and `/ai-picks` return real
  data; support chat answers; `/terms`, `/privacy`, `/refund`, `/contact` are
  public; `GET /api/admin/health` green. (Full manual curl set in
  `docs/RUNBOOK.md`.)
- **Payments dormant (pre-Stage-B):** `GET /api/billing/providers` →
  `{ providers: [], defaultProviderId: null }`; authenticated `POST /api/checkout`
  (`type: "premium"`) → **503** `BILLING_UNAVAILABLE`. `POST /api/premium` and
  `POST /api/subscriptions` → **404**.
- **Per rail (Stage B):** `GET /api/billing/providers` lists the rail you just
  configured; a sandbox checkout completes and grants the plan; the grant is
  idempotent (a replayed webhook/tx is deduped via `ProcessedEvent`).

### Rollback

- **Turn a rail off** — clear its env vars (or `BILLING_PROVIDER`) **and
  redeploy**. `isConfigured()` is re-evaluated per request, but a running Vercel
  deployment keeps the `process.env` it was built with, so the change only takes
  effect once a new deployment goes live. After the redeploy the rail disappears
  from `/api/billing/providers` and checkout reverts to the clean 503; clearing
  **all** payment env and redeploying returns the whole billing surface to dormant
  503. The kill switch is "clear env **+ redeploy**", not an env change alone —
  removing keys without redeploying leaves the live deployment still accepting
  payments.
- **Bad schema push** — `prisma db push` is additive here (new tables + nullable
  columns); it does not drop existing data for this change set. If the web app
  errors with "column … does not exist", the push was skipped — re-run §4.
- **Engine issues** — the engine auto-pushes its schema on boot; roll back by
  redeploying the previous Render image. Picks-empty-with-no-error almost always
  means `ENGINE_SERVICE_KEY` drifted between Vercel and Render (`docs/RUNBOOK.md`
  symptoms table).
