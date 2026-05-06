import type {
  Market,
  PropBet,
  PseudoBetRequest,
  PseudoBetResult,
  ProviderHealth,
  ListMarketsOptions,
  GetPropsOptions,
} from "../types/provider.types"

export interface ISportsbookProvider {
  /** Unique machine-readable key, e.g. "draftkings" */
  readonly name: string

  /** Human-readable display name, e.g. "DraftKings" */
  readonly displayName: string

  /** True when this provider supports live/in-game odds */
  readonly supportsLive: boolean

  /**
   * Return a list of upcoming (or live) markets.
   * Implementations must normalise team names, odds, and timestamps.
   */
  listMarkets(options?: ListMarketsOptions): Promise<Market[]>

  /**
   * Return all market lines for a single game by its provider-scoped ID.
   */
  getOdds(gameId: string): Promise<Market>

  /**
   * Return player prop bets for a game, optionally filtered by player or category.
   */
  getProps(gameId: string, options?: GetPropsOptions): Promise<PropBet[]>

  /**
   * Record a pseudo-bet for tracking purposes.
   * No real money is placed — this logs the user's intended bet and
   * tracks settlement against real results.
   */
  placePseudoBet(request: PseudoBetRequest): Promise<PseudoBetResult>

  /**
   * Ping the provider to verify it is reachable and responding correctly.
   */
  healthCheck(): Promise<ProviderHealth>
}
