---
name: bet-grading
description: Grades settled sports bets and reports profit, ROI, win rate and closing line value from a CSV or JSON of bet records. Use when asked to settle bets, calculate profit and loss, analyse betting performance, compute ROI or CLV, or check whether picks are actually winning.
---

# Bet Grading

Turns a list of bet records into an honest performance report.

The arithmetic here is easy to get subtly wrong in ways that flatter the
results. Most of this skill is about the ways it goes wrong.

## Quick start

`scripts/grade_bets.py` does the whole calculation:

```bash
python scripts/grade_bets.py bets.csv
python scripts/grade_bets.py bets.json --format json
```

It accepts CSV or JSON with these fields per bet:

| Field | Required | Notes |
|---|---|---|
| `stake` | yes | Amount risked |
| `odds_decimal` | yes | Decimal odds taken |
| `status` | yes | `won`, `lost`, `push`, `void`, or `pending` |
| `closing_odds` | no | Decimal odds at kickoff; needed for CLV |
| `market_type` | no | `moneyline`, `spread`, `total`, `prop` |
| `selection`, `matchup`, `book`, `sport` | no | Used for the breakdowns |

Read the script before trusting it on data you care about. If the input does
not match this shape, adapt the loader rather than reshaping real records to
fit.

## The four ways this goes wrong

**Pending bets in the denominator.** ROI must be computed on *settled* stake
only. Including unsettled bets divides real profit by money still in play and
understates performance early, then jumps when bets settle. Filter to settled
first, always.

**Pushes counted as wins or losses.** A push returns the stake: zero profit,
and it belongs in neither column of a win rate. Counting pushes as losses
understates win rate; counting them as wins is simply false. They stay in the
record and out of both counts.

**Profit confused with returns.** On a winning bet at decimal odds `d` with
stake `s`, the book pays back `s * d` — but `s` of that was already yours.
Profit is `s * (d - 1)`. Reporting the payout as profit roughly doubles the
apparent result at even money.

**Win rate presented as the headline.** Win rate without the odds means
nothing: 70% at -300 loses money, 45% at +150 makes money. ROI is the number
that answers "did this make money". Report win rate as context, never alone.

## What to compute

```
profit(won)   =  stake * (odds_decimal - 1)
profit(lost)  = -stake
profit(push)  =  0
profit(void)  =  0

settled       = bets where status in {won, lost, push}
roi           = sum(profit over settled) / sum(stake over settled) * 100
win_rate      = wins / (wins + losses) * 100        # pushes excluded
clv           = (odds_decimal / closing_odds - 1) * 100
```

Void and push both return the stake. They are separated because they mean
different things: a push is a tie against the line, a void is a bet that never
resolved (a player who did not appear, a cancelled game). Both contribute zero
profit and are excluded from win rate.

## Closing line value

CLV is the most useful number in the report and the least understood.

It compares the price taken against the price at kickoff. Positive CLV means a
better price than the market closed at. It matters because it shows up
immediately, while win rate takes hundreds of bets to separate skill from
variance.

**Only compute CLV from a genuine pre-game closing price.** A price captured
after kickoff is an in-play price on a partly-played game — a team down 9-0 is
quoted at something like 15.00 against a pre-game 2.10, which records a CLV of
-86% and means nothing. If a record's closing odds are not confirmed pre-game,
leave its CLV blank rather than computing a number that will be averaged in.

Report both the average CLV and the share of bets with positive CLV. A deeply
negative average next to a near-even positive rate is the signature of a few
corrupt records, not uniformly bad picks — go and find them.

## Reporting

Lead with ROI, sample size, and the period covered. Then win rate, average
CLV, positive-CLV rate. Then breakdowns by sport, market type and book if the
data supports them.

**Say how big the sample is, every time.** Under roughly 100 settled bets,
nothing here is statistically meaningful and the report should say so in plain
words. A 60% win rate over 12 bets is noise, and presenting it as performance
is how businesses end up making claims they cannot support.

Never extrapolate. Do not project annual returns, do not compute what a
different stake would have made, do not describe a run of wins as a streak.
Report what happened.
