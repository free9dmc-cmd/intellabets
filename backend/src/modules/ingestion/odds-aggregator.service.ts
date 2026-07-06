import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import axios, { AxiosInstance } from "axios"
import { fromAmerican, normalizeMarketName } from "../sportsbook/utils/odds-normalizer"
import type { MarketLine, Sport } from "../sportsbook/types/provider.types"
import type { BookMarket } from "../predictions/devig"

/**
 * A single game with its markets grouped by market type, each carrying every
 * book's line. This is the exact shape the prediction engine consumes.
 */
export interface GameBooks {
  externalId: string
  canonicalId: string
  sport: Sport
  league: string
  homeTeam: string
  awayTeam: string
  commenceTime: Date
  /** marketType -> one BookMarket per bookmaker */
  booksByMarket: Map<string, BookMarket[]>
}

/**
 * Multi-book odds source.
 *
 * Uses The Odds API (theoddsapi.com), whose native response returns EVERY
 * bookmaker for a game in a single call — exactly what multi-book consensus
 * needs. Sportradar's stream is layered on top for live updates elsewhere.
 */
@Injectable()
export class OddsAggregatorService {
  private readonly logger = new Logger(OddsAggregatorService.name)
  private readonly http: AxiosInstance
  private readonly apiKey: string

  private readonly SPORT_KEYS: Record<string, Sport> = {
    americanfootball_nfl: "NFL",
    americanfootball_ncaaf: "NCAAF",
    basketball_nba: "NBA",
    basketball_ncaab: "NCAAB",
    baseball_mlb: "MLB",
    icehockey_nhl: "NHL",
    soccer_epl: "Soccer",
    mma_mixed_martial_arts: "UFC",
  }

  constructor(private readonly config: ConfigService) {
    this.apiKey = config.get<string>("THE_ODDS_API_KEY", "")
    this.http = axios.create({
      baseURL: "https://api.the-odds-api.com/v4",
      timeout: 12_000,
      params: { apiKey: this.apiKey },
    })
  }

  isConfigured(): boolean {
    return this.apiKey.length > 10
  }

  /**
   * Fetch the multi-book slate for a sport.
   * @param sportKey The Odds API sport key, e.g. "americanfootball_nfl"
   */
  async fetchSlate(sportKey: string): Promise<GameBooks[]> {
    const { data } = await this.http.get<OddsApiGame[]>(`/sports/${sportKey}/odds`, {
      params: {
        regions: "us",
        markets: "h2h,spreads,totals",
        oddsFormat: "american",
      },
    })
    return data.map((g) => this.transform(g))
  }

  /**
   * Sport keys we actively ingest.
   * Configurable via ACTIVE_SPORTS (comma-separated) to protect API quota.
   * Defaults to NFL + NBA only — enough to prove the pipeline without burning
   * a free-tier plan. Set ACTIVE_SPORTS=all to ingest every supported sport.
   */
  activeSportKeys(): string[] {
    const raw = this.config.get<string>("ACTIVE_SPORTS", "americanfootball_nfl,basketball_nba")
    if (raw.trim().toLowerCase() === "all") return Object.keys(this.SPORT_KEYS)
    const requested = raw.split(",").map((s) => s.trim()).filter(Boolean)
    const valid = requested.filter((s) => s in this.SPORT_KEYS)
    return valid.length ? valid : ["americanfootball_nfl"]
  }

  /**
   * Fetch final scores for recently completed games (used for settlement).
   * @param daysFrom how many days back to include completed games (max 3)
   */
  async fetchScores(sportKey: string, daysFrom = 1): Promise<GameScore[]> {
    const { data } = await this.http.get<OddsApiScore[]>(`/sports/${sportKey}/scores`, {
      params: { daysFrom: Math.min(3, daysFrom) },
    })
    return data
      .filter((s) => s.completed && s.scores?.length === 2)
      .map((s) => {
        const home = s.scores!.find((x) => x.name === s.home_team)
        const away = s.scores!.find((x) => x.name === s.away_team)
        return {
          externalId: s.id,
          homeTeam: s.home_team,
          awayTeam: s.away_team,
          homeScore: home ? parseInt(home.score, 10) : null,
          awayScore: away ? parseInt(away.score, 10) : null,
          completed: s.completed,
        }
      })
  }

  // ─── transform ────────────────────────────────────────────────────────────

  private transform(g: OddsApiGame): GameBooks {
    const sport = this.SPORT_KEYS[g.sport_key] ?? "NFL"
    const booksByMarket = new Map<string, BookMarket[]>()

    for (const bm of g.bookmakers) {
      for (const m of bm.markets) {
        const type = normalizeMarketName(m.key)
        const line: MarketLine = {
          id: `${g.id}:${bm.key}:${m.key}`,
          type: type as MarketLine["type"],
          name: type,
          rawName: m.key,
          outcomes: m.outcomes.map((o) => ({
            id: `${g.id}:${m.key}:${o.name}${o.point != null ? `:${o.point}` : ""}`,
            name: o.name,
            description: o.point != null ? `${o.name} ${o.point > 0 ? "+" : ""}${o.point}` : o.name,
            odds: fromAmerican(o.price),
            point: o.point,
            isMain: true,
          })),
          lastUpdated: new Date(m.last_update),
        }
        const arr = booksByMarket.get(type) ?? []
        arr.push({ book: bm.key, line })
        booksByMarket.set(type, arr)
      }
    }

    return {
      externalId: g.id,
      canonicalId: `${sport}:${g.home_team}:${g.away_team}:${g.commence_time.slice(0, 10)}`,
      sport,
      league: g.sport_title,
      homeTeam: g.home_team,
      awayTeam: g.away_team,
      commenceTime: new Date(g.commence_time),
      booksByMarket,
    }
  }
}

// ─── The Odds API response shapes ─────────────────────────────────────────────

interface OddsApiOutcome { name: string; price: number; point?: number }
interface OddsApiMarket { key: string; last_update: string; outcomes: OddsApiOutcome[] }
interface OddsApiBookmaker { key: string; title: string; markets: OddsApiMarket[] }
interface OddsApiGame {
  id: string
  sport_key: string
  sport_title: string
  commence_time: string
  home_team: string
  away_team: string
  bookmakers: OddsApiBookmaker[]
}

interface OddsApiScore {
  id: string
  completed: boolean
  home_team: string
  away_team: string
  scores?: { name: string; score: string }[]
}

export interface GameScore {
  externalId: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  completed: boolean
}
