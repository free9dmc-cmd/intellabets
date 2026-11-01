# Onboarding email sequence (draft copy)

Status: **copy only — nothing sends these yet.** There is no transactional email
provider configured (LAUNCH-PLAN P1), and signup was down at last inspection
(P0.1). Wire this up after both are fixed.

## Rules for every email in this sequence

- No win rates, ROI, records, testimonials, subscriber counts or earnings.
- No guaranteed outcomes. Positive expected value describes a *price*, not
  whether any single bet wins.
- Every email carries the footer below, unedited, plus a working unsubscribe
  link and the postal address once the business entity exists.
- Product emails only. No picks, odds or "bet now" calls to action in email.
- Never describe a feature that is not live. Re-check `/premium` and the
  checkout state before sending anything that mentions paying.
- Do not name a sportsbook as a recommendation. Links to books go through the
  vetted, licensed-book list in the app, not through email.

### Footer (all emails)

> You must be 18 or older (21+ in many US states) to use sports betting
> services, and betting is only legal in some places. IntellaBets is an
> analytics and education tool. We do not accept bets, hold funds or place bets
> for you, and nothing we show is a guarantee or a prediction that a bet will
> win. Only risk money you can afford to lose. If gambling is a problem, call
> 1-800-GAMBLER (US) or visit https://www.begambleaware.org (UK/EU).
> Details: https://intellabets.com/responsible-gambling
>
> You are receiving this because you created an IntellaBets account.
> {{unsubscribe_link}}

---

## Email 1 — Welcome (send on registration)

**Subject:** Welcome to IntellaBets — here's how it actually works
**Preview:** No win-rate claims. Just the method.

Hi {{first_name_or_username}},

Thanks for creating an account.

Most betting sites lead with a win rate. We don't publish one, and the reason
is the most useful thing we can tell you about the product.

IntellaBets compares prices across major sportsbooks, removes each book's
built-in margin (the "vig"), and builds a consensus estimate of each outcome's
probability. When one book's price is better than that consensus implies, we
flag the gap. The gap is the product. It is a statement about price. It does
not say the bet will win, and any single bet can lose.

Two pages worth five minutes:

- How the de-vig method works, with a worked example:
  https://intellabets.com/how-it-works
- Why we don't publish a win rate yet:
  https://intellabets.com/how-it-works

If you have questions, reply to this email or write support@intellabets.com.

— The IntellaBets team

{{footer}}

---

## Email 2 — Read a pick properly (send ~2 days after signup)

**Subject:** What a "price edge" is — and what it isn't
**Preview:** Why a good price can still lose.

Hi {{first_name_or_username}},

When a pick on IntellaBets shows an edge, it means one thing: the best
available price is higher than the market consensus says it should be, after
the margin is removed.

What that does not mean:

- It does not mean the bet will win. Even a fairly priced 50% outcome loses
  half the time, and a short run of results tells you very little.
- It does not mean the edge will still exist when you look. Prices move, and
  a line that was available a few minutes ago may not be now.
- It does not mean every book will offer the same price. That is exactly why
  we show several.

A better way to judge a pick over time is whether you could get a price at or
better than where the line closed. That is called closing line value. We
explain it, and its limits, here: https://intellabets.com/closing-line-value

We are not publishing a closing-line-value figure yet. The sample is too small
to mean anything under our corrected settlement logic, and we would rather say
that than quote a number.

— The IntellaBets team

{{footer}}

---

## Email 3 — Set your limits first (send ~5 days after signup)

**Subject:** Before you bet anything: set a limit
**Preview:** Takes two minutes, and it is the part that matters most.

Hi {{first_name_or_username}},

A short one, and not a sales email.

Analytics can help you compare prices. It cannot remove risk, and no tool can
promise you a result. The single most protective thing you can do is decide
your limits *before* you place a bet:

- A budget you can lose entirely without it affecting rent, bills or savings.
- A cap on how much you stake on any one bet.
- A time you stop, whatever the results.

Most licensed sportsbooks let you set deposit limits and take breaks from
inside your account. Use them.

Signs it may be time to step back, and where to get free, confidential help:
https://intellabets.com/responsible-gambling

— The IntellaBets team

{{footer}}

---

## Email 4 — About paid plans (send ~7 days after signup; **hold until a payment processor is live**)

**Subject:** What Premium includes, in plain terms
**Preview:** What you get, what it costs, how to cancel.

Hi {{first_name_or_username}},

If you want more than the free view, here is exactly what Premium is. The
current tiers and prices are on one page, and that page is the source of truth:
https://intellabets.com/premium

Before you pay for anything:

- Premium gives you more analysis tools. It does not give you winning bets,
  and we make no promise about results or profit.
- You can cancel at any time. Our refund terms are here and match what our
  payment processor actually does: https://intellabets.com/refund
- You do not need Premium to use the method pages or the free features.

**Do not send this email until:** (1) checkout actually completes against a
live processor, (2) `/premium` prices match what the processor charges, and
(3) the refund page matches the processor's real behaviour.

— The IntellaBets team

{{footer}}

---

## Implementation notes (for whoever wires this up)

- Trigger Email 1 from registration only after the user row is committed.
- Send times are relative to `User.createdAt`; skip any email for a user who
  has unsubscribed.
- Email 4 is gated on a feature flag tied to a live processor, not a date.
- Log sends without storing message bodies containing personal data.
- Add the postal address line to the footer once the legal entity is formed
  (CAN-SPAM requires it).
