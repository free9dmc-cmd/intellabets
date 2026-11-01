/**
 * Rules for building an AI Picks betslip out of the engine's board: every real,
 * upcoming bet licensed books price, with the engine's honest win chance.
 *
 * Pure functions only (no network, no DB), so the money logic is unit-tested
 * in isolation. The model only chooses among candidates these functions allow
 * and writes the explanation; every price and probability comes from here.
 */

/** What the slip rules need from a bet. The engine's BoardCandidate satisfies it. */
export interface SlipCandidate {
  /** Unique per bet; the board ref. */
  id: string
  gameId: string
  outcomeId: string
  /** moneyline | spread | total, or "prop" for every player prop. */
  marketType: string
  /** A prop's "<stat>|<player>" key, e.g. "player_points|LeBron James"; null for game lines. */
  marketKey?: string | null
  player?: string | null
  /** The prop's stat as shown, e.g. "Points". */
  stat?: string | null
  selection: string
  fairProbability: number
  /** Decimal price at the chosen book (or the best licensed price). */
  offeredOdds: number
  offeredBook: string
  /** Expected return at offeredOdds, in %. Usually negative. */
  edgePercent: number
  confidence: number
  game: { sport: string; homeTeam: string; awayTeam: string; commenceTime: string }
}

export type BetType = "single" | "parlay" | "same-game-parlay"
export type RiskLevel = "low" | "medium" | "high"
/** What a slip is built from: game lines (moneyline, spread, total) or player props. */
export type SlipKind = "lines" | "props"

/** Sports the engine ingests in production (ACTIVE_SPORTS in render.yaml). */
export const AI_SPORTS = ["NFL", "NCAAF", "NBA", "NHL", "MLB"] as const
export type AISport = (typeof AI_SPORTS)[number]

/** Sports the engine fetches player props for (PROPS_SPORTS in render.yaml). */
export const PROP_SPORTS = ["NBA", "NFL", "NHL"] as const

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
 * Legs per player-prop slip. A game has dozens of props on different players
 * and stats, so a same-game parlay can take more than 2 legs. Most props are
 * priced near 50/50, so Favorites and Underdogs find only a few per game:
 * their parlays stay short.
 */
export const PROP_LEG_COUNT: Record<RiskLevel, Record<BetType, number>> = {
  low: { single: 1, parlay: 2, "same-game-parlay": 2 },
  medium: { single: 1, parlay: 3, "same-game-parlay": 3 },
  high: { single: 1, parlay: 4, "same-game-parlay": 2 },
}

export function legCount(kind: SlipKind, risk: RiskLevel, betType: BetType): number {
  return (kind === "props" ? PROP_LEG_COUNT : LEG_COUNT)[risk][betType]
}

/**
 * Which bets fit each risk level, by the engine's win chance: favorites it rates
 * at least 60% likely, coin-flip-ish bets, and underdogs at 40% or less. The
 * floor on underdogs keeps out lottery tickets whose prices are least reliable.
 */
export function inRiskBand(c: { fairProbability: number }, risk: RiskLevel): boolean {
  const p = c.fairProbability
  if (risk === "low") return p >= 0.6
  if (risk === "medium") return p >= 0.4 && p < 0.62
  return p >= 0.15 && p <= 0.4
}

/**
 * The same bands as win-chance bounds, for the engine to apply before it cuts
 * the board to size (a props board can hold hundreds of near-50/50 bets that
 * would crowd out the few Favorites and Underdogs). Balanced's upper bound is
 * inclusive here; inRiskBand still decides.
 */
export function riskBandBounds(risk: RiskLevel): { minProb: number; maxProb: number } {
  if (risk === "low") return { minProb: 0.6, maxProb: 1 }
  if (risk === "medium") return { minProb: 0.4, maxProb: 0.62 }
  return { minProb: 0.15, maxProb: 0.4 }
}

/**
 * Sports whose player props the engine grades, so a tracked prop bet gets a
 * result. NBA and NFL props have no grader. Add "NHL" only after its grader is
 * verified on a real slate (RUNBOOK).
 */
export const TRACKABLE_PROP_SPORTS: readonly string[] = ["MLB"]

/**
 * Whether a leg can be logged as a tracked bet: only a single (one leg of a
 * parlay is not the bet placed), and a player prop only where it is graded.
 */
export function isTrackable(leg: { marketType: string; sport: string }, legs: number): boolean {
  return legs === 1 && (leg.marketType !== "prop" || TRACKABLE_PROP_SPORTS.includes(leg.sport))
}

/** Why a player prop cannot be tracked, shown where "I placed this" would be. */
export function untrackablePropMessage(sport: string): string {
  return `We can't grade ${sport} player props yet, so this bet can't be tracked here.`
}

