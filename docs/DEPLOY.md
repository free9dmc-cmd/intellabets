# IntellaBets — Going Live

Three pieces go to production:

1. **Backend API** (NestJS) → Render (with Postgres + Redis)
2. **Web app** (Next.js marketing/app) → Vercel
3. **Domain** `intellabets.com` → Cloudflare DNS pointing at both

Do them in that order.

---

## Part 1 — Deploy the backend to Render

Render provisions the API, a Postgres database, and Redis together from the
`render.yaml` blueprint in this repo.

### Steps
1. Go to **[render.com](https://render.com)** → sign up (free), connect your GitHub.
2. **New → Blueprint** → select the `free9dmc-cmd/intellabets` repo.
3. Render reads `render.yaml` and shows: `intellabets-api`, `intellabets-db`, `intellabets-redis`. Click **Apply**.
4. First build takes ~5 min (it builds the Docker image, provisions DB + Redis).
5. After it deploys, open the **intellabets-api** service → **Environment** → set the two secrets it left blank:
   - `THE_ODDS_API_KEY` = your Odds API key
   - `ANTHROPIC_API_KEY` = your Anthropic key
6. Click **Save** → it redeploys automatically.

### Verify
Your API is live at `https://intellabets-api.onrender.com` (Render gives you the URL).
Open `https://intellabets-api.onrender.com/api/docs` — you should see Swagger.

> **Free tier notes:** the free web service **sleeps after 15 min idle** (first
> request after that takes ~30s to wake). Free Postgres expires after 90 days.
> For a real launch, upgrade the web service + database to a paid plan
> ($7/mo each) so it stays warm and persistent.

---

## Part 2 — Point your domain at the API (Cloudflare)

1. In **Render** → intellabets-api → **Settings → Custom Domains** → add
   `api.intellabets.com`. Render shows a target hostname (e.g.
   `intellabets-api.onrender.com`).
2. In **Cloudflare** → your `intellabets.com` zone → **DNS → Add record**:
   - Type: **CNAME**
   - Name: `api`
   - Target: the Render hostname
   - Proxy status: **DNS only** (grey cloud) for the first verification, then
     you can enable proxy if desired.
3. Wait for Render to verify (a few minutes). Your API is now at
   `https://api.intellabets.com`.

---

## Part 3 — Deploy the web app to Vercel

The consumer web app lives in `web/` (Next.js 14, App Router).

1. Go to **[vercel.com](https://vercel.com)** → **Add New → Project** → import the repo.
2. **Root Directory:** set to **`web`** (critical — the Next.js app lives there, not at the repo root).
3. Add environment variables (Settings → Environment Variables). Exact list:

| Variable | Value | Required? |
|---|---|---|
| `DATABASE_URL` | your Neon Postgres connection string | **yes** — app won't run without it |
| `NEXTAUTH_SECRET` | output of `openssl rand -base64 32` | **yes** — sessions break without it |
| `NEXTAUTH_URL` | `https://intellabets.com` | **yes** in production |
| `NEXT_PUBLIC_APP_URL` | `https://intellabets.com` | yes — used for Stripe redirect URLs |
| `ADMIN_EMAILS` | `free9dmc@icloud.com` | yes — grants `/admin` access |
| `ANTHROPIC_API_KEY` | `sk-ant-…` | yes — AI picks fail without it |
| `STRIPE_SECRET_KEY` | `sk_test_…` or `sk_live_…` | for real payments |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | for real payments |
| `REVENUECAT_WEBHOOK_SECRET` | from RevenueCat | only when mobile IAP goes live |

> **Note:** `STRIPE_PUBLISHABLE_KEY` is **not** needed. Checkout is a
> server-side redirect to Stripe-hosted checkout, so the publishable key is
> never used by this app.
>
> **Demo billing is force-disabled in production.** The mock activation
> endpoints (`POST /api/premium`, `POST /api/subscriptions`) grant paid
> entitlements with no payment, so they return 404 whenever
> `NODE_ENV=production` — see `web/lib/billing-guard.ts`. Consequently, if you
> deploy **without** `STRIPE_SECRET_KEY`, checkout returns a 503 and nobody can
> subscribe. That is intentional (fail closed). Set the Stripe keys before
> launch. **Never set `DEMO_BILLING` in the Vercel production environment.**

4. **Deploy.**
5. Add your domain: Vercel → Project → **Domains** → add `intellabets.com` and
   `www.intellabets.com`. Vercel gives you DNS records — add them in Cloudflare:
   - `intellabets.com` → A record `76.76.21.21` (or whatever Vercel shows)
   - `www` → CNAME `cname.vercel-dns.com`
   - Set Cloudflare proxy to **DNS only** (grey cloud) during verification.

### Stripe webhook (required for subscriptions to activate)

In Stripe → **Developers → Webhooks → Add endpoint**:
- URL: `https://intellabets.com/api/webhooks/stripe`
- Events: `checkout.session.completed`, `customer.subscription.deleted`
- Copy the **Signing secret** (`whsec_…`) into Vercel as `STRIPE_WEBHOOK_SECRET`

Launch in Stripe **Test mode** first: test card `4242 4242 4242 4242`, any
future expiry, any CVC. Verify a subscription activates end to end, then swap
in the `sk_live_…` key and the live-mode webhook secret.

---

## Part 4 — Point the mobile app at production

In the Expo app, set the API base URL to production before building:
```
EXPO_PUBLIC_API_URL=https://api.intellabets.com/api/v1
```
Then build with EAS (`npm run build:ios`) as covered in `docs/xcode-checklist.md`.

---

## Post-launch checklist

- [ ] Both keys set in Render (Odds API + Anthropic)
- [ ] `/api/docs` reachable at `https://api.intellabets.com/api/docs`
- [ ] Register your admin account against production, confirm `isAdmin: true`
- [ ] Trigger one manual poll to seed data:
      `POST https://api.intellabets.com/api/v1/ingestion/poll?sport=baseball_mlb`
- [ ] Upgrade Render web + DB off free tier before real users arrive
- [ ] Rotate any key that ever touched a chat/log
- [ ] Confirm `DEMO_BILLING` is **not** set in the Vercel production environment
- [ ] Smoke-test the bypass is closed against production (must return 404):
      `curl -i -X POST https://intellabets.com/api/premium -H 'Content-Type: application/json' -d '{"type":"premium"}'`
- [ ] If the app was ever deployed before this fix, audit for free grants:
      `User.isPremium=true` with no Stripe record, and `AISubscription`/
      `Subscription` rows where `stripeSubId IS NULL`; review any `Payout`
      rows those accounts generated before paying out
- [ ] Confirm RevenueCat webhook URL points at `https://api.intellabets.com/api/v1/webhooks/revenuecat` (when IAP goes live)

## Environment variables reference (production)

| Var | Where it comes from |
|-----|---------------------|
| `DATABASE_URL` | auto-wired by Render from the Postgres service |
| `REDIS_URL` | auto-wired by Render from the Redis service |
| `JWT_SECRET` | auto-generated by Render |
| `THE_ODDS_API_KEY` | you set it (secret) |
| `ANTHROPIC_API_KEY` | you set it (secret) |
| `ADMIN_EMAILS` | your email (in blueprint) |
| `ACTIVE_SPORTS` | which sports poll (default baseball_mlb) |
| `POLL_INTERVAL_MIN` / `SETTLE_INTERVAL_MIN` | scheduler cadence |
