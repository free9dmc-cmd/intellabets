# Onboarding email sequence (draft copy)

Status: **copy only — nothing sends these yet.** No transactional email
provider is configured (LAUNCH-PLAN P1/P2). Wire this up when one exists; the
triggers below are written so they map to events the app already records.

## Rules for every email in this sequence

- No win rates, ROI, records, testimonials, subscriber counts or earnings.
  If a number appears it must be labeled illustrative, or come from real
  settled data (none is published yet).
- No "guaranteed", "lock", "can't lose", "free money".
- Positive expected value is a statement about price relative to the market
  consensus, not a prediction that a bet wins.
- CLV is not quoted: the sample under the corrected settlement logic is too
  small. Say so if CLV comes up.
- Every email carries the footer below.
- Never ask for sportsbook logins. IntellaBets does not place bets.
- Placeholders in `{{double braces}}` are filled by the sender.

## Footer (all emails)

> You must be 18+ (21+ where your state requires it) to use IntellaBets.
> IntellaBets provides information and analysis only. We do not accept or
> place bets, and nothing here is a guarantee of any outcome — bets can and do
> lose. If gambling stops being fun, help is free and confidential:
> 1-800-522-4700 (US, 24/7) or https://intellabets.com/responsible-gambling.
> {{unsubscribe_link}} · {{postal_address}}

---

## 1. Welcome — trigger: account created

**Subject:** Welcome to IntellaBets — here's how it works
**Preview:** We show you where prices beat the market. That's the whole product.

Hi {{first_name_or_there}},

Thanks for creating an account.

Here is what IntellaBets does, in one paragraph: we compare prices across the
major sportsbooks, strip out each book's built-in margin (the "vig"), and show
you where the best available price is better than the market's own consensus.
That gap is the product. It says something about *price*. It does not say a
bet will win — any single bet can lose, and most nights some will.

Two places to start:

1. **How it works** — the de-vig method with a worked example (clearly labeled
   as illustrative, not a real game):
   https://intellabets.com/how-it-works
2. **Picks** — current opportunities, with the price and the books behind each:
   https://intellabets.com/picks

We haven't published a win rate and we won't make one up. When there is enough
real, settled data to say something honest, we'll publish it along with its
limits.

— The IntellaBets team

{{footer}}

---

## 2. Method explainer — trigger: 2 days after signup

**Subject:** Why we don't lead with a win rate
**Preview:** A short note on price vs. outcome.

Hi {{first_name_or_there}},

Most betting sites open with a win rate. We open with a method, because a win
rate over a short run mostly measures luck.

The idea behind a "good bet" here is narrow and checkable:

- Every sportsbook's odds include a margin. Add up the implied probabilities
  on both sides of a market and you get more than 100%; the excess is the vig.
- Remove that margin and you get a fair-price estimate for each side.
- If a book is offering a price better than that estimate, the bet has
  positive expected value *at that price*.

Expected value is a long-run statement about price. Over a small number of
bets, a positively-priced bet loses all the time. Don't size bets as though
the next one is certain — it isn't.

Read the walkthrough with numbers: https://intellabets.com/how-it-works

One more concept worth knowing, closing line value (what it measures and, just
as important, what it can't tell you): https://intellabets.com/closing-line-value

{{footer}}

---

## 3. Set your limits — trigger: 5 days after signup

**Subject:** Decide your limit before you need one
**Preview:** Two minutes now, easier later.

Hi {{first_name_or_there}},

A note that has nothing to do with picks. The most useful gambling decision
you'll make is the one you make before you place a bet:

- Pick an amount you can afford to lose entirely, and treat it as the cost of
  entertainment — not income.
- Set a deposit limit with your sportsbook. Most have the setting under
  "Responsible Gaming".
- Don't chase losses. If a night goes badly, stop.

If it's already not fun, free confidential help is available any time:
1-800-522-4700 (US). More resources and warning signs:
https://intellabets.com/responsible-gambling

You can also track what you actually bet and what happened in **My Bets** —
honest records beat memory.

{{footer}}

---

## 4. Plans — trigger: 7 days after signup, only if still on the free tier

**Subject:** What a paid plan includes (and what it doesn't)
**Preview:** Plain description, no pressure.

Hi {{first_name_or_there}},

If you've been using the free tier and want to know what paid adds, the
current plans and what's in each are on one page:
https://intellabets.com/premium

What we can say plainly:

- Paid plans give you access to more of the analysis. They do not change the
  odds of any bet winning, and they are not a way to make money.
- You can cancel from your account settings. Our refund terms are here:
  https://intellabets.com/refund
- If you're not sure, staying on the free tier is a perfectly good answer.

{{footer}}

---

## Implementation notes

- Send the transactional welcome (#1) first; the rest are lifecycle and need
  an unsubscribe link and a postal address (CAN-SPAM).
- Do not send #4 until checkout actually works and the refund page matches the
  processor's real behavior. Until then it would advertise something that
  returns 503.
- Suppress all marketing email for any user who has self-excluded or contacted
  support about gambling concerns.
