/**
 * Rules for building an AI Picks betslip out of the engine's real picks.
 *
 * Pure functions only (no network, no DB), so the money logic is unit-tested
 * in isolation. The model only chooses among candidates these functions allow
 * and writes the explanation; every price and probability comes from here.
 */
import type { EnginePrediction } from "./engine"

export type BetType = "single" | "parlay" | "same-game-parlay"
export type RiskLevel = "low" | "medium" | "high"

/** Sports the engine can ingest. Which ones have live picks depends on ACTIVE_SPORTS. */
export const AI_SPORTS = ["NFL", "NCAAF", "NBA", "NCAAB", "NHL", "MLB", "Soccer", "UFC"] as const
export type AISport = (typeof AI_SPORTS)[number]

export const BET_TYPES: readonly BetType[] = ["single", "parlay", "same-game-parlay"]
export const RISK_LEVELS: readonly RiskLevel[] = ["low", "medium", "high"]

/**
 * Legs per slip. A balanced parlay is 3 legs. Same-game parlays are 2 legs at
 * every level: the engine prices a game's moneyline, spread and total, and a
 * moneyline cannot be paired with a spread, so a third leg never exists.
 */
export const LEG_COUNT: Record<RiskLevel, Record<BetType, number>> = {
  low: { single: 1, parlay: 2, "same-game-parlay": 2 },
  medium: { single: 1, parlay: 3, "same-game-parlay": 2 },
  high: { single: 1, parlay: 5, "same-game-parlay": 2 },
}

/**
 * The engine strategy whose picks fit each risk level (backend strategies.ts):
 * safe = the engine rates the outcome at least 60% likely, longshot = at most
 * 40%, value = every +EV pick ranked by edge.
 */
export const RISK_STRATEGY: Record<RiskLevel, "safe" | "value" | "longshot"> = {
  low: "safe",
  medium: "value",
  high: "longshot",
}

/**
 * Markets one same-game parlay may not combine. A team's moneyline and spread
 * are near-duplicates of one bet, and most books refuse them together.
 */
const SGP_CONFLICTS: readonly (readonly [string, string])[] = [["moneyline", "spread"]]

function conflictsInGame(marketType: string, others: string[]): boolean {
  return others.some(
    (m) => m === marketType || SGP_CONFLICTS.some(([a, b]) => (a === m && b === marketType) || (b === m && a === marketType))
  )
}

/** Most candidates shown to the model. The engine ranks them, so these are its best. */
export const MAX_CANDIDATES = 20

export const isBetType = (v: unknown): v is BetType => BET_TYPES.includes(v as BetType)
export const isRiskLevel = (v: unknown): v is RiskLevel => RISK_LEVELS.includes(v as RiskLevel)
export const isAISport = (v: unknown): v is AISport => (AI_SPORTS as readonly string[]).includes(v as string)

/**
 * The picks a slip may be built from, best-ranked first.
 *
 * Games that have started are dropped (their pregame price is gone). For a
 * same-game parlay only games with enough picks in different markets qualify;
 * otherwise every pick qualifies and the one-leg-per-game rule is enforced
 * when the legs are chosen.
 */
export function eligibleCandidates(
  preds: EnginePrediction[],
  betType: BetType,
  legs: number,
  now: number
): EnginePrediction[] {
  const seen = new Set<string>()
  const upcoming = preds.filter((p) => {
    if (seen.has(p.outcomeId)) return false
    seen.add(p.outcomeId)
    return new Date(p.game.commenceTime).getTime() > now
  })

  if (betType !== "same-game-parlay") return upcoming.slice(0, MAX_CANDIDATES)

  const byGame = new Map<string, EnginePrediction[]>()
  for (const p of upcoming) {
    const group = byGame.get(p.gameId) ?? []
    // One leg per market (both sides of a market cannot be combined), and no
    // moneyline with a spread.
    if (!conflictsInGame(p.marketType, group.map((g) => g.marketType))) group.push(p)
    byGame.set(p.gameId, group)
  }
  return Array.from(byGame.values())
    .filter((group) => group.length >= legs)
    .flat()
    .slice(0, MAX_CANDIDATES)
}

/** Whether `picks` is a legal slip of `legs` legs for this bet type; null if so, else why not. */
export function slipProblem(picks: EnginePrediction[], betType: BetType, legs: number): string | null {
  if (picks.length !== legs) return `needs exactly ${legs} leg${legs === 1 ? "" : "s"}, got ${picks.length}`
  if (new Set(picks.map((p) => p.id)).size !== picks.length) return "repeats a leg"
  if (betType === "parlay" && new Set(picks.map((p) => p.gameId)).size !== picks.length) {
    return "uses two legs from one game in a regular parlay"
  }
  if (betType === "same-game-parlay") {
    if (new Set(picks.map((p) => p.gameId)).size !== 1) return "mixes games in a same-game parlay"
    const markets = picks.map((p) => p.marketType)
    if (markets.some((m, i) => conflictsInGame(m, markets.slice(0, i)))) {
      return "combines markets a same-game parlay cannot (the same market twice, or a moneyline with a spread)"
    }
  }
  return null
}

/**
 * The engine's own choice when the model is unavailable or its answer breaks a
 * rule: the highest-ranked legs that form a legal slip, or null if none do.
 */
export function defaultSelection(
  candidates: EnginePrediction[],
  betType: BetType,
  legs: number
): EnginePrediction[] | null {
  if (betType === "same-game-parlay") {
    const gameId = candidates[0]?.gameId
    const picks = candidates.filter((c) => c.gameId === gameId).slice(0, legs)
    return slipProblem(picks, betType, legs) ? null : picks
  }
  const picks: EnginePrediction[] = []
  const games = new Set<string>()
  for (const c of candidates) {
    if (betType === "parlay" && games.has(c.gameId)) continue
    picks.push(c)
    games.add(c.gameId)
    if (picks.length === legs) break
  }
  return slipProblem(picks, betType, legs) ? null : picks
}

/**
 * Combined price and the engine's chance the whole slip wins.
 *
 * The win chance multiplies the legs' de-vigged probabilities, which assumes
 * the legs are independent. That holds roughly for legs from different games
 * and not for a same-game parlay, which callers must say.
 */
export function parlayMath(legs: { decimal: number; fairProbability: number }[]): {
  combinedDecimal: number
  winProbability: number
} {
  const combinedDecimal = legs.reduce((acc, l) => acc * l.decimal, 1)
  const winProbability = legs.reduce((acc, l) => acc * l.fairProbability, 1)
  return {
    combinedDecimal: Math.round(combinedDecimal * 1000) / 1000,
    winProbability: Math.round(winProbability * 10000) / 10000,
  }
}

/** Decimal odds as an American price string, e.g. 2.5 -> "+150", 1.909 -> "-110". */
export function americanFromDecimal(d: number): string {
  if (!(d > 1)) return "—"
  const a = d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1))
  return a > 0 ? `+${a}` : `${a}`
}
