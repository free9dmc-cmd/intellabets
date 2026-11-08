# Forum post drafts — r/sportsbook and betting forums

LAUNCH-PLAN → Go-to-market → Channels, #1. These are drafts for the **owner to
post personally**. They are not for an automated account, and not for posting
from several accounts. Each one is written to be useful even if nobody clicks
through.

## Before posting anything

- **Read the community's rules on self-promotion first.** Many betting forums
  allow it only in designated threads, or not at all. If a draft would break a
  rule, don't post it. The method-only version (draft 1 without the last
  paragraph) usually fits any rule set.
- **Say who you are.** If you link to IntellaBets, say you built it ("I run
  IntellaBets, so take this with that in mind"). Undisclosed self-promotion is
  what gets accounts banned, and it reads as hype to exactly this audience.
- **Copy rules apply here too** (LAUNCH-PLAN Go-to-market):
  - No win rate, ROI, record, unit count, testimonial, subscriber count or
    earnings, including in replies.
  - If someone asks "what's your record?", the honest answer is in draft 2.
  - Positive EV describes a price, not a result.
  - Every post that links to the site carries the 21+ / responsible gambling
    line.
- **No picks.** Posting picks to drive traffic is the spam the plan rules out.
  Explaining a price on a real game is fine.
- **Answer replies.** One good answer in a comment thread does more than a
  second post.

---

## Draft 1: explainer, how to de-vig a line by hand

**Title:** How to remove the vig from a line by hand (and why the two sides
don't add to 100%)

> Saw a few questions about "fair odds" lately, so here's the arithmetic. No
> software needed.
>
> 1. Convert each side to an implied probability. For a favourite, odds ÷ (odds
>    + 100): -150 → 150 / 250 = 60%. For an underdog, 100 ÷ (odds + 100): +130 →
>    100 / 230 = 43.5%.
> 2. Add them: 60% + 43.5% = 103.5%. The extra 3.5% is the book's margin. It
>    isn't information about the game.
> 3. Divide each side by the total: 60 / 103.5 = 58.0%, 43.5 / 103.5 = 42.0%.
>    That's the book's no-vig price.
>
> This is the proportional method. Power and Shin methods push a bit more of
> the margin onto the longshot and give slightly different answers on lopsided
> lines.
>
> One book's no-vig price is still just that book's opinion. Where it gets
> useful is doing this across several books and comparing: if one book's
> actual price is better than the average no-vig price of the others, that's a
> pricing disagreement worth knowing about. It still doesn't mean the bet wins.
>
> (Numbers above are illustrative, not a real game.)
>
> Disclosure: I run IntellaBets, which does this across books automatically.
> There's a free calculator that does the steps above if you don't want to do
> them by hand: https://intellabets.com/devig-calculator. 21+, bet only what you
> can afford to lose. 1-800-GAMBLER if it's stopped being fun.

---

## Draft 2: the "what's your record?" answer

Use as a reply, or adapt as a post if the community discusses tout services.

> Fair question. The honest answer is that we don't publish one yet, on
> purpose.
>
> The service is built on price comparison: removing each book's margin and
> flagging prices that beat the cross-book consensus. The useful measure of
> that is closing line value (did the price you took beat where the market
> closed?), not short-run wins and losses. We fixed a bug in how our settlement
> recorded closing prices, and the sample since the fix is too small to mean
> anything. We'll publish it, with the sample size next to it, when it's big
> enough.
>
> Anyone quoting you a win rate on a small sample, or with no sample size at
> all, is telling you more about their marketing than their method.
>
> More on CLV: https://intellabets.com/closing-line-value (disclosure: I run
> IntellaBets). 21+.

---

## Draft 3: line shopping, for a beginners' thread

Post only after PR #21 is merged and `/line-shopping` is live. Until then the
link redirects to the login page.

> The single biggest thing most recreational bettors leave on the table is
> taking the first price they see.
>
> Same side, three books, $100 stake (illustrative):
> -120 pays $83.33, -110 pays $90.91, +100 pays $100.00. Break-even win rate:
> 54.5% vs 52.4% vs 50.0%. Same game, same result. Only the price changed.
>
> Two caveats people miss:
> - On spreads and totals, compare the number as well as the price. -3 and
>   -3.5 are different bets.
> - A better price doesn't make a bet more likely to win. A losing bet loses
>   the same stake at any price. What changes is that the wins pay more, so
>   you need to win less often to break even.
>
> Only use books that are licensed where you are.
>
> Longer write-up (disclosure: mine): https://intellabets.com/line-shopping.
> 21+, 1-800-GAMBLER.
