/**
 * One leg of a betslip, as held in the create-betslip form.
 *
 * Every field is a string because it comes straight from an <input>. Numbers
 * are parsed only at the edges — when computing totals and when building the
 * request for the API — so a half-typed value like "-1" is never rewritten
 * underneath the user's cursor.
 */
export interface BetDraft {
  game: string
  homeTeam: string
  awayTeam: string
  pick: string
  /** American odds as typed, e.g. "-110" or "+150". */
  odds: string
  betType: string
  line: string
  sport: string
  gameDate: string
}

/** The whole create-betslip form: betslip details plus its legs. */
export interface BetslipDraft {
  title: string
  description: string
  sport: string
  league: string
  /** Kept as typed, like BetDraft fields, so editing never fights the cursor. */
  stake: string
  isPublic: boolean
  bets: BetDraft[]
}

/** The form minus its legs: the fields that describe the betslip itself. */
export type BetslipDetails = Omit<BetslipDraft, "bets">

/** A leg as POST /api/betslips expects it: odds as a number. */
export type BetPayload = Omit<BetDraft, "odds"> & { odds: number }

/** Request body for POST /api/betslips. */
export interface BetslipPayload {
  title: string
  description: string
  sport: string
  league: string
  stake: number
  isPublic: boolean
  bets: BetPayload[]
}

/** The three figures shown in the betslip summary card. */
export interface BetslipTotals {
  /** Combined American odds across all legs; 0 when none can be computed. */
  totalOdds: number
  stake: number
  potentialReturn: number
}
