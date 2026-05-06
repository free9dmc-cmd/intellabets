import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common"
import type { ISportsbookProvider } from "../providers/provider.interface"
import type { Market, PropBet, ListMarketsOptions, GetPropsOptions } from "../types/provider.types"

export interface FallThroughConfig {
  /** Latency threshold in ms — if primary exceeds this, fall through */
  latencyThresholdMs?: number
  /** Log provider switches */
  verbose?: boolean
}

/**
 * ProviderConnector wraps a primary and optional fallback ISportsbookProvider.
 *
 * On each call it:
 *   1. Attempts the primary provider
 *   2. If the primary throws (circuit open / network error / latency spike),
 *      logs the error and transparently falls through to the secondary
 *   3. If the secondary also fails, surfaces the error
 *
 * This means callers never need to know which provider is active.
 */
@Injectable()
export class ProviderConnector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProviderConnector.name)
  private readonly latencyThresholdMs: number
  private activeFallback = false

  constructor(
    private readonly primary: ISportsbookProvider,
    private readonly fallback: ISportsbookProvider,
    config: FallThroughConfig = {}
  ) {
    this.latencyThresholdMs = config.latencyThresholdMs ?? 3_000
  }

  async onModuleInit() {
    const health = await this.primary.healthCheck()
    if (!health.healthy) {
      this.logger.warn(`Primary provider (${this.primary.name}) unhealthy at startup — using fallback`)
      this.activeFallback = true
    }
  }

  async onModuleDestroy() {
    // Streaming providers implement OnModuleDestroy themselves
  }

  // ─── Public API (same as ISportsbookProvider) ─────────────────────────────

  async listMarkets(options?: ListMarketsOptions): Promise<Market[]> {
    return this.withFallThrough("listMarkets", () => this.primary.listMarkets(options), () => this.fallback.listMarkets(options))
  }

  async getOdds(gameId: string): Promise<Market> {
    return this.withFallThrough("getOdds", () => this.primary.getOdds(gameId), () => this.fallback.getOdds(gameId))
  }

  async getProps(gameId: string, options?: GetPropsOptions): Promise<PropBet[]> {
    return this.withFallThrough("getProps", () => this.primary.getProps(gameId, options), () => this.fallback.getProps(gameId, options))
  }

  /** Which provider is currently serving requests. */
  activeProviderName(): string {
    return this.activeFallback ? this.fallback.name : this.primary.name
  }

  async healthCheckAll() {
    const [primaryHealth, fallbackHealth] = await Promise.allSettled([
      this.primary.healthCheck(),
      this.fallback.healthCheck(),
    ])
    return {
      primary: primaryHealth.status === "fulfilled" ? primaryHealth.value : { provider: this.primary.name, healthy: false },
      fallback: fallbackHealth.status === "fulfilled" ? fallbackHealth.value : { provider: this.fallback.name, healthy: false },
      usingFallback: this.activeFallback,
    }
  }

  // ─── Core fall-through logic ──────────────────────────────────────────────

  private async withFallThrough<T>(
    operation: string,
    primaryFn: () => Promise<T>,
    fallbackFn: () => Promise<T>
  ): Promise<T> {
    if (!this.activeFallback) {
      const start = Date.now()
      try {
        const result = await Promise.race([
          primaryFn(),
          this.latencyTimeout<T>(this.latencyThresholdMs, operation),
        ])
        // Primary recovered — log if we were in fallback mode
        const elapsed = Date.now() - start
        this.logger.debug(`${operation} via ${this.primary.name} in ${elapsed}ms`)
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.error(`${this.primary.name}.${operation} failed: ${msg} — falling through to ${this.fallback.name}`)
        this.activeFallback = true
        // Schedule re-evaluation of primary after 60s
        setTimeout(() => this.recheckPrimary(), 60_000)
      }
    }

    // Fallback path
    try {
      const result = await fallbackFn()
      this.logger.debug(`${operation} served by fallback: ${this.fallback.name}`)
      return result
    } catch (fallbackErr) {
      const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
      throw new Error(
        `Both providers failed for ${operation}. Primary error logged above. Fallback: ${msg}`
      )
    }
  }

  private latencyTimeout<T>(ms: number, operation: string): Promise<T> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} latency exceeded ${ms}ms threshold`)), ms)
    )
  }

  private async recheckPrimary(): Promise<void> {
    try {
      const health = await this.primary.healthCheck()
      if (health.healthy) {
        this.logger.log(`Primary provider (${this.primary.name}) recovered — switching back`)
        this.activeFallback = false
      } else {
        this.logger.warn(`Primary still unhealthy — checking again in 60s`)
        setTimeout(() => this.recheckPrimary(), 60_000)
      }
    } catch {
      setTimeout(() => this.recheckPrimary(), 60_000)
    }
  }
}
