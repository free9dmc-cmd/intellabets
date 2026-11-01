import Anthropic from "@anthropic-ai/sdk"
import { anthropicKey, isAnthropicKeyWellFormed } from "./anthropic-key"
import {
  americanFromDecimal,
  copyProblem,
  defaultSelection,
  slipProblem,
  type BetType,
  type RiskLevel,
  type SlipCandidate,
  type SlipKind,
} from "./ai-picks"
import { sportsbookName } from "./sportsbooks"

const anthropic = new Anthropic({
  apiKey: anthropicKey() ?? undefined,
})

const MODEL = process.env.AI_MODEL ?? "claude-opus-5-5"

/**
 * Server-side refusal fallback ("default" lets the API pick the fallback
 * model). Only sent for model families that accept it.
 */
const SUPPORTS_FALLBACKS = /^claude-(opus-5|fable-5|sonnet-5-5)/.test(MODEL)

/** Below this much time left, skip the model and use the engine's ranking. */
const MIN_MODEL_BUDGET_MS = 5_000
/** Upper bound for one model call. */
const MAX_MODEL_MS = 25_000

/** What the slip is built from and who wrote its explanation. */
export interface AISlipChoice<C extends SlipCandidate = SlipCandidate> {
  picks: C[]
  title: string
  description: string
  analysis: string
  /** candidate id -> why this leg */
  reasons: Record<string, string>
  /** "ai" when Claude chose and explained the legs, "engine" when its own ranking was used. */
  writtenBy: "ai" | "engine"
}

const BET_TYPE_LABEL: Record<BetType, string> = {
  single: "single bet",
  parlay: "parlay",
  "same-game-parlay": "same-game parlay",
}

const RISK_LABEL: Record<RiskLevel, string> = {
  low: "Favorites (bets the engine rates at least 60% likely to win; they pay less)",
  medium: "Balanced (bets the engine rates 40-62% likely)",
  high: "Underdogs (bets the engine rates 15-40% likely; bigger payouts, more misses)",
}

