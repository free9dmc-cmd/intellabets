// ─── Odds ─────────────────────────────────────────────────────────────────────

export type OddsFormat = "american" | "decimal" | "fractional"

export interface RawOdds {
  format: OddsFormat
  value: number | string // +150 | 2.50 | "3/2"
}

export interface NormalizedOdds {
  american: number   // e.g. +150 or -110
  decimal: number    // e.g. 2.50
  fractional: string // e.g. "3/2"
  impliedProbability: number // 0–1, no vig removed
}

// ─── Markets ──────────────────────────────────────────────────────────────────

export type MarketType =
  | "moneyline"
  | "spread"
  | "total"
  | "prop"
  | "futures"
  | "team_total"
  | "draw_no_bet"

export type Sport =
  | "NFL" | "NBA" | "MLB" | "NHL"
  | "NCAAF" | "NCAAB"
  | "Soccer" | "UFC" | "Tennis" | "Golf"

export interface Outcome {
  id: string
  name: string            // "Kansas City Chiefs", "Over", "Dak Prescott"
  description: string     // "Kansas City Chiefs -6.5", "Over 224.5"
  odds: NormalizedOdds
  point?: number          // spread / total line value
  isMain: boolean         // false for alternate lines
}

export interface MarketLine {
  id: string
  type: MarketType
  name: string            // normalized canonical name
  rawName: string         // original name from provider
  outcomes: Outcome[]
  lastUpdated: Date
}

export interface Market {
  id: string              // provider-scoped game ID
  canonicalId: string     // our stable ID: "{sport}:{homeTeam}:{awayTeam}:{date}"
  sport: Sport
  league: string
  homeTeam: string
  awayTeam: string
  commenceTime: Date
  provider: string
  isLive: boolean
  markets: MarketLine[]
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type PropCategory =
  | "passing" | "rushing" | "receiving"
  | "scoring" | "rebounds" | "assists"
  | "strikeouts" | "hits" | "goals"

export interface PropBet {
  id: string
  gameId: string
  playerId?: string
  playerName?: string
  team?: string
  propType: string        // "Passing Yards", "Touchdowns", "3-Pointers Made"
  category: PropCategory
  line: number            // e.g. 247.5
  outcomes: Outcome[]     // Over / Under (sometimes alt lines)
  provider: string
  lastUpdated: Date
}

// ─── Pseudo-bet (tracking only — no real wager placed) ────────────────────────

export interface PseudoBetRequest {
  userId: string
  gameId: string
  marketType: MarketType
  outcomeId: string
  stake: number           // in USD
  odds: NormalizedOdds
}

export interface PseudoBetResult {
  success: boolean
  betId: string           // our internal tracking ID
  reference: string       // provider-style reference for display
  placedAt: Date
  estimatedSettlement: Date
  stake: number
  potentialReturn: number
  message?: string
}

// ─── Provider health ──────────────────────────────────────────────────────────

export interface ProviderHealth {
  provider: string
  healthy: boolean
  latencyMs?: number
  checkedAt: Date
  error?: string
}

// ─── List options ─────────────────────────────────────────────────────────────

export interface ListMarketsOptions {
  sport?: Sport
  date?: Date             // games on/after this date (defaults to today)
  limit?: number
  live?: boolean
}

export interface GetPropsOptions {
  playerId?: string
  category?: PropCategory
}
