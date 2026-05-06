import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import axios, { AxiosInstance } from "axios"
import WebSocket from "ws"
import { randomUUID } from "crypto"
import { StreamingProviderBase } from "../streaming/streaming-provider.base"
import { fromDecimal, fromAmerican, normalizeMarketName } from "../utils/odds-normalizer"
import type {
  Market,
  MarketLine,
  Outcome,
  PropBet,
  ProviderHealth,
  PseudoBetRequest,
  PseudoBetResult,
  ListMarketsOptions,
  GetPropsOptions,
  Sport,
} from "../types/provider.types"

// ─── Raw Sportradar API shapes ────────────────────────────────────────────────

interface SRSport { id: string; name: string; alias: string }
interface SRTeam { id: string; name: string; alias: string }
interface SRVenue { id: string; name: string; city: string; country: string }

interface SROutcome {
  id: string
  type: string           // "competitor1" | "competitor2" | "over" | "under" | "home" | "away"
  odds: number           // decimal format
  handicap?: number
  open_odds?: number
}

interface SRMarket {
  id: string
  name: string           // "Home/Away", "Asian Handicap", "Total"
  status: "active" | "suspended" | "settled"
  outcomes: SROutcome[]
  last_updated: string   // ISO-8601
}

interface SRBookmaker {
  id: string
  name: string
  markets: SRMarket[]
}

interface SRSportEvent {
  id: string             // "sr:match:12345"
  scheduled: string      // ISO-8601
  status: string         // "not_started" | "live" | "closed"
  sport: SRSport
  home_competitor: SRTeam
  away_competitor: SRTeam
  venue?: SRVenue
  bookmakers: SRBookmaker[]
}

interface SRPlayerProp {
  player: { id: string; name: string; team_id: string }
  market_name: string
  line: number
  over_odds: number
  under_odds: number
}

// WebSocket push message from Sportradar Live Odds feed
interface SROddsChangeMessage {
  type: "OddsChange"
  event_id: string
  bookmaker_id: string
  markets: SRMarket[]
  timestamp: string
}

// ─── Provider ─────────────────────────────────────────────────────────────────

@Injectable()
export class SportradarProvider extends StreamingProviderBase {
  readonly name = "sportradar"
  readonly displayName = "Sportradar"
  readonly supportsLive = true

  private ws: WebSocket | null = null
  private readonly http: AxiosInstance
  private readonly apiKey: string
  private readonly TARGET_BOOKMAKER = "draftkings" // normalise to one book for consistency

  private readonly SPORT_MAP: Record<string, Sport> = {
    "sr:sport:1": "Soccer",
    "sr:sport:2": "NHL",
    "sr:sport:3": "Tennis",
    "sr:sport:4": "Golf",
    "sr:sport:5": "NBA",
    "sr:sport:6": "NFL",
    "sr:sport:23": "MLB",
    "sr:sport:117": "UFC",
  }

  constructor(private readonly config: ConfigService) {
    super("SportradarProvider", "sportradar", {
      requestsPerSecond: 5,    // Sportradar free tier: 5 req/s
      burstLimit: 10,
    })
    this.apiKey = config.get<string>("SPORTRADAR_API_KEY", "")
    this.http = axios.create({
      baseURL: "https://api.sportradar.com",
      timeout: 15_000,
    })
  }

  // ─── REST endpoints ────────────────────────────────────────────────────────

  async listMarkets(options: ListMarketsOptions = {}): Promise<Market[]> {
    const { limit = 20 } = options
    await this.acquireToken()

    const { data } = await this.breaker.execute(() =>
      this.http.get<{ sport_events: SRSportEvent[] }>(
        `/oddscomparison/trial/v2/en/schedules/live/odds.json`,
        { params: { api_key: this.apiKey } }
      )
    )

    return data.sport_events
      .filter((e) => (options.sport ? this.mapSport(e.sport.id) === options.sport : true))
      .slice(0, limit)
      .map((e) => this.mapSportEvent(e))
  }

