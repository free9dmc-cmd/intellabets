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

/** The three figures shown in the betslip summary card. */
export interface BetslipTotals {
  /** Combined American odds across all legs; 0 when none can be computed. */
  totalOdds: number
  stake: number
  potentialReturn: number
}
