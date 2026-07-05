import { Injectable, Logger } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { PrismaService } from "../../common/prisma/prisma.service"
import { PredictionEngineService } from "./prediction-engine.service"
import { AIAnalystService } from "./ai-analyst.service"
import { OddsAggregatorService } from "../ingestion/odds-aggregator.service"
import type { BookMarket } from "./devig"
import type { EngineConfig } from "./prediction.types"

@Injectable()
export class PredictionsService {
  private readonly logger = new Logger(PredictionsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: PredictionEngineService,
    private readonly ai: AIAnalystService,
    private readonly aggregator: OddsAggregatorService
  ) {}

  /**
   * End-to-end ingestion + prediction for one sport:
   *  1. pull the multi-book slate
   *  2. upsert games + snapshot odds
   *  3. run the de-vig/EV engine
   *  4. AI-review the value bets
   *  5. persist non-"pass" predictions
   */
  async ingestAndPredict(sportKey: string, config: EngineConfig = {}): Promise<{ games: number; predictions: number }> {
    if (!this.aggregator.isConfigured()) {
      this.logger.warn("THE_ODDS_API_KEY not configured — skipping ingestion")
      return { games: 0, predictions: 0 }
    }

    const slate = await this.aggregator.fetchSlate(sportKey)
    let predictionCount = 0

    for (const gb of slate) {
      // Upsert game
      const game = await this.prisma.game.upsert({
        where: { canonicalId: gb.canonicalId },
        create: {
          canonicalId: gb.canonicalId,
          externalId: gb.externalId,
          sport: gb.sport,
          league: gb.league,
          homeTeam: gb.homeTeam,
          awayTeam: gb.awayTeam,
          commenceTime: gb.commenceTime,
        },
        update: { commenceTime: gb.commenceTime },
      })

      // Snapshot odds (mark closing if within 10 min of kickoff)
      const minsToStart = (gb.commenceTime.getTime() - Date.now()) / 60000
      const isClosing = minsToStart <= 10 && minsToStart > -5
      await this.prisma.oddsSnapshot.create({
        data: {
          gameId: game.id,
          provider: "the-odds-api",
          isClosing,
          markets: serializeBooks(gb.booksByMarket) as Prisma.InputJsonValue,
        },
      })

      // Only predict on games that haven't started.
      if (minsToStart <= 0) continue

      const valueBets = this.engine.analyzeGame(
        { id: game.id, canonicalId: gb.canonicalId, sport: gb.sport, homeTeam: gb.homeTeam, awayTeam: gb.awayTeam, commenceTime: gb.commenceTime },
        gb.booksByMarket,
        config
      )
      if (valueBets.length === 0) continue

      const reviewed = await this.ai.review(valueBets)
      const keep = reviewed.filter((r) => r.aiVerdict !== "pass")

      for (const p of keep) {
        // Avoid duplicate predictions for the same outcome on the same game.
        const existing = await this.prisma.prediction.findFirst({
          where: { gameId: game.id, outcomeId: p.outcomeId, status: "pending", userId: null },
        })
        if (existing) continue

        await this.prisma.prediction.create({
          data: {
            gameId: game.id,
            userId: null,
            marketType: p.marketType,
            outcomeId: p.outcomeId,
            selection: p.selection,
            outcomeName: p.outcomeName,
            point: p.point,
            fairProbability: p.fairProbability,
            offeredOdds: p.offeredDecimal,
            offeredBook: p.offeredBook,
            edgePercent: p.edgePercent,
            kellyStake: p.kellyStake,
            confidence: p.confidence,
            reasoning: p.reasoning,
          },
        })
        predictionCount++
      }
    }

    this.logger.log(`${sportKey}: ${slate.length} games, ${predictionCount} new predictions`)
    return { games: slate.length, predictions: predictionCount }
  }

  /**
   * Settle completed games: mark closing snapshot, grade predictions, compute CLV.
   */
  async settleSport(sportKey: string): Promise<{ settled: number }> {
    if (!this.aggregator.isConfigured()) return { settled: 0 }

    const scores = await this.aggregator.fetchScores(sportKey, 2)
    let settled = 0

    for (const s of scores) {
      if (s.homeScore == null || s.awayScore == null) continue

      const game = await this.prisma.game.findFirst({ where: { externalId: s.externalId } })
      if (!game) continue

      await this.prisma.game.update({
        where: { id: game.id },
        data: { status: "final", homeScore: s.homeScore, awayScore: s.awayScore },
      })

      const closing = await this.getClosingDecimals(game.id)

      const preds = await this.prisma.prediction.findMany({
        where: { gameId: game.id, status: "pending" },
      })

      for (const pred of preds) {
        const result = gradeOutcome(pred, s.homeScore, s.awayScore, game.homeTeam, game.awayTeam)
        const closingDecimal = closing.get(pred.outcomeId)
        const clv = closingDecimal ? round((pred.offeredOdds / closingDecimal - 1) * 100, 2) : null

        await this.prisma.prediction.update({
          where: { id: pred.id },
          data: { status: result, closingOdds: closingDecimal ?? null, clv, settledAt: new Date() },
        })
        settled++
      }
    }

    this.logger.log(`${sportKey}: settled ${settled} predictions`)
    return { settled }
  }

