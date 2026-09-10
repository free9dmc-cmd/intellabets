# IntellaBets — Launch Checklist

One page. Two lists: what's done, and what only you can do.

---

## Payment processor: Stripe + Stripe Connect

**You are eligible.** Stripe's restricted list prohibits *"sports forecasting or
odds-making **with a monetary or material prize**."* IntellaBets takes no wagers
and awards no prizes — it sells analysis by subscription, which is not on the
list.

You need **two** Stripe pieces:

| Piece | Why |
|---|---|
| Stripe (standard) | Take subscription payments from customers |
| **Stripe Connect** (Express) | Pay tipsters their 80%. Plain Stripe cannot send money to third parties. Stripe collects their identity + bank details and issues their 1099s. |

Enable Connect at **dashboard.stripe.com → Connect → Get started**, and choose
**Express** accounts.

### One compliance risk to fix before applying
Stripe also prohibits *"'Get rich quick' schemes … that promise high rewards to
mislead consumers."* The premium page's **"Your Earning Potential"** table shows
figures up to **$11,995/mo**. A risk reviewer could read that as promising high
rewards. Soften it to realistic numbers with a "results not typical" note before
you submit for review — cheap insurance against a frozen account.

---

## ✅ Fixed in code (verified, committed)

These were all real and would have cost money or customers:

| Was broken | Consequence |
|---|---|
| `GET /api/betslips` had no auth check | **Anyone could read every private pick** — the entire paid product, free |
| Mock billing endpoints live in production | Any user could `curl` themselves free Premium + AI |
| Renewals never handled | Customers charged from month 2 while the app **locked them out** |
| Cancelling didn't call Stripe | Customers **billed forever** after cancelling |
| No way to cancel Premium/AI at all | Consumer-protection problem → chargebacks |
| No payout mechanism | Tipsters could never be paid the 80% you promise |
| Payouts double-counted revenue | Withdrawals could exceed money actually collected |
| Payouts only on first payment | Tipsters earned once, no matter how long a subscriber stayed |
| Premium not revoked on Stripe cancel | Cancelled members kept access |
| AI Picks not included in Premium | Members could be charged twice for the same thing |

---

## 👤 Only you can do these

### 1. Stripe (required to take money)
- [ ] Create/complete your Stripe account
- [ ] **Developers → API keys** → copy the **Secret key**
- [ ] **Developers → Webhooks → Add endpoint**
  - URL: `https://intellabets.com/api/webhooks/stripe`
  - Events: `checkout.session.completed`, `invoice.payment_succeeded`,
    `customer.subscription.deleted`, `account.updated`
  - Copy the **Signing secret**
- [ ] **Connect → Get started → Express** (enables tipster payouts)
- [ ] Start in **Test mode**, verify with card `4242 4242 4242 4242`, then switch to live keys

> ⚠️ The webhook events above are not optional. Miss `invoice.payment_succeeded`
> and paying customers lose access after month one. Miss `account.updated` and
> tipsters can never withdraw.

### 2. Database
- [ ] **Rotate your Neon password** — the old connection string was pasted into a chat
- [ ] From `web/`: `npx prisma db push` then `npx tsx prisma/seed.ts`

### 3. Deploy the web app
- [ ] [vercel.com/new](https://vercel.com/new) → import the repo
- [ ] **Root Directory: `web`** ← the one setting that must be right
- [ ] Env vars (see table below) → Deploy
- [ ] **Domains** → add `intellabets.com` + `www` → add the DNS records in Cloudflare (grey cloud during verification)

### 4. Verify it's actually safe (2 minutes, do not skip)
```bash
# Must return 404 — proves the free-premium bypass is closed
curl -i -X POST https://intellabets.com/api/premium \
  -H 'Content-Type: application/json' -d '{"type":"premium"}'

# Must NOT list private betslips — proves paid content is gated
curl -s https://intellabets.com/api/betslips | head -c 400
```

---

## Production environment variables

| Variable | Value | Type |
|---|---|---|
| `DATABASE_URL` | rotated Neon string | Sensitive |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` | Sensitive |
| `NEXTAUTH_URL` | `https://intellabets.com` | Plain |
| `NEXT_PUBLIC_APP_URL` | `https://intellabets.com` | **Plain — required** |
| `ADMIN_EMAILS` | your email | Plain |
| `ANTHROPIC_API_KEY` | `sk-ant-…` | Sensitive |
| `STRIPE_SECRET_KEY` | `sk_live_…` | Sensitive |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | Sensitive |

`STRIPE_PUBLISHABLE_KEY` is **not** used — checkout is a server-side redirect.

**Never set `DEMO_BILLING` in production.** It gates the free-entitlement
endpoints and is force-disabled when `NODE_ENV=production`, but don't tempt it.

---

## Known gaps (not blocking launch, worth knowing)

- **Webhook idempotency.** Stripe retries deliveries. There's no processed-event
  table, so a retried `invoice.payment_succeeded` could create a duplicate payout
  row. Withdrawals are idempotent, so money can't leave twice — but the ledger
  could overstate. Add a `ProcessedWebhookEvent` table before volume grows.
- **Refunds and disputes** (`charge.refunded`, `charge.dispute.created`) aren't
  handled — a refunded customer keeps access until the period lapses.
- **Two separate user databases.** The web app (Neon) and the prediction API
  (Render) have independent user tables. An account on one is not an account on
  the other. Fine for launch; unify before cross-selling.
- **Win rates are real** — computed from settled predictions, not fabricated.
  Keep it that way; fabricated performance claims are the fastest way to lose a
  payment processor.