  async getOdds(gameId: string): Promise<Market> {
    await this.acquireToken()

    const { data } = await this.breaker.execute(() =>
      this.http.get<{ sport_event: SRSportEvent }>(
        `/oddscomparison/trial/v2/en/sport_events/${gameId}/odds.json`,
        { params: { api_key: this.apiKey } }
      )
    )

    return this.mapSportEvent(data.sport_event)
  }

  async getProps(gameId: string, options: GetPropsOptions = {}): Promise<PropBet[]> {
    await this.acquireToken()

    const { data } = await this.breaker.execute(() =>
      this.http.get<{ player_props: SRPlayerProp[] }>(
        `/oddscomparison/trial/v2/en/sport_events/${gameId}/player_props.json`,
        { params: { api_key: this.apiKey } }
      )
    )

    let props = data.player_props ?? []
    if (options.playerId) {
      props = props.filter((p) => p.player.id === options.playerId)
    }

    return props.map((p) => this.mapPlayerProp(gameId, p))
  }

  async placePseudoBet(request: PseudoBetRequest): Promise<PseudoBetResult> {
    const potentialReturn = parseFloat((request.stake * request.odds.decimal).toFixed(2))
    const settlement = new Date()
    settlement.setHours(settlement.getHours() + 4)

    return {
      success: true,
      betId: randomUUID(),
      reference: `SR-${Date.now().toString(36).toUpperCase()}`,
      placedAt: new Date(),
      estimatedSettlement: settlement,
      stake: request.stake,
      potentialReturn,
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now()
    try {
      await this.http.get("/oddscomparison/trial/v2/en/sports.json", {
        params: { api_key: this.apiKey },
        timeout: 5_000,
      })
      return {
        provider: this.name,
        healthy: true,
        latencyMs: Date.now() - start,
        checkedAt: new Date(),
      }
    } catch (err) {
      return {
        provider: this.name,
        healthy: false,
        latencyMs: Date.now() - start,
        checkedAt: new Date(),
        error: err instanceof Error ? err.message : "Unknown error",
      }
    }
  }

  // ─── WebSocket streaming ───────────────────────────────────────────────────

  protected async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `wss://ws.sportradar.com/v1/odds?api_key=${this.apiKey}`
      this.ws = new WebSocket(url)

      const timeout = setTimeout(() => {
        reject(new Error("WebSocket connection timed out after 10s"))
        this.ws?.terminate()
      }, 10_000)

      this.ws.once("open", () => {
        clearTimeout(timeout)
        this.logger.log("Sportradar WebSocket connected")
        resolve()
      })

      this.ws.on("message", (raw) => this.handleMessage(raw.toString()))

      this.ws.on("error", (err) => {
        clearTimeout(timeout)
        this.logger.error(`WebSocket error: ${err.message}`)
        reject(err)
      })

      this.ws.on("close", (code, reason) => {
        this.logger.warn(`WebSocket closed: ${code} — ${reason}`)
        this.scheduleReconnect(new Error(`Closed with code ${code}`))
      })

      // Sportradar requires a heartbeat every 25s
      const heartbeat = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "ping" }))
        } else {
          clearInterval(heartbeat)
        }
      }, 25_000)
    })
  }

  protected async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.removeAllListeners()
      this.ws.close(1000, "Graceful shutdown")
      this.ws = null
    }
  }

  async subscribeToGame(gameId: string): Promise<void> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected — call start() first")
    }
    this.ws.send(JSON.stringify({ type: "subscribe", event_id: gameId }))
    this.logger.debug(`Subscribed to live odds for game: ${gameId}`)
  }

  async unsubscribeFromGame(gameId: string): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "unsubscribe", event_id: gameId }))
    }
  }

  // ─── Internal message handler ─────────────────────────────────────────────

  private handleMessage(raw: string): void {
    let msg: SROddsChangeMessage
    try {
      msg = JSON.parse(raw)
    } catch {
      this.logger.warn("Received unparseable WS message")
      return
    }

    if (msg.type !== "OddsChange") return

    const changedIds: string[] = []
    const marketLines: MarketLine[] = msg.markets.map((m) => {
      const outcomes = m.outcomes.map((o) => {
        const outcome = this.mapOutcome(msg.event_id, m, o)
        changedIds.push(outcome.id)
        return outcome
      })
      return {
        id: `${msg.event_id}:${m.id}`,
        type: normalizeMarketName(m.name) as MarketLine["type"],
        name: normalizeMarketName(m.name),
        rawName: m.name,
        outcomes,
        lastUpdated: new Date(msg.timestamp),
      }
    })

    // We don't have full game context in a delta push — emit a partial market
    // Consumers merge this into their cached full market
    const partialMarket: Market = {
      id: msg.event_id,
      canonicalId: msg.event_id,
      sport: "NFL",          // resolved downstream from cache
      league: "",
      homeTeam: "",
      awayTeam: "",
      commenceTime: new Date(),
      provider: this.name,
      isLive: true,
      markets: marketLines,
    }

    this.emitStreamEvent({ type: "odds_update", market: partialMarket, changedOutcomeIds: changedIds })
  }

  // ─── Data mappers ──────────────────────────────────────────────────────────

  private mapSportEvent(e: SRSportEvent): Market {
    const book = e.bookmakers.find((b) => b.name.toLowerCase().includes(this.TARGET_BOOKMAKER))
      ?? e.bookmakers[0]

    const markets: MarketLine[] = (book?.markets ?? [])
      .filter((m) => m.status === "active")
      .map((m) => ({
        id: `${e.id}:${m.id}`,
        type: normalizeMarketName(m.name) as MarketLine["type"],
        name: normalizeMarketName(m.name),
        rawName: m.name,
        outcomes: m.outcomes.map((o) => this.mapOutcome(e.id, m, o)),
        lastUpdated: new Date(m.last_updated),
      }))

    const sport = this.mapSport(e.sport.id)

    return {
      id: e.id,
      canonicalId: `${sport}:${e.home_competitor.name}:${e.away_competitor.name}:${e.scheduled.slice(0, 10)}`,
      sport,
      league: e.sport.name,
      homeTeam: e.home_competitor.name,
      awayTeam: e.away_competitor.name,
      commenceTime: new Date(e.scheduled),
      provider: this.name,
      isLive: e.status === "live",
      markets,
    }
  }

  private mapOutcome(eventId: string, market: SRMarket, o: SROutcome): Outcome {
    const odds = fromDecimal(o.odds)
    const name = this.normalizeOutcomeName(o.type)
    const description = o.handicap != null
      ? `${name} ${o.handicap > 0 ? "+" : ""}${o.handicap}`
      : name

    return {
      id: `${eventId}:${market.id}:${o.id}`,
      name,
      description,
      odds,
      point: o.handicap,
      isMain: true,
    }
  }

  private mapPlayerProp(gameId: string, p: SRPlayerProp): PropBet {
    const id = `${gameId}:prop:${p.player.id}:${p.market_name.replace(/\s/g, "_")}`
    return {
      id,
      gameId,
      playerId: p.player.id,
      playerName: p.player.name,
      propType: p.market_name,
      category: "scoring",   // TODO: map from market_name
      line: p.line,
      outcomes: [
        {
          id: `${id}:over`,
          name: "Over",
          description: `Over ${p.line} ${p.market_name}`,
          odds: fromDecimal(p.over_odds),
          point: p.line,
          isMain: true,
        },
        {
          id: `${id}:under`,
          name: "Under",
          description: `Under ${p.line} ${p.market_name}`,
          odds: fromDecimal(p.under_odds),
          point: p.line,
          isMain: true,
        },
      ],
      provider: this.name,
      lastUpdated: new Date(),
    }
  }

  private normalizeOutcomeName(type: string): string {
    const MAP: Record<string, string> = {
      competitor1: "Home",
      competitor2: "Away",
      home: "Home",
      away: "Away",
      over: "Over",
      under: "Under",
      draw: "Draw",
    }
    return MAP[type] ?? type
  }

  private mapSport(srSportId: string): Sport {
    return this.SPORT_MAP[srSportId] ?? "NFL"
  }
}
