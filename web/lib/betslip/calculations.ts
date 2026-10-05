import { americanToDecimal, calcPotentialReturn, decimalToAmerican } from "@/lib/utils"
import type { BetDraft, BetslipTotals } from "./types"

/**
 * Used when the stake field is empty or not a positive-looking number.
 *
 * NOTE: this silently substitutes a value the user never typed. Kept as-is
 * for now so the refactor changes no behavior; see the follow-up fix.
 */
export const DEFAULT_STAKE = 100

/**
 * Odds used to estimate a return when no leg has usable odds.
 *
 * NOTE: like DEFAULT_STAKE, this shows a figure derived from odds nobody
 * entered. Kept as-is for now; see the follow-up fix.
 */
export const FALLBACK_ODDS = -110

/** Parse the stake input, falling back to DEFAULT_STAKE. */
export function parseStake(input: string): number {
  return parseFloat(input) || DEFAULT_STAKE
}

/**
 * Combine American odds typed into the form into one parlay price.
 *
 * Legs that can't be parsed are skipped, and 0 means "no price available".
 * Parlay maths works in decimal odds: the decimal prices of independent legs
 * multiply, then the product is converted back to American.
 */
export function calcTotalOdds(oddsInputs: readonly string[]): number {
  const parlayDecimal = oddsInputs
    .map((raw) => parseFloat(raw))
    .filter((odds) => !Number.isNaN(odds))
    .reduce((product, odds) => product * americanToDecimal(odds), 1)

  // A product of 1 means no leg contributed (every input was unparseable).
  if (parlayDecimal <= 1) return 0
  return decimalToAmerican(parlayDecimal)
}

/** Everything the summary card shows, derived from the current form values. */
export function calcBetslipTotals(
  bets: ReadonlyArray<Pick<BetDraft, "odds">>,
  stakeInput: string
): BetslipTotals {
  const totalOdds = calcTotalOdds(bets.map((bet) => bet.odds))
  const stake = parseStake(stakeInput)
  return {
    totalOdds,
    stake,
    potentialReturn: calcPotentialReturn(stake, totalOdds || FALLBACK_ODDS),
  }
}
