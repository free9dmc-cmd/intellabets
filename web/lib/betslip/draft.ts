import { parseStake } from "./calculations"
import type { BetDraft, BetslipDraft, BetslipPayload } from "./types"

export const BET_TYPES = ["moneyline", "spread", "total", "parlay", "prop"] as const

const DEFAULT_SPORT = "NFL"
const DEFAULT_BET_TYPE = "spread"
const DEFAULT_ODDS_INPUT = "-110"
const DEFAULT_STAKE_INPUT = "100"

/** A blank leg. New legs inherit the betslip's current sport. */
export function createEmptyBet(sport: string = DEFAULT_SPORT): BetDraft {
  return {
    game: "",
    homeTeam: "",
    awayTeam: "",
    pick: "",
    odds: DEFAULT_ODDS_INPUT,
    betType: DEFAULT_BET_TYPE,
    line: "",
    sport,
    gameDate: "",
  }
}

/** The form as it first appears: empty details and one blank leg. */
export function createInitialDraft(): BetslipDraft {
  return {
    title: "",
    description: "",
    sport: DEFAULT_SPORT,
    league: "",
    stake: DEFAULT_STAKE_INPUT,
    isPublic: false,
    bets: [createEmptyBet()],
  }
}

/** Every top-level field except the list of legs, which has its own actions. */
export type DetailsField = Exclude<keyof BetslipDraft, "bets">

/**
 * Everything that can happen to the form.
 *
 * The first member is a "mapped union": TypeScript builds one action type per
 * details field, so `{ field: "stake", value: true }` is a compile error —
 * the value's type must match the field it targets.
 */
export type BetslipDraftAction =
  | { [K in DetailsField]: { type: "setField"; field: K; value: BetslipDraft[K] } }[DetailsField]
  | { type: "addBet" }
  | { type: "removeBet"; index: number }
  | { type: "updateBet"; index: number; field: keyof BetDraft; value: string }

/**
 * Pure state transitions for the form.
 *
 * Never mutates `state`. Legs an action doesn't touch keep their object
 * identity, which is what lets React.memo skip re-rendering them while the
 * user types in a different leg.
 *
 * Every action type is handled and each case returns, so if a new action is
 * added to the union but not handled here, the compiler reports the missing
 * return — no `default` branch needed.
 */
export function betslipDraftReducer(state: BetslipDraft, action: BetslipDraftAction): BetslipDraft {
  switch (action.type) {
    case "setField":
      return { ...state, [action.field]: action.value }
    case "addBet":
      return { ...state, bets: [...state.bets, createEmptyBet(state.sport)] }
    case "removeBet":
      return { ...state, bets: state.bets.filter((_, i) => i !== action.index) }
    case "updateBet":
      return {
        ...state,
        bets: state.bets.map((bet, i) =>
          i === action.index ? { ...bet, [action.field]: action.value } : bet
        ),
      }
  }
}

/**
 * Convert the form into the request body for POST /api/betslips.
 * This is the one place text-typed form values become numbers.
 *
 * Every leg is saved with the betslip's sport. The form has no per-leg sport
 * control, and the first leg is created before the user picks a sport, so
 * without this a betslip could be saved as NBA with an NFL leg.
 */
export function toBetslipPayload(draft: BetslipDraft): BetslipPayload {
  return {
    title: draft.title,
    description: draft.description,
    sport: draft.sport,
    league: draft.league,
    stake: parseStake(draft.stake),
    isPublic: draft.isPublic,
    bets: draft.bets.map((bet) => ({ ...bet, sport: draft.sport, odds: parseFloat(bet.odds) })),
  }
}
