import { americanToDecimal, decimalToAmerican } from "@/lib/utils"

/**
 * De-vig maths for the public calculator.
 *
 * Mirrors the engine's method (backend/src/modules/predictions/devig.ts,
 * `devigProportional`): each price's implied probability is divided by the
 * book's total implied probability (the overround), so the fair probabilities
 * sum to exactly 1. Keep the two in step — the calculator is how we show
 * visitors the method, so it must be the method.
 *
 * Pure functions only: no React, no I/O. The UI calls these; tests cover them.
 */

/** American odds are never between -100 and +100 (exclusive). */
export function isValidAmericanOdds(odds: number): boolean {
  return Number.isFinite(odds) && Math.abs(odds) >= 100
}

/** Implied probability of one American price, vig included. */
export function impliedProbability(americanOdds: number): number {
  return 1 / americanToDecimal(americanOdds)
}

export interface DevigOutcome {
  /** The price the user entered. */
  americanOdds: number
  /** Implied probability with the book's margin still in it. */
  impliedProbability: number
  /** Probability after the margin is removed (all outcomes sum to 1). */
  fairProbability: number
  /** The no-vig price, in American odds. */
  fairAmericanOdds: number
}

export interface DevigResult {
  outcomes: DevigOutcome[]
  /** Sum of implied probabilities, e.g. 1.048 for a 4.8% margin. */
  overround: number
  /** overround - 1, as a fraction (0.048 = 4.8%). */
  margin: number
}

/**
 * Remove the margin from one book's prices for a single market.
 *
 * Returns null when the input cannot describe a real market: fewer than two
 * outcomes, an impossible American price, or prices with no margin at all to
 * remove (overround <= 1 means the inputs are not one book's full market).
 */
export function devigMarket(americanOdds: number[]): DevigResult | null {
  if (americanOdds.length < 2 || !americanOdds.every(isValidAmericanOdds)) return null

  const implied = americanOdds.map(impliedProbability)
  const overround = implied.reduce((sum, p) => sum + p, 0)
  if (overround <= 1) return null

  const outcomes = americanOdds.map((odds, i) => {
    const fairProbability = implied[i] / overround
    return {
      americanOdds: odds,
      impliedProbability: implied[i],
      fairProbability,
      fairAmericanOdds: decimalToAmerican(1 / fairProbability),
    }
  })

  return { outcomes, overround, margin: overround - 1 }
}

/**
 * Expected value per 1 unit staked at `americanOdds`, if `fairProbability` is
 * the true chance of winning. Positive EV is a statement about the price
 * relative to that estimate — not a prediction that the bet wins.
 */
export function expectedValuePerUnit(fairProbability: number, americanOdds: number): number {
  const profitIfWin = americanToDecimal(americanOdds) - 1
  return fairProbability * profitIfWin - (1 - fairProbability)
}
