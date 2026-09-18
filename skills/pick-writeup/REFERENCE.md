# Reference

## Odds conversion

Decimal odds are the engine's internal format. American odds are what US
customers read.

```
decimal >= 2.0   ->  american = +round((decimal - 1) * 100)
decimal <  2.0   ->  american = -round(100 / (decimal - 1))
```

Implied probability from decimal odds:

```
implied = 1 / decimal
```

This implied probability includes the book's margin — it is always higher than
the fair probability. Never present an implied probability as the chance of
winning; that is the number the engine removes the vig from.

Examples:

| Decimal | American | Implied (with vig) |
|---------|----------|--------------------|
| 1.50    | -200     | 66.7%              |
| 1.91    | -110     | 52.4%              |
| 2.00    | +100     | 50.0%              |
| 2.50    | +150     | 40.0%              |
| 4.00    | +300     | 25.0%              |

## Market types

| Type       | What it is | Push condition |
|------------|------------|----------------|
| `moneyline`| Straight winner | Final score is tied |
| `spread`   | Winner after a handicap | Margin plus the line equals exactly 0 |
| `total`    | Combined score over or under a number | Combined score equals the line exactly |
| `prop`     | A player statistic against a line | Player did not appear — void, not push |

A push returns the stake. It is neither a win nor a loss and must not count in
either column of a win rate.

## Book menu labels

The same bet is labelled differently in each app. Use the reader's own book's
wording so they can find it.

| Book       | Moneyline   | Spread        | Total        |
|------------|-------------|---------------|--------------|
| DraftKings | Moneyline   | Spread        | Total        |
| FanDuel    | Moneyline   | Spread        | Total Points |
| BetMGM     | Moneyline   | Spread        | Over/Under   |
| Caesars    | Moneyline   | Spread        | Total        |
| PointsBet  | Moneyline   | Spread        | Total        |
| BetRivers  | Moneyline   | Point Spread  | Total        |

## Strategies and their caveats

Each engine pick carries a strategy key. The caveat is shipped with the pick —
use the text the engine provides rather than these summaries, which are only
here so you recognise what each strategy is.

| Key          | What it selects |
|--------------|-----------------|
| `value`      | Largest gap between best price and consensus |
| `steam`      | Picks where the line has moved toward the selection |
| `contrarian` | Picks where the line has moved away from the selection |
| `safe`       | +EV picks with higher fair win probability, lower variance |
| `longshot`   | +EV picks with lower fair win probability, higher variance |

There is deliberately no "fade the public" strategy. It requires public betting
percentages, which this engine does not have. Do not write copy implying
otherwise.

## Closing line value

CLV compares the price taken against the price at kickoff:

```
clv = (odds_taken / closing_odds - 1) * 100
```

Positive CLV means a better price than the market closed at. It is the honest
measure of whether picks have an edge, because it is visible immediately and
is not drowned in variance the way win rate is over small samples.

Do not quote a CLV figure in customer-facing copy unless it came from a
settled-results query over a meaningful sample.