/** Candidate labels the model may answer with. Fixed, so the output schema is too. */
const LABELS = Array.from({ length: 20 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`)

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short betslip title, at most 8 words" },
    description: { type: "string", description: "One sentence on what ties the legs together" },
    legs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string", enum: LABELS },
          reasoning: { type: "string", description: "1-2 sentences, using only the supplied numbers" },
        },
        required: ["label", "reasoning"],
        additionalProperties: false,
      },
    },
    analysis: { type: "string", description: "2-3 sentences on the slip as a whole and its main risk" },
  },
  required: ["title", "description", "legs", "analysis"],
  additionalProperties: false,
}

const SYSTEM = `You build sports betslips for IntellaBets, a betting-analytics site for adults 21+.

You may only use the candidate bets in the user's message. Each one is a real upcoming game priced by a licensed US sportsbook. Choose legs by their label.

Field meanings:
- engineWinChance: IntellaBets' estimate of the chance the bet wins, from the prices of many sportsbooks with their margin removed.
- price: what the sportsbook pays, in American odds.
- priceVsFair: the expected return at that price against the engine's estimate, in percent. Positive means the price is better than fair. Negative, which is normal, means the sportsbook's margin makes the price slightly worse than fair.

Write only from these numbers. For a bet whose priceVsFair is zero or negative, do not use the words "value", "edge", "undervalued", "underpriced" or "bargain" at all; say plainly that it is priced near or slightly below fair. Never mention injuries, statistics, trends, records, streaks, weather, lineups or news: you have none, and inventing them would mislead people betting real money. Never mention a player's or team's averages, recent games, minutes, usage, role, matchups, opponents' defense, pace or form: you have none of that data. Keep the tone plain and measured. Do not use the words "lock", "sure thing", "certainty", "risk-free" or "guarantee", not even to deny them; the page already explains that every bet can lose.`

function candidateLine(c: SlipCandidate, label: string) {
  return {
    label,
    game: `${c.game.awayTeam} @ ${c.game.homeTeam}`,
    gameId: c.gameId,
    // A prop's marketType is just "prop"; name the stat (and the player) instead.
    market: c.marketKey ? `player prop: ${c.stat ?? c.marketKey}` : c.marketType,
    ...(c.player ? { player: c.player } : {}),
    pick: c.selection,
    price: `${americanFromDecimal(c.offeredOdds)} at ${sportsbookName(c.offeredBook)}`,
    priceVsFair: `${c.edgePercent > 0 ? "+" : ""}${c.edgePercent.toFixed(1)}%`,
    engineWinChance: `${(c.fairProbability * 100).toFixed(1)}%`,
  }
}

/** One leg explained from the engine's numbers alone. */
function numericReason(c: SlipCandidate): string {
  const chance = `${(c.fairProbability * 100).toFixed(0)}%`
  if (c.edgePercent > 0) {
    return `The engine rates this ${chance} likely, and this price is ${c.edgePercent.toFixed(1)}% better than fair.`
  }
  return `The engine rates this ${chance} likely. This price is ${Math.abs(c.edgePercent).toFixed(1)}% below fair, close to the sportsbook's usual margin.`
}

/** The engine's ranking, explained from its own numbers. Used whenever Claude is not. */
function engineChoice<C extends SlipCandidate>(
  candidates: C[],
  sport: string,
  betType: BetType,
  legs: number,
  kind: SlipKind
): AISlipChoice<C> | null {
  const picks = defaultSelection(candidates, betType, legs)
  if (!picks) return null
  const reasons: Record<string, string> = {}
  for (const p of picks) reasons[p.id] = numericReason(p)
  const props = kind === "props"
  return {
    picks,
    title: props ? `${sport} player-prop ${BET_TYPE_LABEL[betType]}` : `${sport} ${BET_TYPE_LABEL[betType]}`,
    description: props
      ? "The pricing engine's best-priced player props for this risk level."
      : "The pricing engine's best-priced picks for this risk level.",
    // Prop prices are captured hours before the game, so they are not called live.
    analysis: `Chosen by the pricing engine from ${props ? "sportsbook player-prop" : "live sportsbook"} prices. Each leg shows the engine's win chance and how its price compares with fair.`,
    reasons,
    writtenBy: "engine",
  }
}

/**
 * Choose the legs for an AI betslip from the engine's board.
 *
 * Claude only picks labels from the supplied candidates and writes the words.
 * Prices, probabilities and the parlay maths come from engine data. If Claude
 * is unavailable, slow, refuses, breaks a rule, or writes something the copy
 * check rejects, the engine's own ranking is used instead. Returns null only
 * when no legal slip exists in the candidates.
 */
export async function chooseAISlip<C extends SlipCandidate>(params: {
  sport: string
  betType: BetType
  riskLevel: RiskLevel
  legs: number
  candidates: C[]
  /** Game lines (the default) or player props. */
  kind?: SlipKind
  /** Time the model call may take, so the request ends before its deadline. */
  budgetMs: number
}): Promise<AISlipChoice<C> | null> {
  const { sport, betType, riskLevel, legs } = params
  const kind = params.kind ?? "lines"
  const props = kind === "props"
  const candidates = params.candidates.slice(0, LABELS.length)
  if (candidates.length < legs) return null

  if (!isAnthropicKeyWellFormed(anthropicKey())) {
    console.error("AI picks: ANTHROPIC_API_KEY missing or malformed, using the engine's ranking")
    return engineChoice(candidates, sport, betType, legs, kind)
  }
  const timeout = Math.min(params.budgetMs, MAX_MODEL_MS)
  if (timeout < MIN_MODEL_BUDGET_MS) {
    console.error("AI picks: not enough time left for the model, using the engine's ranking")
    return engineChoice(candidates, sport, betType, legs, kind)
  }

  const byLabel = new Map(candidates.map((c, i) => [LABELS[i], c]))
  const rules =
    betType === "parlay"
      ? "Every leg must come from a different game (different gameId)."
      : betType === "same-game-parlay"
        ? props
          ? "Every leg must come from the SAME game (same gameId), each on a different player or a different stat. Never two legs on the same player and stat."
          : "Every leg must come from the SAME game (same gameId), each from a different market."
        : "Choose the single best bet."

  const prompt = `Build a ${props ? "player-prop " : ""}${BET_TYPE_LABEL[betType]} for ${sport}.
Risk level: ${RISK_LABEL[riskLevel]}.
Choose exactly ${legs} leg${legs === 1 ? "" : "s"}. ${rules}
Prefer the best priceVsFair. Candidates are listed best-priced first.

Candidates:
${JSON.stringify(
  candidates.map((c, i) => candidateLine(c, LABELS[i])),
  null,
  1
)}`

  try {
    const response = await anthropic.beta.messages.create(
      {
        model: MODEL,
        max_tokens: 16000,
        ...(SUPPORTS_FALLBACKS ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        thinking: { type: "adaptive" },
        // Choosing among supplied, pre-ranked bets: low effort is enough.
        output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      },
      // One bounded attempt: retries and retry-after sleeps could outlast the
      // route's deadline, and the engine's ranking is a fine answer.
      { timeout, maxRetries: 0 }
    )

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      console.error(`AI picks: model stopped with ${response.stop_reason}, using the engine's ranking`)
      return engineChoice(candidates, sport, betType, legs, kind)
    }
    const textBlock = response.content.find(
      (b): b is Extract<typeof b, { type: "text" }> => b.type === "text"
    )
    if (!textBlock) throw new Error(`no text block (stop_reason: ${response.stop_reason})`)

    const out = JSON.parse(textBlock.text) as {
      title: string
      description: string
      legs: { label: string; reasoning: string }[]
      analysis: string
    }
    const picks = out.legs.map((l) => byLabel.get(l.label)).filter((p): p is C => !!p)
    // The slip's own selections, players and teams are not read as claims.
    const names = candidates.flatMap((c) => [c.selection, c.player ?? "", c.game.homeTeam, c.game.awayTeam])
    // Each leg's words are checked against its own price; the slip's against all of them.
    const problem =
      (picks.length === out.legs.length ? slipProblem(picks, betType, legs) : "chose an unknown label") ??
      copyProblem([out.title, out.description, out.analysis].join("\n"), {
        belowFair: picks.some((p) => p.edgePercent <= 0),
        props,
        names,
      }) ??
      out.legs
        .map((l, i) => copyProblem(l.reasoning, { belowFair: picks[i].edgePercent <= 0, props, names }))
        .find(Boolean) ??
      null
    if (problem) {
      console.error(`AI picks: model's slip ${problem}, using the engine's ranking`)
      return engineChoice(candidates, sport, betType, legs, kind)
    }

    const reasons: Record<string, string> = {}
    out.legs.forEach((l, i) => {
      reasons[picks[i].id] = l.reasoning
    })
    return {
      picks,
      title: out.title,
      description: out.description,
      analysis: out.analysis,
      reasons,
      writtenBy: "ai",
    }
  } catch (err) {
    console.error("AI picks: model call failed, using the engine's ranking:", err)
    return engineChoice(candidates, sport, betType, legs, kind)
  }
}
