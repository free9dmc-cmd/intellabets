import { Injectable, Logger, NotFoundException, ForbiddenException } from "@nestjs/common"
import { PrismaService } from "../../common/prisma/prisma.service"
import { AIAnalystService } from "../predictions/ai-analyst.service"
import { RealtimeService } from "../realtime/realtime.service"
import type { CreateBetslipDto, GenerateBetslipDto } from "./dto/betslip.dto"
import type { RankedPrediction } from "../predictions/prediction.types"

@Injectable()
export class BetslipsService {
  private readonly logger = new Logger(BetslipsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIAnalystService,
    private readonly realtime: RealtimeService
  ) {}

  /**
   * Auto-generate a betslip for a tipster from the current top house
   * predictions. Uses the engine's already-vetted +EV picks as legs and lets
   * Claude compose an honest title + analysis.
   */
  async generateFromPredictions(userId: string, dto: GenerateBetslipDto) {
    const legCount = dto.legCount ?? 3
    const minConfidence = dto.minConfidence ?? 55
    const stake = dto.stake ?? 100

    const preds = await this.prisma.prediction.findMany({
      where: {
        userId: null,
        status: "pending",
        confidence: { gte: minConfidence },
        game: { commenceTime: { gt: new Date() }, ...(dto.sport ? { sport: dto.sport } : {}) },
      },
      include: { game: true },
      orderBy: [{ confidence: "desc" }, { edgePercent: "desc" }],
      take: legCount,
    })

    if (preds.length === 0) {
      throw new NotFoundException("No qualifying predictions available right now — try a lower minConfidence or different sport")
    }

    // Parlay math: product of decimal odds.
    const totalOdds = preds.reduce((acc, p) => acc * p.offeredOdds, 1)
    const potentialReturn = round(stake * totalOdds, 2)
    const avgConfidence = round(preds.reduce((s, p) => s + p.confidence, 0) / preds.length, 1)
    const sport = dto.sport ?? preds[0].game.sport

    // Claude writes the title + narrative (honest, no hype).
    const ranked: RankedPrediction[] = preds.map((p) => ({
      gameId: p.gameId,
      canonicalId: p.game.canonicalId,
      sport: p.game.sport as RankedPrediction["sport"],
      matchup: `${p.game.awayTeam} @ ${p.game.homeTeam}`,
      commenceTime: p.game.commenceTime,
      marketType: p.marketType as RankedPrediction["marketType"],
      outcomeId: p.outcomeId,
      selection: p.selection,
      outcomeName: p.outcomeName,
      point: p.point ?? undefined,
      fairProbability: p.fairProbability,
      offeredDecimal: p.offeredOdds,
      offeredBook: p.offeredBook,
      edgePercent: p.edgePercent,
      kellyStake: p.kellyStake,
      confidence: p.confidence,
      numBooks: 0,
      reasoning: p.reasoning ?? undefined,
    }))
    const { title, analysis } = await this.ai.composeBetslip(ranked)

    const betslip = await this.prisma.betslip.create({
      data: {
        userId,
        title,
        description: analysis,
        sport,
        isAI: true,
        isPublic: dto.publish ?? false,
        totalOdds: round(totalOdds, 3),
        stake,
        potentialReturn,
        confidence: avgConfidence,
        legs: {
          create: preds.map((p) => ({
            game: `${p.game.awayTeam} @ ${p.game.homeTeam}`,
            selection: p.selection,
            odds: p.offeredOdds,
            marketType: p.marketType,
            sport: p.game.sport,
            reasoning: p.reasoning,
          })),
        },
      },
      include: { legs: true },
    })

    if (betslip.isPublic) await this.broadcastPublish(userId, betslip)
    return betslip
  }

