import { americanToDecimal, calcPotentialReturn, decimalToAmerican } from "@/lib/utils"
import type { BetDraft, BetslipTotals } from "./types"

/** A signed or unsigned decimal number, nothing else: "-110", "+150", "150". */
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/

/** American odds start at +100 / -100; a number between those is not a real price. */
const MIN_AMERICAN_ODDS_MAGNITUDE = 100

/**
 * Read American odds typed into the form, or null if they aren't valid.
 * Strict on purpose: "150abc" is rejected rather than quietly read as 150.
 */
export function parseAmericanOdds(input: string): number | null {
  const trimmed = input.trim()
  if (!PLAIN_NUMBER.test(trimmed)) return null
  const odds = Number(trimmed)
  return Math.abs(odds) >= MIN_AMERICAN_ODDS_MAGNITUDE ? odds : null
}

/** Read the stake typed into the form, or null unless it is a number above zero. */
export function parseStake(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === "") return null
  const stake = Number(trimmed)
  return Number.isFinite(stake) && stake > 0 ? stake : null
}

/**
 * Combine the legs' American odds into one parlay price.
 *
 * Returns null unless there is at least one leg and every leg has valid odds:
 * a total that quietly ignored a bad leg would be a wrong number, not a
 * partial one. Parlay maths works in decimal odds: the decimal prices of
 * independent legs multiply, then the product is converted back to American.
 */
export function calcTotalOdds(oddsInputs: readonly string[]): number | null {
  if (oddsInputs.length === 0) return null

  let parlayDecimal = 1
  for (const input of oddsInputs) {
    const odds = parseAmericanOdds(input)
    if (odds === null) return null
    parlayDecimal *= americanToDecimal(odds)
  }
  return decimalToAmerican(parlayDecimal)
}

/**
 * Everything the summary card shows, derived from the current form values.
 * Any figure that can't be computed from what the user has actually entered
 * is null, never a guess.
 */
export function calcBetslipTotals(
  bets: ReadonlyArray<Pick<BetDraft, "odds">>,
  stakeInput: string
): BetslipTotals {
  const totalOdds = calcTotalOdds(bets.map((bet) => bet.odds))
  const stake = parseStake(stakeInput)
  return {
    totalOdds,
    stake,
    potentialReturn:
      totalOdds !== null && stake !== null ? calcPotentialReturn(stake, totalOdds) : null,
  }
}
