/**
 * Client for the IntellaBets prediction engine (the NestJS API).
 *
 * The engine keeps its own user table, so a web user has no credentials there.
 * Instead the web app authenticates its OWN user, checks their entitlement,
 * then calls the engine server-to-server with a service key.
 *
 * ENGINE_SERVICE_KEY must never be exposed to the browser — only import this
 * from server components and route handlers, never from a "use client" file.
 */

const ENGINE_URL = process.env.ENGINE_API_URL ?? "https://api.intellabets.com/api/v1"

export interface StrategyDef {
  key: string
  name: string
  description: string
  caveat: string
  needsMovement: boolean
}

export interface EnginePrediction {
  id: string
  marketType: string
  selection: string
  outcomeName: string
  point: number | null
  fairProbability: number
  offeredOdds: number
  offeredBook: string
  edgePercent: number
  kellyStake: number
  confidence: number
  reasoning: string | null
  game: {
    sport: string
    league: string
    homeTeam: string
    awayTeam: string
    commenceTime: string
  }
  lineMovement: {
    openImpliedProbability: number
    currentImpliedProbability: number
    deltaPercentagePoints: number
  } | null
}

export interface StrategyResult {
  strategy: StrategyDef
  count: number
  note?: string
  predictions: EnginePrediction[]
}

export interface PlacementGuide {
  book: string
  bookName: string
  bookUrl: string
  matchup: string
  commenceTime: string
  selection: string
  marketLabel: string
  oddsAmerican: string
  oddsDecimal: number
  steps: { n: number; instruction: string; detail?: string }[]
  stake: { percentOfBankroll: number; exampleBankroll: number; exampleStake: number }
  warnings: string[]
}

export function isEngineConfigured(): boolean {
  return Boolean(process.env.ENGINE_SERVICE_KEY && process.env.ENGINE_SERVICE_KEY.length >= 16)
}

async function engineFetch<T>(path: string): Promise<T | null> {
  if (!isEngineConfigured()) return null
  try {
    const res = await fetch(`${ENGINE_URL}${path}`, {
      headers: { "x-engine-key": process.env.ENGINE_SERVICE_KEY as string },
      // Picks move with the market; never serve a cached slate.
      cache: "no-store",
    })
    if (!res.ok) {
      console.error(`Engine ${path} -> ${res.status}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.error(`Engine ${path} failed:`, err)
    return null
  }
}

export function listStrategies(): Promise<{ strategies: StrategyDef[] } | null> {
  return engineFetch("/predictions/strategies")
}

export function getStrategyPicks(
  key: string,
  opts: { sport?: string; limit?: number } = {}
): Promise<StrategyResult | null> {
  const qs = new URLSearchParams()
  if (opts.sport) qs.set("sport", opts.sport)
  if (opts.limit) qs.set("limit", String(opts.limit))
  const suffix = qs.toString() ? `?${qs}` : ""
  return engineFetch(`/predictions/strategy/${encodeURIComponent(key)}${suffix}`)
}

export function getPlacementGuide(
  predictionId: string,
  bankroll?: number
): Promise<PlacementGuide | null> {
  const qs = bankroll ? `?bankroll=${encodeURIComponent(bankroll)}` : ""
  return engineFetch(`/predictions/${encodeURIComponent(predictionId)}/how-to-bet${qs}`)
}

export interface BookOption {
  book: string
  bookName: string
  oddsAmerican: string
  oddsDecimal: number
  payout: number
  profit: number
  link: string | null
  isBest: boolean
  isPreferred: boolean
  lessThanBest: number
}

export interface BookComparison {
  selection: string
  matchup: string
  stake: number
  options: BookOption[]
  best: BookOption | null
  preferred: BookOption | null
  savingsVsPreferred: number
  note: string
  pricesAsOf: string | null
  disclaimer: string
}

export interface PredictionResult {
  predictionId: string
  status: string
  settledAt: string | null
  closingOdds: number | null
  clv: number | null
  gameStatus: string
  finalScore: string | null
}

export function getBookComparison(
  predictionId: string,
  opts: { stake?: number; preferred?: string | null } = {}
): Promise<BookComparison | null> {
  const qs = new URLSearchParams()
  if (opts.stake) qs.set("stake", String(opts.stake))
  if (opts.preferred) qs.set("preferred", opts.preferred)
  const suffix = qs.toString() ? `?${qs}` : ""
  return engineFetch(`/predictions/${encodeURIComponent(predictionId)}/books${suffix}`)
}

/** Settlement outcomes for picks the user bet on, used to grade their bets. */
export function getPredictionResults(ids: string[]): Promise<{ results: PredictionResult[] } | null> {
  if (ids.length === 0) return Promise.resolve({ results: [] })
  return engineFetch(`/predictions/results?ids=${encodeURIComponent(ids.join(","))}`)
}
