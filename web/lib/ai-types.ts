/**
 * Shapes shared by the AI picks API (server) and the AI picks page (browser).
 *
 * Kept in a module with no imports and no side effects. lib/ai.ts builds an
 * Anthropic client at load time, so a browser component that imported types
 * from it would be one careless edit away from bundling the server SDK.
 */

export interface AIBet {
  game: string
  homeTeam: string
  awayTeam: string
  pick: string
  odds: number
  betType: string
  line: string
  sport: string
  gameDate: string
  reasoning: string
}

export interface AIBetslip {
  title: string
  description: string
  sport: string
  league: string
  bets: AIBet[]
  totalOdds: number
  stake: number
  potentialReturn: number
  confidence: number
  analysis: string
}
