import type { MarketLine } from "../sportsbook/types/provider.types"
import type { BookPrice, ConsensusOutcome } from "./prediction.types"
import { isRoutableBook } from "./deeplinks"

/**
 * De-vigging (removing the bookmaker margin) and building multi-book consensus.
 *
 * The de-vigged consensus probability is the single sharpest estimate of the
 * true outcome probability available to a retail operator. We use the
 * "proportional" (a.k.a. multiplicative) method, which is standard and robust
 * for 2-way and n-way markets.
 */

/** One book's version of a single market (same market type across books). */
export interface BookMarket {
  book: string
  line: MarketLine
}

/**
 * Remove vig from one book's set of decimal prices for a single market.
 * Returns fair probabilities that sum to exactly 1.
 */
export function devigProportional(decimals: number[]): number[] {
  const raw = decimals.map((d) => 1 / d)
  const overround = raw.reduce((s, p) => s + p, 0)
  if (overround <= 0) throw new Error("Invalid odds: non-positive overround")
  return raw.map((p) => p / overround)
}

/**
 * Split one market's books into groups that price the same outcomes (name and
 * point). Books often hang different numbers on a spread or total -- -3 at one,
 * -3.5 at another -- and each number is its own bet, so each needs its own
 * consensus from the books that price exactly it. Groups keep the books' order.
 */
export function groupByLine(books: BookMarket[]): BookMarket[][] {
  const groups = new Map<string, BookMarket[]>()
  for (const b of books) {
    const key = b.line.outcomes
      .map((o) => `${o.name}\u0000${o.point ?? ""}`)
      .sort()
      .join("\u0001")
    const group = groups.get(key)
    if (group) group.push(b)
    else groups.set(key, [b])
  }
  return Array.from(groups.values())
}

/**
 * Given the same market captured from several books, build a consensus fair
 * probability per outcome by averaging each book's de-vigged probability, and
 * find the best available price (line shopping).
 */
export function buildConsensus(books: BookMarket[]): ConsensusOutcome[] {
  if (books.length === 0) return []

  // Use the first book's outcomes as the canonical outcome set.
  const canonical = books[0].line.outcomes

  const fairProbsPerOutcome: number[][] = canonical.map(() => [])
  const pricesPerOutcome: BookPrice[][] = canonical.map(() => [])

  for (const { book, line } of books) {
    // Align this book's outcomes to canonical order by name + point.
    const aligned = canonical.map((c) =>
      line.outcomes.find(
        (o) => o.name === c.name && (o.point ?? null) === (c.point ?? null)
      )
    )
    // Skip books that don't cover every canonical outcome.
    if (aligned.some((o) => !o)) continue

    const decimals = aligned.map((o) => o!.odds.decimal)
    const fair = devigProportional(decimals)

    aligned.forEach((o, i) => {
      fairProbsPerOutcome[i].push(fair[i])
      pricesPerOutcome[i].push({ book, decimal: o!.odds.decimal, point: o!.point })
    })
  }

  return canonical.map((c, i) => {
    const fairProbs = fairProbsPerOutcome[i]
    const prices = pricesPerOutcome[i]

    const fairProbability = mean(fairProbs)
    const bookAgreement =
      fairProbs.length > 1
        ? 1 - Math.min(1, stdDev(fairProbs) / (fairProbability || 1))
        : 0.5

    // Line shopping: the best price is the HIGHEST decimal odds among books we
    // may send a user to. Offshore and unregistered books still count toward
    // the consensus above -- they are real prices -- but must never become the
    // offered book: a pick saying "bet this at Bovada" routes a customer to an
    // unlicensed operator. If no routable book prices the outcome, bestDecimal
    // stays 0 and the engine produces no pick for it.
    let bestDecimal = 0
    let bestBook = "unknown"
    for (const p of prices) {
      if (!isRoutableBook(p.book)) continue
      if (p.decimal > bestDecimal) {
        bestDecimal = p.decimal
        bestBook = p.book
      }
    }

    return {
      outcomeId: c.id,
      name: c.name,
      selection: c.description,
      point: c.point,
      prices,
      bestBook,
      bestDecimal,
      fairProbability,
      fairDecimal: fairProbability > 0 ? 1 / fairProbability : Infinity,
      bookAgreement,
    }
  })
}

// ─── stats helpers ────────────────────────────────────────────────────────────

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((s, x) => s + x, 0) / xs.length
}

export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(variance)
}