  /** House predictions currently pending, newest & most confident first. */
  async listPending(sport?: string, limit = 50) {
    return this.prisma.prediction.findMany({
      where: { userId: null, status: "pending", ...(sport ? { game: { sport } } : {}) },
      include: { game: true },
      orderBy: [{ confidence: "desc" }, { edgePercent: "desc" }],
      take: limit,
    })
  }

  /** Rolling performance of house predictions — the honest scoreboard. */
  async performance() {
    const settled = await this.prisma.prediction.findMany({
      where: { userId: null, status: { in: ["won", "lost", "push"] } },
      select: { status: true, clv: true, edgePercent: true },
    })
    const wins = settled.filter((p) => p.status === "won").length
    const losses = settled.filter((p) => p.status === "lost").length
    const pushes = settled.filter((p) => p.status === "push").length
    const decided = wins + losses
    const clvs = settled.map((p) => p.clv).filter((c): c is number => c != null)

    return {
      total: settled.length,
      wins,
      losses,
      pushes,
      winRate: decided > 0 ? round((wins / decided) * 100, 1) : 0,
      avgClv: clvs.length ? round(clvs.reduce((s, c) => s + c, 0) / clvs.length, 2) : 0,
      positiveClvRate: clvs.length ? round((clvs.filter((c) => c > 0).length / clvs.length) * 100, 1) : 0,
    }
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async getClosingDecimals(gameId: string): Promise<Map<string, number>> {
    const snap = await this.prisma.oddsSnapshot.findFirst({
      where: { gameId, isClosing: true },
      orderBy: { capturedAt: "desc" },
    })
    const target = snap ?? (await this.prisma.oddsSnapshot.findFirst({ where: { gameId }, orderBy: { capturedAt: "desc" } }))
    if (!target) return new Map()

    const map = new Map<string, number>()
    const books = target.markets as unknown as StoredBooks
    for (const marketBooks of Object.values(books)) {
      for (const bm of marketBooks) {
        for (const o of bm.line.outcomes) {
          // Keep the best (highest) closing price seen across books per outcome.
          const prev = map.get(o.id) ?? 0
          if (o.odds.decimal > prev) map.set(o.id, o.odds.decimal)
        }
      }
    }
    return map
  }
}

// ─── serialization + grading ──────────────────────────────────────────────────

/** Read-side shape of a stored OddsSnapshot.markets JSON blob. */
type StoredBooks = Record<
  string,
  { book: string; line: { outcomes: { id: string; odds: { decimal: number } }[] } }[]
>

/**
 * Convert the book map into a JSON-safe value for a Prisma `Json` column.
 * The round-trip strips Dates to ISO strings (Prisma's InputJsonValue forbids
 * Date), which is exactly what we want for storage.
 */
function serializeBooks(booksByMarket: Map<string, BookMarket[]>): object {
  const obj: Record<string, BookMarket[]> = {}
  for (const [k, v] of booksByMarket.entries()) obj[k] = v
  return JSON.parse(JSON.stringify(obj)) as object
}

/**
 * Grade a settled outcome. Returns "won" | "lost" | "push".
 */
export function gradeOutcome(
  pred: { marketType: string; outcomeName: string; point: number | null },
  homeScore: number,
  awayScore: number,
  homeTeam: string,
  awayTeam: string
): "won" | "lost" | "push" {
  const { marketType, outcomeName, point } = pred

  if (marketType === "moneyline") {
    if (homeScore === awayScore) return "push"
    const winner = homeScore > awayScore ? homeTeam : awayTeam
    return outcomeName === winner ? "won" : "lost"
  }

  if (marketType === "spread" && point != null) {
    const isHome = outcomeName === homeTeam
    const teamScore = isHome ? homeScore : awayScore
    const oppScore = isHome ? awayScore : homeScore
    const margin = teamScore + point - oppScore
    if (margin === 0) return "push"
    return margin > 0 ? "won" : "lost"
  }

  if (marketType === "total" && point != null) {
    const total = homeScore + awayScore
    if (total === point) return "push"
    if (outcomeName.toLowerCase() === "over") return total > point ? "won" : "lost"
    if (outcomeName.toLowerCase() === "under") return total < point ? "won" : "lost"
  }

  // Unknown market — treat as push so it doesn't distort win rate.
  return "push"
}

function round(x: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(x * f) / f
}
