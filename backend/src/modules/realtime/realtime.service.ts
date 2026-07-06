import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import Pusher from "pusher"
import type { ValueBet } from "../predictions/prediction.types"

/**
 * Real-time broadcast layer (Pusher Channels).
 *
 * Channel conventions:
 *   - "odds-{sport}"        public   — live odds movement for a sport
 *   - "predictions-{sport}" public   — new house +EV predictions
 *   - "tipster-{userId}"    public   — a tipster's newly published betslips
 *   - "user-{userId}"       private  — personal notifications
 *
 * Degrades gracefully: if Pusher isn't configured, every emit is a no-op so
 * the rest of the pipeline keeps working in dev.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name)
  private readonly pusher: Pusher | null

  constructor(config: ConfigService) {
    const appId = config.get<string>("PUSHER_APP_ID")
    const key = config.get<string>("PUSHER_KEY")
    const secret = config.get<string>("PUSHER_SECRET")
    const cluster = config.get<string>("PUSHER_CLUSTER") ?? "us2"

    if (appId && key && secret) {
      this.pusher = new Pusher({ appId, key, secret, cluster, useTLS: true })
      this.logger.log(`Pusher configured (cluster ${cluster})`)
    } else {
      this.pusher = null
      this.logger.warn("Pusher not configured — real-time broadcasts disabled")
    }
  }

  get enabled(): boolean {
    return this.pusher !== null
  }

  async oddsUpdate(sport: string, payload: {
    gameId: string
    matchup: string
    changes: { outcomeId: string; selection: string; decimal: number; direction: "up" | "down" }[]
  }) {
    await this.emit(`odds-${sport.toLowerCase()}`, "odds:update", payload)
  }

  async newPrediction(bet: ValueBet & { reasoning?: string; aiVerdict?: string }) {
    await this.emit(`predictions-${bet.sport.toLowerCase()}`, "prediction:new", {
      gameId: bet.gameId,
      matchup: bet.matchup,
      selection: bet.selection,
      edgePercent: bet.edgePercent,
      confidence: bet.confidence,
      offeredDecimal: bet.offeredDecimal,
      offeredBook: bet.offeredBook,
      commenceTime: bet.commenceTime,
      reasoning: bet.reasoning,
      verdict: bet.aiVerdict,
    })
  }

  async liveParlayUpdate(sport: string, payload: {
    betslipId: string
    title: string
    legCount: number
    totalOdds: number
    potentialReturn: number
    confidence: number
    legs: { selection: string; odds: number; edge: number }[]
  }) {
    await this.emit(`live-parlays-${sport.toLowerCase()}`, "parlay:update", payload)
  }

  async betslipPublished(tipsterId: string, payload: {
    betslipId: string
    tipsterUsername: string
    title: string
    sport: string
    legCount: number
    totalOdds: number
    confidence?: number | null
  }) {
    await this.emit(`tipster-${tipsterId}`, "betslip:published", payload)
  }

  async userNotification(userId: string, message: string, meta: Record<string, unknown> = {}) {
    await this.emit(`user-${userId}`, "notification", { message, ...meta })
  }

  // ─── internal ─────────────────────────────────────────────────────────────

  private async emit(channel: string, event: string, data: unknown) {
    if (!this.pusher) return
    try {
      await this.pusher.trigger(channel, event, data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`Pusher emit failed (${channel}/${event}): ${msg}`)
    }
  }
}
