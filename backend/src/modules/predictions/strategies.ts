/**
 * Betting strategies.
 *
 * Every strategy draws from the SAME pool of mathematically +EV bets the engine
 * already found — none of them invent edge. They differ in which of those bets
 * they surface and how they rank them, which produces genuinely different
 * slates with different risk profiles.
 *
 * Only strategies the data can actually support are defined here. "Fade the
 * public", for example, needs public betting percentages we do not have, so it
 * is deliberately absent rather than faked with a proxy that doesn't mean what
 * the name implies.
 */

export type StrategyKey = "value" | "steam" | "contrarian" | "safe" | "longshot"

export interface StrategyDef {
  key: StrategyKey
  name: string
  description: string
  /** Honest statement of what this does and does not do. Shown in the UI. */
  caveat: string
  /** Needs historical odds snapshots to compute line movement. */
  needsMovement: boolean
}

export const STRATEGIES: Record<StrategyKey, StrategyDef> = {
  value: {
    key: "value",
    name: "Best Value",
    description:
      "Pure expected value. The bets where the best available price most exceeds the de-vigged market consensus.",
    caveat:
      "Ranked by confidence, which weights cross-book agreement heavily. A large edge on a bet only one or two books price is usually a stale line, not free money.",
    needsMovement: false,
  },
  steam: {
    key: "steam",
    name: "Following the Move",
    description:
      "Bets where the market has moved toward this side since the line opened — often a sign money is arriving on it.",
    caveat:
      "You are betting after the move, so you get a worse number than the people who caused it. This follows sharp money; it does not beat it.",
    needsMovement: true,
  },
  contrarian: {
    key: "contrarian",
    name: "Against the Move",
    description:
      "Bets where the market moved AWAY from this side, so the price is now better than it opened.",
    caveat:
      "You are taking the side the money left. The better number is real; the reason the money left may also be real. Higher variance.",
    needsMovement: true,
  },
  safe: {
    key: "safe",
    name: "Lower Variance",
    description:
      "Favourites — outcomes the market prices above 60% likely. Smaller edges, but they land more often.",
    caveat:
      "Hits more often, wins less per bet. Lower variance is not lower risk: a losing favourite costs more than a losing underdog returns.",
    needsMovement: false,
  },
  longshot: {
    key: "longshot",
    name: "Higher Variance",
    description:
      "Underdogs the market prices below 40% likely, where the edge is largest.",
    caveat:
      "Expect long losing streaks. These are +EV over a large sample and painful over a small one. Stake accordingly.",
    needsMovement: false,
  },
}

export function isStrategyKey(x: string | undefined): x is StrategyKey {
  return !!x && x in STRATEGIES
}

// ─── Line movement ────────────────────────────────────────────────────────────

/** Shape of a stored OddsSnapshot.markets blob. */
type StoredBooks = Record<
  string,
  { book: string; line: { outcomes: { id: string; odds: { decimal: number } }[] } }[]
>

/**
 * Mean implied probability for one outcome across all books in a snapshot.
 * Returns null when the outcome isn't present in that snapshot.
 */
export function impliedProbAtSnapshot(markets: unknown, outcomeId: string): number | null {
  const books = markets as StoredBooks
  if (!books || typeof books !== "object") return null

  const probs: number[] = []
  for (const marketBooks of Object.values(books)) {
    if (!Array.isArray(marketBooks)) continue
    for (const bm of marketBooks) {
      const outcome = bm?.line?.outcomes?.find((o) => o.id === outcomeId)
      if (outcome && outcome.odds?.decimal > 0) probs.push(1 / outcome.odds.decimal)
    }
  }
  if (probs.length === 0) return null
  return probs.reduce((s, p) => s + p, 0) / probs.length
}

export interface LineMovement {
  /** Change in implied probability, open -> now. Positive = market moved TOWARD this side. */
  delta: number
  openProb: number
  currentProb: number
}

/**
 * Movement for one outcome between the earliest and latest snapshot.
 * @param snapshots ordered oldest-first
 */
export function computeLineMovement(
  snapshots: { markets: unknown }[],
  outcomeId: string
): LineMovement | null {
  if (snapshots.length < 2) return null

  let openProb: number | null = null
  for (const snap of snapshots) {
    openProb = impliedProbAtSnapshot(snap.markets, outcomeId)
    if (openProb !== null) break
  }

  let currentProb: number | null = null
  for (let i = snapshots.length - 1; i >= 0; i--) {
    currentProb = impliedProbAtSnapshot(snapshots[i].markets, outcomeId)
    if (currentProb !== null) break
  }

  if (openProb === null || currentProb === null || openProb === currentProb) return null
  return { delta: currentProb - openProb, openProb, currentProb }
}

// ─── Selection ────────────────────────────────────────────────────────────────

/** Minimum probability shift (in implied-probability points) to count as a move. */
const MOVEMENT_THRESHOLD = 0.015

export interface StrategyCandidate {
  fairProbability: number
  confidence: number
  edgePercent: number
  movement?: LineMovement | null
}

/** Does this bet qualify for the strategy? */
export function matchesStrategy(strategy: StrategyKey, c: StrategyCandidate): boolean {
  switch (strategy) {
    case "value":
      return true
    case "safe":
      return c.fairProbability >= 0.6
    case "longshot":
      return c.fairProbability <= 0.4
    case "steam":
      return !!c.movement && c.movement.delta >= MOVEMENT_THRESHOLD
    case "contrarian":
      return !!c.movement && c.movement.delta <= -MOVEMENT_THRESHOLD
  }
}

/** Higher sorts first. */
export function scoreForStrategy(strategy: StrategyKey, c: StrategyCandidate): number {
  switch (strategy) {
    case "value":
      return c.confidence
    case "safe":
      // Prefer the most likely outcomes, using confidence to break ties.
      return c.fairProbability * 100 + c.confidence / 100
    case "longshot":
      // Prefer the biggest edges, since these are priced to lose often.
      return c.edgePercent + c.confidence / 100
    case "steam":
      return (c.movement?.delta ?? 0) * 1000 + c.confidence / 100
    case "contrarian":
      return -(c.movement?.delta ?? 0) * 1000 + c.confidence / 100
  }
}