  /** Manual betslip creation by a tipster. */
  async create(userId: string, dto: CreateBetslipDto) {
    const totalOdds = dto.legs.reduce((acc, l) => acc * l.odds, 1)
    const potentialReturn = round(dto.stake * totalOdds, 2)

    const betslip = await this.prisma.betslip.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        sport: dto.sport,
        isPublic: dto.isPublic ?? false,
        totalOdds: round(totalOdds, 3),
        stake: dto.stake,
        potentialReturn,
        legs: {
          create: dto.legs.map((l) => ({
            game: l.game,
            selection: l.selection,
            odds: l.odds,
            marketType: l.marketType,
            sport: l.sport,
            reasoning: l.reasoning,
          })),
        },
      },
      include: { legs: true },
    })

    if (betslip.isPublic) await this.broadcastPublish(userId, betslip)
    return betslip
  }

  /**
   * Build a LIVE in-game parlay from the freshest +EV legs on in-play games
   * and player props. Picks at most one leg per game to limit correlation,
   * then broadcasts the assembled parlay in real time. Re-running this as odds
   * shift produces an updated parlay — the "recompute mid-game" behaviour.
   */
  async buildLiveParlay(
    userId: string,
    opts: { sport?: string; legCount?: number; minConfidence?: number; stake?: number; publish?: boolean }
  ) {
    const legCount = opts.legCount ?? 3
    const minConfidence = opts.minConfidence ?? 0
    const stake = opts.stake ?? 50

    const preds = await this.prisma.prediction.findMany({
      where: {
        userId: null,
        status: "pending",
        confidence: { gte: minConfidence },
        AND: [
          { OR: [{ game: { status: "live" } }, { marketType: "prop" }] },
          ...(opts.sport ? [{ game: { sport: opts.sport } }] : []),
        ],
      },
      include: { game: true },
      orderBy: [{ confidence: "desc" }, { edgePercent: "desc" }],
    })

    // One leg per game to reduce correlation between legs.
    const seenGames = new Set<string>()
    const legs = preds.filter((p) => {
      if (seenGames.has(p.gameId)) return false
      seenGames.add(p.gameId)
      return true
    }).slice(0, legCount)

    if (legs.length < 2) {
      throw new NotFoundException("Not enough live/prop +EV legs available to build a parlay right now")
    }

    const totalOdds = legs.reduce((acc, p) => acc * p.offeredOdds, 1)
    const potentialReturn = round(stake * totalOdds, 2)
    const avgConfidence = round(legs.reduce((s, p) => s + p.confidence, 0) / legs.length, 1)
    const sport = opts.sport ?? legs[0].game.sport

    const betslip = await this.prisma.betslip.create({
      data: {
        userId,
        title: `🔴 LIVE ${sport} Parlay — ${legs.length} legs`,
        description: `Live in-game +EV parlay assembled from current odds. Recompute as the game moves.`,
        sport,
        isAI: true,
        isPublic: opts.publish ?? false,
        totalOdds: round(totalOdds, 3),
        stake,
        potentialReturn,
        confidence: avgConfidence,
        legs: {
          create: legs.map((p) => ({
            game: `${p.game.awayTeam} @ ${p.game.homeTeam}`,
            selection: p.selection,
            odds: p.offeredOdds,
            marketType: p.marketType,
            sport: p.game.sport,
            reasoning: p.reasoning,
          })),
        },
      },
      include: { legs: true },
    })

    // Push the live parlay to anyone watching this sport's live feed.
    await this.realtime.liveParlayUpdate(sport, {
      betslipId: betslip.id,
      title: betslip.title,
      legCount: legs.length,
      totalOdds: betslip.totalOdds,
      potentialReturn,
      confidence: avgConfidence,
      legs: legs.map((p) => ({ selection: p.selection, odds: p.offeredOdds, edge: p.edgePercent })),
    })

    if (betslip.isPublic) await this.broadcastPublish(userId, betslip)
    return betslip
  }

  async publish(userId: string, betslipId: string) {
    const slip = await this.prisma.betslip.findUnique({ where: { id: betslipId }, include: { legs: true } })
    if (!slip) throw new NotFoundException("Betslip not found")
    if (slip.userId !== userId) throw new ForbiddenException("Not your betslip")
    if (slip.isPublic) return slip

    const updated = await this.prisma.betslip.update({
      where: { id: betslipId },
      data: { isPublic: true },
      include: { legs: true },
    })
    await this.broadcastPublish(userId, updated)
    return updated
  }

  /**
   * Public marketplace feed. Only shows picks from tipsters the viewer is
   * allowed to see: a tipster's own + those they subscribe to. For the public
   * discovery feed we show public slips whose games haven't started.
   */
  async listPublic(sport?: string, limit = 30) {
    return this.prisma.betslip.findMany({
      where: { isPublic: true, ...(sport ? { sport } : {}) },
      include: {
        legs: true,
        user: { select: { id: true, username: true, name: true, image: true, isVerified: true, winRate: true, avgClv: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })
  }

  async getOne(id: string) {
    const slip = await this.prisma.betslip.findUnique({
      where: { id },
      include: {
        legs: true,
        user: { select: { id: true, username: true, name: true, image: true, isVerified: true, winRate: true, avgClv: true } },
      },
    })
    if (!slip) throw new NotFoundException("Betslip not found")
    return slip
  }

  async listByUser(userId: string) {
    return this.prisma.betslip.findMany({
      where: { userId },
      include: { legs: true },
      orderBy: { createdAt: "desc" },
    })
  }

  // ─── internal ─────────────────────────────────────────────────────────────

  private async broadcastPublish(
    userId: string,
    slip: { id: string; title: string; sport: string; totalOdds: number; confidence: number | null; legs: unknown[] }
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } })
    await this.realtime.betslipPublished(userId, {
      betslipId: slip.id,
      tipsterUsername: user?.username ?? "tipster",
      title: slip.title,
      sport: slip.sport,
      legCount: slip.legs.length,
      totalOdds: slip.totalOdds,
      confidence: slip.confidence,
    })
  }
}

function round(x: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(x * f) / f
}