/**
 * Markets one same-game parlay may not combine. A team's moneyline and spread
 * are near-duplicates of one bet, and most books refuse them together.
 */
const SGP_CONFLICTS: readonly (readonly [string, string])[] = [["moneyline", "spread"]]

/**
 * The market a leg is on, for the one-leg-per-market rule: a game line's
 * market type, or a prop's player and stat. So a same-game prop parlay may mix
 * players, or stats for one player, but never both sides of one player's stat
 * or two numbers on it.
 */
const conflictKey = (c: { marketType: string; marketKey?: string | null }) => c.marketKey ?? c.marketType

function conflictsInGame(marketType: string, others: string[]): boolean {
  return others.some(
    (m) => m === marketType || SGP_CONFLICTS.some(([a, b]) => (a === m && b === marketType) || (b === m && a === marketType))
  )
}

/** Most candidates shown to the model. The board ranks them, so these are its best. */
export const MAX_CANDIDATES = 20

/** For a regular parlay, at most this many candidates per game, so 20 cover 10+ games. */
const PER_GAME_FOR_PARLAY = 2

export const isBetType = (v: unknown): v is BetType => BET_TYPES.includes(v as BetType)
export const isRiskLevel = (v: unknown): v is RiskLevel => RISK_LEVELS.includes(v as RiskLevel)
export const isAISport = (v: unknown): v is AISport => (AI_SPORTS as readonly string[]).includes(v as string)
export const isSlipKind = (v: unknown): v is SlipKind => v === "lines" || v === "props"
export const isPropSport = (v: unknown): boolean => (PROP_SPORTS as readonly string[]).includes(v as string)

/**
 * The picks a slip may be built from, best-ranked first.
 *
 * Games that have started are dropped (their pregame price is gone). For a
 * same-game parlay only games with enough picks in different markets (for
 * props, on different players or stats) qualify; otherwise every pick
 * qualifies and the one-leg-per-game rule is enforced when the legs are chosen.
 */
export function eligibleCandidates<C extends SlipCandidate>(
  preds: C[],
  betType: BetType,
  legs: number,
  now: number
): C[] {
  const seen = new Set<string>()
  const upcoming = preds.filter((p) => {
    if (seen.has(p.outcomeId)) return false
    seen.add(p.outcomeId)
    return new Date(p.game.commenceTime).getTime() > now
  })

  if (betType === "single") return upcoming.slice(0, MAX_CANDIDATES)
  if (betType === "parlay") {
    const perGame = new Map<string, number>()
    return upcoming
      .filter((p) => {
        const n = perGame.get(p.gameId) ?? 0
        perGame.set(p.gameId, n + 1)
        return n < PER_GAME_FOR_PARLAY
      })
      .slice(0, MAX_CANDIDATES)
  }

  const byGame = new Map<string, C[]>()
  for (const p of upcoming) {
    const group = byGame.get(p.gameId) ?? []
    // One leg per market (both sides of a market cannot be combined), and no
    // moneyline with a spread. For props the market is the player and stat.
    if (!conflictsInGame(conflictKey(p), group.map(conflictKey))) group.push(p)
    byGame.set(p.gameId, group)
  }
  return Array.from(byGame.values())
    .filter((group) => group.length >= legs)
    .flat()
    .slice(0, MAX_CANDIDATES)
}

/** Whether `picks` is a legal slip of `legs` legs for this bet type; null if so, else why not. */
export function slipProblem(picks: SlipCandidate[], betType: BetType, legs: number): string | null {
  if (picks.length !== legs) return `needs exactly ${legs} leg${legs === 1 ? "" : "s"}, got ${picks.length}`
  if (new Set(picks.map((p) => p.id)).size !== picks.length) return "repeats a leg"
  if (betType === "parlay" && new Set(picks.map((p) => p.gameId)).size !== picks.length) {
    return "uses two legs from one game in a regular parlay"
  }
  if (betType === "same-game-parlay") {
    if (new Set(picks.map((p) => p.gameId)).size !== 1) return "mixes games in a same-game parlay"
    const markets = picks.map(conflictKey)
    if (markets.some((m, i) => conflictsInGame(m, markets.slice(0, i)))) {
      return picks.some((p) => p.marketKey)
        ? "puts the same player and stat in a same-game parlay twice"
        : "combines markets a same-game parlay cannot (the same market twice, or a moneyline with a spread)"
    }
  }
  return null
}

/**
 * The engine's own choice when the model is unavailable or its answer breaks a
 * rule: the highest-ranked legs that form a legal slip, or null if none do.
 */
