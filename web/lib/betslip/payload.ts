import { parseAmericanOdds, parseStake } from "./calculations"
import type { BetPayload, BetslipDraft, BetslipPayload } from "./types"

export type PayloadResult = { ok: true; payload: BetslipPayload } | { ok: false; error: string }

const fail = (error: string): PayloadResult => ({ ok: false, error })

/**
 * Turn the form into the request body for POST /api/betslips, or explain what
 * is wrong with it.
 *
 * This both checks and converts in one pass ("parse, don't validate"): on
 * success the payload already holds real numbers, so nothing downstream has to
 * re-check text or invent a default for a value that turned out to be missing.
 * The checks are for fast feedback; the API route remains the real gatekeeper,
 * since anyone can call it without this form.
 *
 * Every leg is saved with the betslip's sport. The form has no per-leg sport
 * control, and the first leg is created before the user picks a sport, so
 * without this a betslip could be saved as NBA with an NFL leg.
 */
export function buildBetslipPayload(draft: BetslipDraft): PayloadResult {
  if (!draft.title.trim()) return fail("Title is required")
  if (draft.bets.some((bet) => !bet.game || !bet.pick || !bet.odds)) {
    return fail("Fill in all bet details (game, pick, odds)")
  }

  // An indexed loop, not for...of over entries(): this project's tsconfig sets
  // no `target`, so TypeScript treats iterator syntax as unavailable.
  const bets: BetPayload[] = []
  for (let index = 0; index < draft.bets.length; index++) {
    const bet = draft.bets[index]
    const odds = parseAmericanOdds(bet.odds)
    if (odds === null) {
      return fail(`Bet #${index + 1}: enter American odds like -110 or +150`)
    }
    bets.push({ ...bet, sport: draft.sport, odds })
  }

  const stake = parseStake(draft.stake)
  if (stake === null) return fail("Enter a stake greater than 0")

  return {
    ok: true,
    payload: {
      title: draft.title,
      description: draft.description,
      sport: draft.sport,
      league: draft.league,
      stake,
      isPublic: draft.isPublic,
      bets,
    },
  }
}
