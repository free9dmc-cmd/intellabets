---
name: pick-writeup
description: Turns a raw IntellaBets engine pick into a customer-facing betting write-up, with the edge explained, the recommended book and stake, and the required caveats. Use when asked to write up a pick, explain why the engine likes a bet, draft pick copy for customers, or format predictions for publication.
---

# Pick Write-up

Turns one engine pick into copy a customer can act on.

The engine emits numbers. This turns them into a short, honest explanation of
where the edge came from, where to place the bet, and what could go wrong. The
last part is not optional — see Non-negotiables.

## What the engine actually does

Understanding this is what separates an accurate write-up from marketing copy.

1. **De-vig each book.** Every bookmaker's prices imply probabilities summing
   to more than 1. The excess is their margin. Dividing each implied
   probability by that total removes it proportionally, leaving fair
   probabilities that sum to exactly 1.
2. **Average across books.** Each book's de-vigged view is one estimate. The
   average across several is the consensus — the sharpest estimate available
   without inside information.
3. **Line shop.** Compare the best available price against that consensus.
   When the best price implies a *lower* probability than consensus, the bet
   has positive expected value.
4. **Size with fractional Kelly.** Quarter-Kelly, capped. Full Kelly is
   optimal only if the probability estimate is exactly right, which it never
   is.

The edge is a **pricing disagreement between books**, not a prediction that
the engine knows something about the game. Write it that way.

## How to write one

**Lead with the bet.** Selection, line, price, book. The reader wants to know
what to do before they want to know why.

**Explain the edge in one or two sentences.** Name the mechanism: the
consensus fair probability, the price actually available, and the gap.
"Consensus across seven books puts this around 54%. DraftKings is pricing it
at +105, which implies 48.8%. That gap is the edge." Concrete numbers beat
adjectives every time.

**State the stake as a fraction of bankroll**, never as a dollar figure unless
the reader supplied a bankroll. "1.8% of bankroll" is advice; "$180" assumes
something you were not told.

**Give the caveat.** Every strategy has one, and the engine ships the specific
caveat with each pick. Use that text — do not soften or reword it into
something more comfortable.

**Close with placement.** Which book has the best price and what to select
there. Book menus differ: the same bet is "Total" at DraftKings, "Total
Points" at FanDuel, "Over/Under" at BetMGM. Name what the reader will
actually see on screen.

## Non-negotiables

These exist because breaking them has real consequences — a payment processor
terminated this business once over published claims it could not support.

- **Never invent a number.** No win rates, records, subscriber counts,
  earnings, or accuracy figures unless they came from a settled-results query.
  If you do not have the number, do not write a sentence that needs one.
- **Never promise an outcome.** Positive expected value means the price is
  better than the true probability. It says nothing about whether *this* bet
  wins. Individual +EV bets lose all the time; that is what variance is.
- **Never omit the caveat**, even when the edge is large. A large edge on a
  market only one or two books price is usually a stale line, not free money.
- **Never imply IntellaBets takes wagers.** It publishes analysis. The reader
  places their own bets at their own sportsbook.
- **Include 18+ and responsible gambling** in anything customer-facing.

## Structure

```
[Selection] — [Line] at [Price] ([Book])

[1-2 sentences: consensus probability, offered price, the gap]

[1 sentence: line movement, if the pick has movement data]

Stake: [X]% of bankroll (quarter-Kelly)

Worth knowing: [the strategy's caveat, verbatim]

Where to place it: [Book] — [exactly what to tap, in that book's own words]
```

Keep the whole thing under 150 words. Someone deciding whether to place a bet
in the next ten minutes will not read more.

See REFERENCE.md for odds conversion, market types, and per-book menu labels.
