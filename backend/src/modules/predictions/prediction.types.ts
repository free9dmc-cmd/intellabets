import type { MarketType, Sport } from "../sportsbook/types/provider.types"

/** One book's decimal price for a single outcome. */
export interface BookPrice {
  book: string
  decimal: number
  point?: number
}

/** All books' prices for one outcome, plus the de-vigged consensus. */
export interface ConsensusOutcome {
  outcomeId: string
  name: string
  selection: string
  point?: number
  prices: BookPrice[]
  bestBook: string
  bestDecimal: number        // best (highest) price available — line shopping result
  fairProbability: number    // de-vigged consensus probability, 0-1
  fairDecimal: number        // 1 / fairProbability
  bookAgreement: number      // 0-1, higher = books agree more (lower variance)
}

/** A +EV opportunity the engine found. */
export interface ValueBet {
  gameId: string
  canonicalId: string
  sport: Sport
  matchup: string            // "Away @ Home"
  commenceTime: Date
  marketType: MarketType
  outcomeId: string
  selection: string          // display, e.g. "Chiefs -6.5"
  outcomeName: string        // raw side: team name | "Over" | "Under"
  point?: number

  fairProbability: number    // 0-1
  offeredDecimal: number     // best available price
  offeredBook: string
  edgePercent: number        // EV% = (fairProb * offeredDecimal - 1) * 100
  kellyStake: number         // fractional-Kelly bankroll fraction, 0-1
  confidence: number         // 0-100 composite score
  numBooks: number
}

export interface EngineConfig {
  /** Minimum edge % to surface a bet (default 2%). */
  minEdgePercent?: number
  /** Kelly multiplier for safety, e.g. 0.25 = quarter-Kelly (default 0.25). */
  kellyFraction?: number
  /** Minimum number of books required to trust consensus (default 3). */
  minBooks?: number
  /** Cap on any single stake as bankroll fraction (default 0.05). */
  maxStake?: number
}

export interface RankedPrediction extends ValueBet {
  reasoning?: string
  aiVerdict?: "strong" | "lean" | "pass"
}
