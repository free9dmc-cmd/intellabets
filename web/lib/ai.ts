import Anthropic from "@anthropic-ai/sdk"
import { anthropicKey, isAnthropicKeyWellFormed } from "./anthropic-key"
import type { EnginePrediction } from "./engine"
import { americanFromDecimal, defaultSelection, slipProblem, type BetType, type RiskLevel } from "./ai-picks"

const anthropic = new Anthropic({
  apiKey: anthropicKey() ?? undefined,
})

const MODEL = process.env.AI_MODEL ?? "claude-opus-5-5"

/**
 * Server-side refusal fallback ("default" lets the API pick the fallback
 * model). Only sent for model families that accept it.
 */
const SUPPORTS_FALLBACKS = /^claude-(opus-5|fable-5|sonnet-5-5)/.test(MODEL)

/** What the slip is built from and who wrote its explanation. */
export interface AISlipChoice {
  picks: EnginePrediction[]
  title: string
  description: string
  analysis: string
  /** predictionId -> why this leg */
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
  low: "Safe (favorites the engine rates at least 60% likely)",
  medium: "Balanced (the best value at any price)",
  high: "High Value (underdogs the engine rates under 40% likely, bigger payouts)",
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
          reasoning: { type: "string", description: "1-2 sentences, using only the supplied data" },
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

You may only use the candidate bets in the user's message. Each one is a real upcoming game priced by licensed US sportsbooks, with an estimate from IntellaBets' pricing engine. Choose legs by their label.

Write only from the supplied fields: the engine's win chance, its edge over the price, its confidence score, line movement and the engine's note. Never mention injuries, statistics, trends, records, weather or news. You have none, and inventing them would mislead people betting real money. Keep the tone plain and measured. No guarantees, and no words like "lock" or "sure thing".`

function candidateLine(p: EnginePrediction, label: string) {
  return {
    label,
    game: `${p.game.awayTeam} @ ${p.game.homeTeam}`,
    kickoff: p.game.commenceTime,
    market: p.marketType,
    pick: p.selection,
    bestPrice: `${americanFromDecimal(p.offeredOdds)} at ${p.offeredBook}`,
    engineWinChance: `${(p.fairProbability * 100).toFixed(1)}%`,
    edge: `${p.edgePercent.toFixed(1)}%`,
    confidence: Math.round(p.confidence),
    lineMovement: p.lineMovement
      ? `${p.lineMovement.deltaPercentagePoints > 0 ? "+" : ""}${p.lineMovement.deltaPercentagePoints.toFixed(1)} pts implied probability since open`
      : null,
    engineNote: p.reasoning,
    gameId: p.gameId,
  }
}

/** The engine's ranking, explained from its own numbers. Used whenever Claude is not. */
function engineChoice(
  candidates: EnginePrediction[],
  sport: string,
  betType: BetType,
  legs: number
): AISlipChoice | null {
  const picks = defaultSelection(candidates, betType, legs)
  if (!picks) return null
  const reasons: Record<string, string> = {}
  for (const p of picks) {
    reasons[p.id] =
      p.reasoning ??
      `The engine rates this ${(p.fairProbability * 100).toFixed(0)}% likely, a ${p.edgePercent.toFixed(1)}% edge over the best price.`
  }
  return {
    picks,
    title: `${sport} ${BET_TYPE_LABEL[betType]}`,
    description: "The pricing engine's top-ranked picks for this risk level.",
    analysis:
      "Chosen by the pricing engine from live sportsbook prices. The AI write-up is unavailable right now, so each leg shows the engine's own reasoning.",
    reasons,
    writtenBy: "engine",
  }
}

/**
 * Choose the legs for an AI betslip from the engine's real picks.
 *
 * Claude only picks labels from the supplied candidates and writes the words.
 * Prices, probabilities and the parlay maths are computed elsewhere from
 * engine data. If Claude is unavailable, refuses, or answers with a slip that
 * breaks a rule, the engine's own ranking is used instead. Returns null only
 * when no legal slip exists in the candidates.
 */
export async function chooseAISlip(params: {
  sport: string
  betType: BetType
  riskLevel: RiskLevel
  legs: number
  candidates: EnginePrediction[]
}): Promise<AISlipChoice | null> {
  const { sport, betType, riskLevel, legs } = params
  const candidates = params.candidates.slice(0, LABELS.length)
  if (candidates.length < legs) return null

  if (!isAnthropicKeyWellFormed(anthropicKey())) {
    console.error("AI picks: ANTHROPIC_API_KEY missing or malformed, using the engine's ranking")
    return engineChoice(candidates, sport, betType, legs)
  }

  const byLabel = new Map(candidates.map((c, i) => [LABELS[i], c]))
  const rules =
    betType === "parlay"
      ? "Every leg must come from a different game (different gameId)."
      : betType === "same-game-parlay"
        ? "Every leg must come from the SAME game (same gameId), each from a different market."
        : "Choose the single strongest bet."

  const prompt = `Build a ${BET_TYPE_LABEL[betType]} for ${sport}.
Risk level: ${RISK_LABEL[riskLevel]}.
Choose exactly ${legs} leg${legs === 1 ? "" : "s"}. ${rules}
Prefer legs with a higher edge and confidence unless the risk level says otherwise.

Candidates:
${JSON.stringify(
  candidates.map((c, i) => candidateLine(c, LABELS[i])),
  null,
  1
)}`

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      ...(SUPPORTS_FALLBACKS ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      thinking: { type: "adaptive" },
      // Choosing among supplied, pre-ranked bets: low effort is enough.
      output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    })

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      console.error(`AI picks: model stopped with ${response.stop_reason}, using the engine's ranking`)
      return engineChoice(candidates, sport, betType, legs)
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
    const picks = out.legs.map((l) => byLabel.get(l.label)).filter((p): p is EnginePrediction => !!p)
    const problem = picks.length === out.legs.length ? slipProblem(picks, betType, legs) : "chose an unknown label"
    if (problem) {
      console.error(`AI picks: model's slip ${problem}, using the engine's ranking`)
      return engineChoice(candidates, sport, betType, legs)
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
    return engineChoice(candidates, sport, betType, legs)
  }
}
