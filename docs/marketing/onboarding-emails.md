# Onboarding email copy (draft — not wired up)

Status: text only. No transactional email provider is configured yet (see
LAUNCH-PLAN P1/P2), so nothing sends these. Merge fields: `{{name}}`, `{{app_url}}`.

Rules for every email: no win rates, ROI, records, testimonials, subscriber
counts or earnings; no "guaranteed"; positive EV is a statement about price,
not about whether a bet wins. Footer on every email (required):

> 18+ only. IntellaBets is an analytics tool, not a bookmaker; we do not take
> bets. Betting involves risk and you can lose money. If it stops being fun,
> visit {{app_url}}/responsible-gambling. Reply STOP to unsubscribe.

---

## 1. Welcome (send on registration)

**Subject:** Welcome to IntellaBets — here's how it works

Hi {{name}},

Thanks for signing up. IntellaBets compares prices across major sportsbooks,
removes each book's built-in margin (the "vig"), and shows where the best
available price is better than the market's own consensus.

That gap in price is the whole product. It is not a prediction that any single
bet will win — plenty of well-priced bets lose, and the results of a small
number of bets say very little.

Start here: {{app_url}}/how-it-works (a worked example of the method, clearly
labeled as illustrative).

We do not publish a win rate, because we don't yet have enough settled data to
say anything honest about one.

— The IntellaBets team

## 2. Day 2: Reading a pick

**Subject:** How to read a pick (and what "edge" means)

Hi {{name}},

Each pick shows the price at the best book, the de-vigged consensus price, and
the difference. "Edge" here means *the price is better than consensus*. It does
not mean the bet is likely to win.

Two habits worth building: compare the price you can actually get before
placing anything, and size every bet as money you can afford to lose.

More on measuring price quality: {{app_url}}/closing-line-value. Note that we
are not publishing a closing-line-value average yet; the sample is too small.

## 3. Day 5: Set your limits

**Subject:** Set your limits before you need them

Hi {{name}},

A quick note that matters more than any pick: decide your budget and time
limits in advance and keep to them. Never chase losses. Never bet money needed
for essentials.

Warning signs, limit-setting tips and help lines (US and UK):
{{app_url}}/responsible-gambling

## 4. Day 7: Premium (send only once checkout is live)

**Subject:** What Premium adds

Hi {{name}},

Premium details and current prices are on {{app_url}}/premium. Cancel any time
per our terms; refund terms are on {{app_url}}/contact. Premium does not
guarantee profit, and betting can lose money.

Do not send this email until a payment processor is live and the prices and
refund policy on the site match what the processor will actually do.
