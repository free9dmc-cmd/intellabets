import { Logger, OnModuleDestroy } from "@nestjs/common"
import { EventEmitter } from "events"
import { CircuitBreaker } from "./circuit-breaker"
import type { ISportsbookProvider } from "../providers/provider.interface"
import type { Market, PropBet, ProviderHealth } from "../types/provider.types"

export type StreamEvent =
  | { type: "odds_update"; market: Market; changedOutcomeIds: string[] }
  | { type: "props_update"; props: PropBet[]; gameId: string }
  | { type: "game_start"; gameId: string; sport: string }
  | { type: "game_end"; gameId: string; result: Record<string, unknown> }
  | { type: "connection_lost"; provider: string; error: string }
  | { type: "connection_restored"; provider: string }

export type RateLimitConfig = {
  requestsPerSecond: number
  burstLimit: number
}

/**
 * Base class for streaming sportsbook providers.
 * Subclasses implement `connect()`, `disconnect()`, and `subscribe()`.
 * The base class handles:
 *   - Circuit breaker wrapping all outbound calls
 *   - Rate limiting
 *   - Reconnection with exponential back-off
 *   - Event emission for odds updates
 */
export abstract class StreamingProviderBase
  extends EventEmitter
  implements ISportsbookProvider, OnModuleDestroy
{
  abstract readonly name: string
  abstract readonly displayName: string
  abstract readonly supportsLive: boolean

  protected readonly logger: Logger
  protected readonly breaker: CircuitBreaker

  private reconnectAttempts = 0
  private readonly maxReconnectAttempts = 10
  private reconnectTimer?: NodeJS.Timeout

  // Token-bucket rate limiter state
  private tokens: number
  private lastRefill = Date.now()
  private readonly rateLimitConfig: RateLimitConfig

  constructor(
    loggerContext: string,
    breakerName: string,
    rateLimit: RateLimitConfig = { requestsPerSecond: 10, burstLimit: 30 }
  ) {
    super()
    this.logger = new Logger(loggerContext)
    this.rateLimitConfig = rateLimit
    this.tokens = rateLimit.burstLimit

    this.breaker = new CircuitBreaker(breakerName, {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30_000,
      onOpen: () => {
        this.logger.error(`Circuit OPEN for ${breakerName} — suspending calls`)
        this.emit("connection_lost", { provider: breakerName, error: "Circuit opened" })
      },
      onClose: () => {
        this.logger.log(`Circuit CLOSED for ${breakerName} — resuming`)
        this.emit("connection_restored", { provider: breakerName })
      },
    })
  }

  // ─── Abstract methods (implemented per provider) ─────────────────────────

  /** Open the WebSocket / SSE connection. */
  protected abstract connect(): Promise<void>

  /** Close the connection gracefully. */
  protected abstract disconnect(): Promise<void>

  /** Subscribe to live updates for a specific game. */
  abstract subscribeToGame(gameId: string): Promise<void>

  /** Unsubscribe from a game's live updates. */
  abstract unsubscribeFromGame(gameId: string): Promise<void>

  // ─── ISportsbookProvider (delegated to subclass) ─────────────────────────

  abstract listMarkets(options?: import("../types/provider.types").ListMarketsOptions): Promise<Market[]>
  abstract getOdds(gameId: string): Promise<Market>
  abstract getProps(gameId: string, options?: import("../types/provider.types").GetPropsOptions): Promise<PropBet[]>
  abstract placePseudoBet(request: import("../types/provider.types").PseudoBetRequest): Promise<import("../types/provider.types").PseudoBetResult>
  abstract healthCheck(): Promise<ProviderHealth>

  // ─── Connection lifecycle ─────────────────────────────────────────────────

  async start(): Promise<void> {
    this.reconnectAttempts = 0
    await this.connectWithBreaker()
  }

  async stop(): Promise<void> {
    clearTimeout(this.reconnectTimer)
    await this.disconnect()
    this.logger.log(`${this.displayName} stream stopped`)
  }

  onModuleDestroy() {
    void this.stop()
  }

  // ─── Reconnection with exponential back-off ───────────────────────────────

  protected scheduleReconnect(error: Error): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(`Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`)
      this.emit("connection_lost", { provider: this.name, error: error.message })
      return
    }

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 60_000)
    this.reconnectAttempts++
    this.logger.warn(
      `Reconnecting to ${this.displayName} in ${delay}ms (attempt ${this.reconnectAttempts})`
    )

    this.reconnectTimer = setTimeout(() => {
      void this.connectWithBreaker()
    }, delay)
  }

  private async connectWithBreaker(): Promise<void> {
    try {
      await this.breaker.execute(() => this.connect())
      this.reconnectAttempts = 0
      this.logger.log(`${this.displayName} stream connected`)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.logger.error(`Connection failed: ${error.message}`)
      this.scheduleReconnect(error)
    }
  }

  // ─── Rate limiter (token bucket) ─────────────────────────────────────────

  protected async acquireToken(): Promise<void> {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    this.tokens = Math.min(
      this.rateLimitConfig.burstLimit,
      this.tokens + elapsed * this.rateLimitConfig.requestsPerSecond
    )
    this.lastRefill = now

    if (this.tokens < 1) {
      const waitMs = Math.ceil((1 - this.tokens) / this.rateLimitConfig.requestsPerSecond * 1000)
      this.logger.debug(`Rate limit hit — waiting ${waitMs}ms`)
      await new Promise((r) => setTimeout(r, waitMs))
      this.tokens = 0
    } else {
      this.tokens -= 1
    }
  }

  // ─── Helper for emitting typed events ────────────────────────────────────

  protected emitStreamEvent(event: StreamEvent): void {
    this.emit(event.type, event)
    this.logger.debug(`Stream event: ${event.type}`)
  }

  circuitStats() {
    return this.breaker.stats()
  }
}
