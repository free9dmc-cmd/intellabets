import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import axios, { AxiosInstance } from "axios"
import { fromAmerican, normalizeMarketName } from "../utils/odds-normalizer"
import type { ISportsbookProvider } from "./provider.interface"
import type {
  Market,
  PropBet,
  ProviderHealth,
  PseudoBetRequest,
  PseudoBetResult,
  ListMarketsOptions,
  GetPropsOptions,
} from "../types/provider.types"
import { randomUUID } from "crypto"

/**
 * DraftKings adapter.
 * Uses The Odds API (theoddsapi.com) as an intermediary — it normalises
 * responses from DK and other books so we don't need a direct DK integration.
 * Swap `bookmakers` param to target other providers using the same adapter.
 */
@Injectable()
export class DraftKingsProvider implements ISportsbookProvider {
  readonly name = "draftkings"
  readonly displayName = "DraftKings"
  readonly supportsLive = true

  private readonly logger = new Logger(DraftKingsProvider.name)
  private readonly http: AxiosInstance

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      baseURL: "https://api.the-odds-api.com/v4",
      params: { apiKey: config.get("THE_ODDS_API_KEY") },
      timeout: 10_000,
    })
  }

  async listMarkets(options: ListMarketsOptions = {}): Promise<Market[]> {
    const { sport = "americanfootball_nfl", limit = 20 } = options

    // TODO: map our Sport enum → The Odds API sport key
    const sportKey = this.toOddsApiSport(sport as string)

    const { data } = await this.http.get(`/sports/${sportKey}/odds`, {
      params: {
        regions: "us",
        markets: "h2h,spreads,totals",
        bookmakers: "draftkings",
        oddsFormat: "american",
      },
    })

    return (data as OddsApiGame[]).slice(0, limit).map((g) => this.mapGame(g))
  }

  async getOdds(gameId: string): Promise<Market> {
    const sportKey = gameId.split(":")[0]
    const { data } = await this.http.get(`/sports/${sportKey}/odds`, {
      params: {
        regions: "us",
        markets: "h2h,spreads,totals",
        bookmakers: "draftkings",
        oddsFormat: "american",
        eventIds: gameId.split(":").slice(1).join(":"),
      },
    })

    const game = (data as OddsApiGame[])[0]
    if (!game) throw new Error(`Game ${gameId} not found at DraftKings`)
    return this.mapGame(game)
  }

  async getProps(_gameId: string, _options: GetPropsOptions = {}): Promise<PropBet[]> {
    // TODO: The Odds API player_props endpoint
    // https://the-odds-api.com/liveapi/guides/v4/#get-player-props
    this.logger.warn("DraftKings getProps not yet implemented — returning []")
    return []
  }

  async placePseudoBet(request: PseudoBetRequest): Promise<PseudoBetResult> {
    // Pseudo-bets are always local — no call to DraftKings
    const potentialReturn = parseFloat((request.stake * request.odds.decimal).toFixed(2))
    const settlement = new Date()
    settlement.setHours(settlement.getHours() + 6)

    return {
      success: true,
      betId: randomUUID(),
      reference: `DK-${Date.now().toString(36).toUpperCase()}`,
      placedAt: new Date(),
      estimatedSettlement: settlement,
      stake: request.stake,
      potentialReturn,
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now()
    try {
      await this.http.get("/sports", { params: { all: false } })
      return { provider: this.name, healthy: true, latencyMs: Date.now() - start, checkedAt: new Date() }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      return { provider: this.name, healthy: false, latencyMs: Date.now() - start, checkedAt: new Date(), error: msg }
    }
  }

  // ─── Private mappers ──────────────────────────────────────────────────────

  private mapGame(g: OddsApiGame): Market {
    const dk = g.bookmakers.find((b) => b.key === "draftkings")
    const markets = (dk?.markets ?? []).map((m) => ({
      id: `${g.id}:${m.key}`,
      type: normalizeMarketName(m.key) as Market["markets"][0]["type"],
      name: normalizeMarketName(m.key),
      rawName: m.key,
      outcomes: m.outcomes.map((o) => ({
        id: `${g.id}:${m.key}:${o.name}`,
        name: o.name,
        description: o.point != null ? `${o.name} ${o.point > 0 ? "+" : ""}${o.point}` : o.name,
        odds: fromAmerican(o.price),
        point: o.point,
        isMain: true,
      })),
      lastUpdated: new Date(m.last_update),
    }))

    return {
      id: g.id,
      canonicalId: `${g.sport_key}:${g.home_team}:${g.away_team}:${g.commence_time.slice(0, 10)}`,
      sport: this.fromOddsApiSport(g.sport_key),
      league: g.sport_title,
      homeTeam: g.home_team,
      awayTeam: g.away_team,
      commenceTime: new Date(g.commence_time),
      provider: this.name,
      isLive: false,
      markets,
    }
  }

  private toOddsApiSport(sport: string): string {
    const MAP: Record<string, string> = {
      NFL: "americanfootball_nfl",
      NCAAF: "americanfootball_ncaaf",
      NBA: "basketball_nba",
      NCAAB: "basketball_ncaab",
      MLB: "baseball_mlb",
      NHL: "icehockey_nhl",
      Soccer: "soccer_epl",
      UFC: "mma_mixed_martial_arts",
    }
    return MAP[sport] ?? "americanfootball_nfl"
  }

  private fromOddsApiSport(key: string): Market["sport"] {
    const MAP: Record<string, Market["sport"]> = {
      americanfootball_nfl: "NFL",
      americanfootball_ncaaf: "NCAAF",
      basketball_nba: "NBA",
      basketball_ncaab: "NCAAB",
      baseball_mlb: "MLB",
      icehockey_nhl: "NHL",
      soccer_epl: "Soccer",
      mma_mixed_martial_arts: "UFC",
    }
    return MAP[key] ?? "NFL"
  }
}

// ─── The Odds API response shapes (internal) ──────────────────────────────────

interface OddsApiOutcome { name: string; price: number; point?: number }
interface OddsApiMarket { key: string; last_update: string; outcomes: OddsApiOutcome[] }
interface OddsApiBookmaker { key: string; markets: OddsApiMarket[] }
interface OddsApiGame {
  id: string; sport_key: string; sport_title: string
  commence_time: string; home_team: string; away_team: string
  bookmakers: OddsApiBookmaker[]
}
