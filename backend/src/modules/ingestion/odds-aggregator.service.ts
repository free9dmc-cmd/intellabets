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

  /**
   * The Odds API regions to request, from ODDS_REGIONS (comma-separated).
   *
   * Default "us", unchanged from before, so API quota does not silently grow.
   * Each region costs 1 credit per market per call. "us,us2" adds most
   * tier-2 books (theScore Bet, Hard Rock, Bally Bet, betPARX, Fliff) and
   * roughly doubles credits per call. "us_ex" adds prediction exchanges.
   */
  regions(): string {
    const raw = this.config.get<string>("ODDS_REGIONS", "us") ?? "us"
    // US regions only. us_dfs (pick'em) is out of scope for the book comparison.
    const allowed = new Set(["us", "us2", "us_ex"])
    const picked = Array.from(
      new Set(
        raw
          .split(",")
          .map((r) => r.trim().toLowerCase())
          .filter((r) => allowed.has(r))
      )
    )
    return picked.length ? picked.join(",") : "us"
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
        regions: this.regions(),
        markets: "h2h,spreads,totals",
        oddsFormat: "american",
        // Ask for bookmaker deep links so we can send the user straight to a
        // pre-populated betslip at whichever book they choose.
        includeLinks: "true",
        includeSids: "true",
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

  /**
   * Player-prop market keys per sport (Over/Under style — cleanly de-viggable).
   * Single-sided markets like anytime-TD are intentionally excluded because
   * they have no fair 2-way to de-vig against.
   */
  private readonly PROP_MARKETS: Record<string, string[]> = {
    americanfootball_nfl: ["player_pass_yds", "player_pass_tds", "player_rush_yds", "player_reception_yds", "player_receptions"],
    basketball_nba: ["player_points", "player_rebounds", "player_assists", "player_threes"],
    baseball_mlb: ["batter_hits", "batter_total_bases", "batter_home_runs", "pitcher_strikeouts"],
    icehockey_nhl: ["player_points", "player_shots_on_goal"],
  }

  propMarketsFor(sportKey: string): string[] {
    return this.PROP_MARKETS[sportKey] ?? []
  }

  /** List scheduled/live events for a sport (cheap — 1 credit). */
  async fetchEvents(sportKey: string): Promise<{ id: string; homeTeam: string; awayTeam: string; commenceTime: Date }[]> {
    const { data } = await this.http.get<OddsApiGame[]>(`/sports/${sportKey}/events`)
    return data.map((e) => ({
      id: e.id,
      homeTeam: e.home_team,
      awayTeam: e.away_team,
      commenceTime: new Date(e.commence_time),
    }))
  }

  /**
   * Fetch player props for a single event across all books.
   * Each (player, prop) becomes its own 2-way (Over/Under) market so the engine
   * can de-vig it exactly like a game total.
   */
  async fetchEventProps(sportKey: string, eventId: string): Promise<GameBooks | null> {
    const markets = this.propMarketsFor(sportKey)
    if (markets.length === 0) return null

    const { data } = await this.http.get<OddsApiGame>(`/sports/${sportKey}/events/${eventId}/odds`, {
      params: {
        regions: this.regions(),
        markets: markets.join(","),
        oddsFormat: "american",
        includeLinks: "true",
        includeSids: "true",
      },
    })
    return this.transformProps(data)
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
            link: o.link ?? m.link ?? undefined,
            sid: o.sid ?? undefined,
          })),
          lastUpdated: new Date(m.last_update),
          ...bookLinkFields(bm, m),
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

  private transformProps(g: OddsApiGame): GameBooks {
    const sport = this.SPORT_KEYS[g.sport_key] ?? "NFL"
    // Key = "<propKey>|<player>" so each player's line is its own 2-way market.
    const booksByMarket = new Map<string, BookMarket[]>()

    for (const bm of g.bookmakers) {
      for (const m of bm.markets) {
        // Group this book's outcomes for this prop by player (description field).
        const byPlayer = new Map<string, OddsApiOutcome[]>()
        for (const o of m.outcomes) {
          const player = o.description ?? o.name
          const arr = byPlayer.get(player) ?? []
          arr.push(o)
          byPlayer.set(player, arr)
        }

        for (const [player, outs] of byPlayer.entries()) {
          // Need both Over and Under to de-vig; skip single-sided.
          if (outs.length < 2) continue
          const label = PROP_LABELS[m.key] ?? m.key
          const key = `${m.key}|${player}`
          const line: MarketLine = {
            id: `${g.id}:${bm.key}:${m.key}:${player}`,
            type: "prop",
            name: key,
            rawName: m.key,
            outcomes: outs.map((o) => ({
              id: `${g.id}:${m.key}:${player}:${o.name}:${o.point ?? ""}`,
              name: o.name, // "Over" / "Under"
              description: `${player} ${o.name} ${o.point ?? ""} ${label}`.trim(),
              odds: fromAmerican(o.price),
              point: o.point,
              isMain: true,
              link: o.link ?? m.link ?? undefined,
              sid: o.sid ?? undefined,
            })),
            lastUpdated: new Date(m.last_update),
            ...bookLinkFields(bm, m),
          }
          const arr = booksByMarket.get(key) ?? []
          arr.push({ book: bm.key, line })
          booksByMarket.set(key, arr)
        }
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

// Human-readable prop labels for selection text.
const PROP_LABELS: Record<string, string> = {
  player_pass_yds: "Passing Yards",
  player_pass_tds: "Passing TDs",
  player_rush_yds: "Rushing Yards",
  player_reception_yds: "Receiving Yards",
  player_receptions: "Receptions",
  player_points: "Points",
  player_rebounds: "Rebounds",
  player_assists: "Assists",
  player_threes: "3-Pointers",
  player_shots_on_goal: "Shots on Goal",
  batter_hits: "Hits",
  batter_total_bases: "Total Bases",
  batter_home_runs: "Home Runs",
  pitcher_strikeouts: "Strikeouts",
}

// ─── The Odds API response shapes ─────────────────────────────────────────────

// With includeLinks/includeSids, link and sid can appear at bookmaker (event),
// market and outcome level, and any of them may be null
// (https://the-odds-api.com/releases/deep-links.html).
interface OddsApiOutcome { name: string; price: number; point?: number; description?: string; link?: string | null; sid?: string | null }
interface OddsApiMarket { key: string; last_update: string; outcomes: OddsApiOutcome[]; link?: string | null; sid?: string | null }
interface OddsApiBookmaker { key: string; title: string; markets: OddsApiMarket[]; link?: string | null; sid?: string | null }

/**
 * Market- and event-level link inputs for one book's market line. Only
 * defined values are set, so snapshots without links keep their old shape.
 */
function bookLinkFields(bm: OddsApiBookmaker, m: OddsApiMarket): Partial<MarketLine> {
  const out: Partial<MarketLine> = {}
  if (typeof m.link === "string") out.marketLink = m.link
  if (typeof m.sid === "string") out.marketSid = m.sid
  if (typeof bm.link === "string") out.eventLink = bm.link
  if (typeof bm.sid === "string") out.eventSid = bm.sid
  return out
}
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
