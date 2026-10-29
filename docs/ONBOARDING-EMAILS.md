# Onboarding email copy

Draft text for the first transactional/lifecycle emails. **Not wired up:** no
email provider is configured (LAUNCH-PLAN P1/P2). When one is, these are the
templates; send them from the account's registered address only.

## Rules for every email

- Minimum age is **21** (changed from 18 in `95e5340`). Footer states it.
- No win rates, ROI, records, testimonials, subscriber counts or earnings.
  Positive expected value is a statement about price, not about whether a bet
  wins. Nothing here promises an outcome.
- Every email carries the responsible-gambling footer and an unsubscribe link
  (marketing mails only; account/security mails are exempt).
- No sportsbook credentials are ever requested. IntellaBets does not place bets.
- Never quote a CLV average: the sample is too small under corrected settlement.

## Shared footer

> IntellaBets is an analytics service, not a sportsbook. We do not accept or
> place bets. You must be 21 or older. Betting involves risk and you can lose
> money; no pick or price comparison guarantees a result. If gambling is a
> problem for you or someone you know, call 1-800-GAMBLER (US) or visit
> https://intellabets.com/responsible-gambling.
> {{unsubscribe_link}} (marketing emails only)

---

## 1. Welcome (send immediately after registration)

**Subject:** Your IntellaBets account is ready
**Preview:** What the site does, and what it doesn't.

Hi {{first_name_or_"there"}},

Your account is set up. Here is what IntellaBets actually does, in three lines:

1. We collect prices from many sportsbooks for the same game.
2. We remove each book's built-in margin (the "vig") to estimate the market's
   consensus probability.
3. We flag where the best available price is better than that consensus.

That gap between price and consensus is the whole product. It does not tell you
who will win, and any single bet can lose. Read the short version here:
{{app_url}}/how-it-works

**Where to start:** {{app_url}}/picks

Bet only what you can afford to lose, and set limits before you start:
{{app_url}}/responsible-gambling

— The IntellaBets team

{{shared_footer}}

---

## 2. Day 2 — how to read a price (marketing; unsubscribe required)

**Subject:** Reading a price: what "edge" does and doesn't mean
**Preview:** A better price is not a guaranteed winner.

Hi {{first_name_or_"there"}},

When a pick shows an "edge", it means the best available price is higher than
the price implied by the no-vig consensus. A price edge says the bet was
*cheaper than it should be*. It does not say the bet will win.

Over a small number of bets, results are dominated by luck either way. That is
why we don't publish a win rate, and why you shouldn't judge a method by a week.

A worked, clearly illustrative example (not a real game) is on
{{app_url}}/how-it-works.

{{shared_footer}}

---

## 3. Day 5 — closing line value (marketing; unsubscribe required)

**Subject:** CLV: a better yardstick than a hot streak
**Preview:** And why we don't quote an average yet.

Hi {{first_name_or_"there"}},

Closing line value compares the price you took with the market's final price.
Consistently beating the close is one common sign of price quality, but it has
limits, and a small sample proves nothing.

We are not publishing a CLV average yet: our settlement logic was corrected and
we are waiting for enough games to settle under the corrected logic. We will
say so plainly rather than quote a number that isn't ready.

Explainer: {{app_url}}/closing-line-value

{{shared_footer}}

---

## 4. Day 7 — plans (marketing; send only once a processor is live)

**Subject:** What Premium includes
**Preview:** Plain description, no promises about results.

Hi {{first_name_or_"there"}},

Premium unlocks the full slate of price comparisons and tools. It is a data
and analysis subscription; it does not include guaranteed outcomes, and we do
not take or place bets for you.

Plans, prices and the refund policy: {{app_url}}/premium and {{app_url}}/refund.
Billing details must match the live processor before this email is enabled.

{{shared_footer}}

---

## Transactional (no unsubscribe, plain)

- **Password reset / email verification:** one sentence, one link, expiry time,
  "If you didn't request this, ignore it." No marketing content.
- **Receipt / renewal notice:** plan, amount, date, how to cancel, link to
  {{app_url}}/refund. Send a renewal notice before each renewal if the processor
  or state law requires it.

## Open items before sending anything

1. Choose and configure an email provider (SPF/DKIM/DMARC on intellabets.com).
2. Confirm CAN-SPAM requirements: physical postal address in marketing footers,
   working unsubscribe. The business address is an owner decision.
3. Confirm the helpline wording against `/responsible-gambling` at send time.
