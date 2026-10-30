# Onboarding email copy (draft, not wired up)

Plain-text copy for the first lifecycle emails. **Nothing sends these yet**:
there is no transactional email provider configured (LAUNCH-PLAN P1/P2). When one
exists, wire each to the trigger named in its heading. Placeholders are `{{double
braces}}`.

Copy rules, same as the site: no win rates, ROI, records, testimonials or
subscriber counts; no income projections; nothing guaranteed. "Positive expected
value" describes a price versus the market consensus, never an outcome. 21+ and
responsible-gambling footer on every message.

Do not add a performance number to any email until it comes from real settled
data, and do not quote CLV until enough games have settled under the corrected
settlement logic (RUNBOOK, Known issues).

---

## 1. Welcome — trigger: account created

**Subject:** Welcome to IntellaBets — here's how it works

Hi {{name}},

Your account is ready. Here is what IntellaBets does and does not do.

What it does: it compares prices across major sportsbooks, removes each book's
margin (the "vig"), and shows where the best available price is better than the
market's own consensus. That gap is the whole product.

What it does not do: predict winners, or promise that any bet will win. A price
can be good and the bet can still lose. Over a small number of bets, luck
dominates.

Two minutes to get oriented:
- How the de-vig maths works, with a worked example: {{app_url}}/how-it-works
- What closing line value is, and its limits: {{app_url}}/closing-line-value

We do not take bets or hold your betting funds. You place bets yourself with a
sportsbook that is licensed where you live.

— IntellaBets

{{footer}}

---

## 2. First picks view — trigger: first visit to /picks, or day 2

**Subject:** How to read a pick

Hi {{name}},

Each pick on IntellaBets shows a price, the books offering it, and how it
compares with the no-vig consensus. Three things to check before acting:

1. Is the price still available? Lines move; a stale price is not an edge.
2. How big is the gap? Small gaps are easily erased by a line move.
3. How much are you staking? Decide a stake you are comfortable losing before
   you look at the pick, not after.

Walkthrough: {{app_url}}/how-it-works

{{footer}}

---

## 3. Premium explained — trigger: day 5, free accounts only

**Subject:** What Premium adds (and what it doesn't)

Hi {{name}},

Premium unlocks more of the same analysis; it does not unlock a better chance of
winning any single bet. See current plans and what each includes at
{{app_url}}/premium. Prices and terms there are the source of truth, including
the refund policy.

You can cancel any time from your account. There is no obligation to upgrade.

{{footer}}

---

## 4. Check-in on staking — trigger: day 14

**Subject:** A note on staking

Hi {{name}},

The most useful habit we can suggest has nothing to do with picks: set a budget
you can afford to lose, and a limit on how much you will stake per bet. Betting
should be entertainment, and losing streaks happen to everyone, including when
the price was right.

Tools and help lines: {{app_url}}/responsible-gambling

{{footer}}

---

## Footer (all emails)

You must be 21 or older (or the legal gambling age where you live, whichever is
higher). IntellaBets provides information and analysis, not financial advice, and
does not guarantee any outcome. If gambling is a problem for you or someone you
know, call 1-800-GAMBLER (US) or visit {{app_url}}/responsible-gambling.
{{unsubscribe_link}} · {{postal_address}}

> Owner decisions before sending: the postal address required by CAN-SPAM, the
> sending domain and provider, and whether marketing (emails 3–4) needs an
> opt-in separate from signup.
