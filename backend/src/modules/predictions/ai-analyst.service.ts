import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import Anthropic from "@anthropic-ai/sdk"
import type { ValueBet, RankedPrediction } from "./prediction.types"

/**
 * The AI analyst layer.
 *
 * Critical design principle: the LLM does NOT generate probabilities. The
 * de-vigged market consensus is already the sharpest probability estimate we
 * can get, and asking an LLM to "predict winners" would be strictly worse.
 *
 * Instead Claude acts as a risk filter and context layer. Given a set of
 * mathematically +EV bets, it:
 *   - flags likely stale-line traps (injuries, lineup news, weather the market
 *     may have already priced that make the "edge" illusory)
 *   - assigns a qualitative verdict: strong | lean | pass
 *   - writes a concise, honest rationale for each surviving pick
 *
 * This turns raw +EV signals into a curated, explainable slate.
 */
@Injectable()
export class AIAnalystService {
  private readonly logger = new Logger(AIAnalystService.name)
  private readonly client: Anthropic | null
  private readonly model: string

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>("ANTHROPIC_API_KEY")
    this.model = config.get<string>("AI_MODEL", "claude-sonnet-4-6")
    this.client = apiKey ? new Anthropic({ apiKey }) : null
    if (!this.client) {
      this.logger.warn("ANTHROPIC_API_KEY not set — AI analyst will pass bets through unfiltered")
    }
  }

  /**
   * Review a ranked list of value bets and return them enriched with an AI
   * verdict + reasoning. Bets the model judges as traps are marked "pass".
   */
  async review(bets: ValueBet[]): Promise<RankedPrediction[]> {
    if (bets.length === 0) return []
    if (!this.client) {
      // No key: pass through with neutral verdict so the pipeline still works.
      return bets.map((b) => ({ ...b, aiVerdict: "lean" as const }))
    }

    const top = bets.slice(0, 20) // cap tokens/cost; engine already ranked them

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            // Cache the static instructions — this system block is identical on
            // every call, so we only pay full input price for it once per 5 min.
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: `Here are ${top.length} mathematically +EV bets found by the engine. ` +
              `Review each and return your JSON verdict.\n\n` +
              JSON.stringify(top.map(toModelInput), null, 2),
          },
        ],
      })

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")

      const verdicts = this.parseVerdicts(text)
      return this.merge(top, verdicts)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`AI review failed: ${msg} — passing bets through unfiltered`)
      return top.map((b) => ({ ...b, aiVerdict: "lean" as const }))
    }
  }

  /**
   * Compose a human-facing betslip title + narrative for a curated set of picks.
   */
  async composeBetslip(picks: RankedPrediction[]): Promise<{ title: string; analysis: string }> {
    if (!this.client || picks.length === 0) {
      return {
        title: picks[0] ? `${picks[0].sport} Value Slate` : "Value Slate",
        analysis: "Curated from de-vigged multi-book consensus. Bets shown offer positive expected value at the listed price.",
      }
    }

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content:
              `Write a short betslip title (max 8 words) and a 2-3 sentence analysis for these curated +EV picks. ` +
              `Be honest and measured — no hype, no guarantees. Return JSON {"title": "...", "analysis": "..."}.\n\n` +
              JSON.stringify(picks.map((p) => ({ selection: p.selection, edge: p.edgePercent, confidence: p.confidence, note: p.reasoning }))),
          },
        ],
      })
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
      const json = extractJson(text)
      return {
        title: json?.title ?? `${picks[0].sport} Value Slate`,
        analysis: json?.analysis ?? "Curated +EV picks from multi-book consensus.",
      }
    } catch {
      return { title: `${picks[0].sport} Value Slate`, analysis: "Curated +EV picks from multi-book consensus." }
    }
  }

  // ─── parsing ────────────────────────────────────────────────────────────────

  private parseVerdicts(text: string): ModelVerdict[] {
    const json = extractJson(text)
    if (!json) return []
    const arr = Array.isArray(json) ? json : json.verdicts
    if (!Array.isArray(arr)) return []
    return arr.filter((v) => typeof v?.outcomeId === "string")
  }

  private merge(bets: ValueBet[], verdicts: ModelVerdict[]): RankedPrediction[] {
    const byId = new Map(verdicts.map((v) => [v.outcomeId, v]))
    return bets.map((b) => {
      const v = byId.get(b.outcomeId)
      return {
        ...b,
        aiVerdict: v?.verdict ?? "lean",
        reasoning: v?.reasoning,
      }
    })
  }
}

// ─── prompt + shapes ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the risk-analyst layer of a sports betting recommendation engine.

The engine has already computed a de-vigged, multi-book CONSENSUS fair probability for each bet and found bets where the best available price beats that consensus (positive expected value). The math is sound. Your job is NOT to re-estimate probabilities — the market consensus is sharper than any guess you could make.

Your job is to catch cases where the mathematical edge is likely ILLUSORY or a TRAP:
- A "value" price that exists only because one book is slow to update after injury/lineup/weather news.
- Outliers where one book disagreeing with the field creates fake edge (stale line, not real value).
- Situations with obvious public-vs-sharp dynamics that make the price unreliable.

For each bet, return a verdict:
- "strong": clean edge, books broadly agree, no red flags — bet with confidence.
- "lean": plausible edge but some uncertainty — smaller stake warranted.
- "pass": likely a stale-line trap or the edge is probably not real — skip it.

Respond ONLY with JSON in this exact shape:
{"verdicts": [{"outcomeId": "...", "verdict": "strong|lean|pass", "reasoning": "one honest sentence"}]}

Be measured and honest. Never promise wins. Most real edges are small.`

interface ModelVerdict {
  outcomeId: string
  verdict: "strong" | "lean" | "pass"
  reasoning?: string
}

function toModelInput(b: ValueBet) {
  return {
    outcomeId: b.outcomeId,
    matchup: b.matchup,
    sport: b.sport,
    selection: b.selection,
    marketType: b.marketType,
    fairProbability: b.fairProbability,
    offeredDecimal: b.offeredDecimal,
    offeredBook: b.offeredBook,
    edgePercent: b.edgePercent,
    numBooks: b.numBooks,
    bookConfidence: b.confidence,
  }
}

function extractJson(text: string): any {
  // Tolerate code fences or prose around the JSON object/array.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.search(/[[{]/)
  if (start === -1) return null
  try {
    return JSON.parse(candidate.slice(start))
  } catch {
    return null
  }
}