export function defaultSelection<C extends SlipCandidate>(
  candidates: C[],
  betType: BetType,
  legs: number
): C[] | null {
  if (betType === "same-game-parlay") {
    const gameId = candidates[0]?.gameId
    const picks = candidates.filter((c) => c.gameId === gameId).slice(0, legs)
    return slipProblem(picks, betType, legs) ? null : picks
  }
  const picks: C[] = []
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

/** Distinct upcoming games in a pool, for telling the user why a parlay was impossible. */
export function upcomingGameCount(preds: SlipCandidate[], now: number): number {
  return new Set(preds.filter((p) => new Date(p.game.commenceTime).getTime() > now).map((p) => p.gameId)).size
}

/**
 * Words the slip text must not contain, or null. Inducements a licensed
 * operator's partners commit not to use, and claims the model has no data for
 * (it gets prices and probabilities only, so any injury, weather, lineup,
 * record or results talk is invented).
 *
 * Denials count too ("nothing is guaranteed", "no injury concerns"): the
 * prompt tells the model not to use these words at all, because a denial is
 * easily the start of a claim ("not a guarantee, it's a certainty") or a
 * claim itself ("Detroit has no injury concerns").
 *
 * With `belowFair`, the text describes a bet priced at or below fair, and may
 * not call it value, an edge, undervalued or underpriced.
 *
 * With `props`, the text describes player props, and may not make any claim
 * about a player's or team's numbers or news: averages, recent games, hitting
 * the over, highs, form, minutes, usage or role, the opponent's defense or
 * pace, who is out, or who leads the team. The model has none of that data.
 */
export function copyProblem(text: string, opts: { belowFair?: boolean; props?: boolean } = {}): string | null {
  const banned: [RegExp, string][] = [
    [/\blocks?\b|\blocked in\b/i, "\"lock\""],
    [/\brisk[- ]?free\b/i, "\"risk-free\""],
    [/\bfree (bets?|money)\b/i, "\"free bet\""],
    [/\bsure (things?|bets?)\b|\bcan'?t[- ]miss\b|\bno[- ]brainer\b|\b(near[- ])?certain(ty)?\b/i, "\"sure thing\""],
    [/\b(can'?t|cannot) lose\b/i, "\"can't lose\""],
    [/\bguarantee[sd]?\b/i, "a guarantee"],
    [/\binjur(y|ies|ed)\b|\b(questionable|doubtful|ruled out|sidelined|hamstring|ankle|knee|concussion)\b/i, "injuries"],
    [/\blineups?\b/i, "lineups"],
    [/\bweather\b|\b(rain|wind|windy|snow)\b|\b(weather|in the) forecast\b/i, "weather"],
    [/\bstreaks?\b|\bin a row\b|\bstraight (games|wins|losses|covers|road|home|starts|weeks|seasons)\b/i, "streaks"],
    // Win-loss records such as "6-1"; not prices (-110), spreads (-3.5) or ranges like 40-62%.
    [/\brecords?\b|(?<![-+.\d])\b\d{1,2}-\d{1,2}\b(?![.\d]|\s*(%|percent|points?\b))/i, "records"],
    [/\blast \d+ (games|meetings)\b|\b(has|have|had) (won|lost|covered|beaten|dropped)\b/i, "past results"],
    [/\bATS\b|\bper game\b|\b(this|last) season\b/i, "statistics"],
  ]
  if (opts.belowFair) {
    banned.push([
      /\b(value|edges?|under-?priced|mispriced|overlay|bargain)\b|\bunder-?valu\w*|\+\s?EV\b|\bEV\+|\b(plus|positive)[- ]?(EV|expected (value|return))\b/i,
      "value at a below-fair price",
    ])
  }
  if (opts.props) {
    // Tested on invented and legitimate prop sentences (ai-picks.test.ts): it
    // names stats and news, not selections, prices or payouts.
    banned.push([
      /\baverag(e[sd]?|ing)\b|\b(of|in) (his|her|their|the) last \d+\b|\blast (week|night|game|outing|time)\b|\b(has|have|had|he's|she's) (gone|hit|cleared|topped|scored|recorded|thrown|rushed|posted|been)\b|\b(career|season)[- ]highs?\b|\b(hot|cold|slump|lately|recent(ly)?|trend(s|ing)?)\b|\b(usage|minutes|snap (count|share)|targets?|touches|carries|time on ice|TOI|power[- ]play|role)\b|\b(defen[cs]e|defensive|allows?|allowed|pace|opponents?)\b|\b(is|are|sits?|sitting) out\b|\bwith \w+ out\b|\b(scratch(ed)?|inactive|resting|rested|load management)\b|\bleads? (the|his|their) (team|league)\b/i,
      "player stats or news",
    ])
  }
  for (const [re, what] of banned) if (re.test(text)) return `mentions ${what}`
  return null
}
