import { Logger } from "@nestjs/common"

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN"

export interface CircuitBreakerOptions {
  failureThreshold?: number   // failures before opening (default 5)
  successThreshold?: number   // successes in HALF_OPEN before closing (default 2)
  timeout?: number            // ms to wait before attempting HALF_OPEN (default 30s)
  onOpen?: () => void
  onClose?: () => void
  onHalfOpen?: () => void
}

/**
 * Classic three-state circuit breaker.
 *
 * CLOSED  → normal operation; tracks failures
 * OPEN    → rejects calls immediately; waits `timeout` before half-open
 * HALF_OPEN → lets one probe through; closes on success, opens on failure
 */
export class CircuitBreaker {
  private state: CircuitState = "CLOSED"
  private failureCount = 0
  private successCount = 0
  private nextAttemptAt = 0
  private readonly logger: Logger

  private readonly failureThreshold: number
  private readonly successThreshold: number
  private readonly timeout: number
  private readonly opts: CircuitBreakerOptions

  constructor(
    private readonly name: string,
    opts: CircuitBreakerOptions = {}
  ) {
    this.failureThreshold = opts.failureThreshold ?? 5
    this.successThreshold = opts.successThreshold ?? 2
    this.timeout = opts.timeout ?? 30_000
    this.opts = opts
    this.logger = new Logger(`CircuitBreaker:${name}`)
  }

  get currentState(): CircuitState {
    return this.state
  }

  isOpen(): boolean {
    if (this.state === "OPEN") {
      if (Date.now() >= this.nextAttemptAt) {
        this.transitionTo("HALF_OPEN")
        return false
      }
      return true
    }
    return false
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error(
        `Circuit breaker "${this.name}" is OPEN. ` +
        `Next attempt in ${Math.ceil((this.nextAttemptAt - Date.now()) / 1000)}s`
      )
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (err) {
      this.onFailure(err)
      throw err
    }
  }

  private onSuccess(): void {
    this.failureCount = 0
    if (this.state === "HALF_OPEN") {
      this.successCount++
      if (this.successCount >= this.successThreshold) {
        this.transitionTo("CLOSED")
      }
    }
  }

  private onFailure(err: unknown): void {
    this.successCount = 0
    this.failureCount++
    const msg = err instanceof Error ? err.message : String(err)
    this.logger.warn(`Failure ${this.failureCount}/${this.failureThreshold}: ${msg}`)

    if (this.state === "HALF_OPEN" || this.failureCount >= this.failureThreshold) {
      this.transitionTo("OPEN")
    }
  }

  private transitionTo(next: CircuitState): void {
    if (this.state === next) return
    this.logger.warn(`State transition: ${this.state} → ${next}`)
    this.state = next

    if (next === "OPEN") {
      this.nextAttemptAt = Date.now() + this.timeout
      this.opts.onOpen?.()
    } else if (next === "CLOSED") {
      this.failureCount = 0
      this.successCount = 0
      this.opts.onClose?.()
    } else {
      this.opts.onHalfOpen?.()
    }
  }

  reset(): void {
    this.transitionTo("CLOSED")
    this.failureCount = 0
    this.successCount = 0
  }

  stats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttemptAt: this.state === "OPEN" ? new Date(this.nextAttemptAt) : null,
    }
  }
}
