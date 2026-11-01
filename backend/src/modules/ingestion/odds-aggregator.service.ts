import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import axios, { AxiosInstance } from "axios"
import { fromAmerican, normalizeMarketName } from "../sportsbook/utils/odds-normalizer"
import type { MarketLine, Sport } from "../sportsbook/types/provider.types"
import type { BookMarket } from "../predictions/devig"
import { PROP_LABELS, PROP_MARKETS, UNSAFE_PLAYER_CHARS } from "./prop-markets"

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

/** A failed call to The Odds API, with the status and error code it returned. */
export class OddsApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null
  ) {
    super(message)
    this.name = "OddsApiError"
  }

  /** A rejected key or an exhausted quota: retrying in seconds cannot succeed. */
  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403
  }
}

export interface OddsFeedStatus {
  lastSuccessAt: string | null
  lastError: {
    at: string
    status: number | null
    code: string | null
    message: string
    path: string
  } | null
  quota: {
    remaining: number
    used: number | null
    lastCost: number | null
    at: string
  } | null
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

  /** What the last calls to The Odds API returned, for the status endpoint. */
  private feed: OddsFeedStatus = { lastSuccessAt: null, lastError: null, quota: null }

  /** PROPS_SPORTS entries already warned about, so the warning is logged once. */
  private readonly warnedPropsKeys = new Set<string>()

  constructor(private readonly config: ConfigService) {
    this.apiKey = config.get<string>("THE_ODDS_API_KEY", "")
    this.http = axios.create({
      baseURL: this.baseUrl(),
      timeout: 12_000,
      params: { apiKey: this.apiKey },
    })
    this.http.interceptors.response.use(
      (res) => {
        this.recordQuota(res.headers)
        this.feed.lastSuccessAt = new Date().toISOString()
        return res
      },
      (err: unknown) => {
        throw this.describeFailure(err)
      }
    )
  }

  status(): OddsFeedStatus {
    return { ...this.feed }
  }

  /**
   * ODDS_API_BASE_URL points the engine at a stand-in API (the local E2E fake,
   * backend/test/e2e/fake-odds-api.mjs). It is ignored in production, so a
   * stray value there can never send the real key somewhere else.
   */
  private baseUrl(): string {
    const official = "https://api.the-odds-api.com/v4"
    const override = (this.config.get<string>("ODDS_API_BASE_URL", "") ?? "").trim()
    if (!override) return official
    if (this.config.get<string>("NODE_ENV") === "production") {
      this.logger.warn("ODDS_API_BASE_URL is ignored in production")
      return official
    }
    this.logger.warn(`Using ODDS_API_BASE_URL=${override} instead of The Odds API`)
    return override
  }

  /** The Odds API reports credits on every response, including most errors. */
  private recordQuota(headers: unknown) {
    const remaining = headerNumber(headers, "x-requests-remaining")
    if (remaining === null) return
    this.feed.quota = {
      remaining,
      used: headerNumber(headers, "x-requests-used"),
      lastCost: headerNumber(headers, "x-requests-last"),
      at: new Date().toISOString(),
    }
  }

  /**
   * Turn an axios failure into an OddsApiError that says what went wrong. Axios
   * alone reports "Request failed with status code 401", which reads the same
   * for an exhausted quota and a revoked key.
   */
  private describeFailure(err: unknown): Error {
    if (!axios.isAxiosError(err)) return err instanceof Error ? err : new Error(String(err))
    const status = err.response?.status ?? null
    if (err.response) this.recordQuota(err.response.headers)
    const body = (err.response?.data ?? {}) as { message?: unknown; error_code?: unknown }
    const code = typeof body.error_code === "string" ? body.error_code : null
    const detail = typeof body.message === "string" ? body.message : err.message
    const path = err.config?.url ?? ""
    const error = new OddsApiError(
      `The Odds API ${status ?? "network error"}${code ? ` ${code}` : ""} on ${path}: ${detail}`,
      status,
      code
    )
    this.feed.lastError = { at: new Date().toISOString(), status, code, message: detail, path }
    return error
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
    return parseRegions(this.config.get<string>("ODDS_REGIONS", "us") ?? "us")
  }

  /**
   * The regions player props are requested in, from PROPS_REGIONS (default
   * "us", same allowed set as regions()). Kept apart from ODDS_REGIONS so
   * adding us2 for game lines does not double what every props call costs.
   */
  propsRegions(): string {
    return parseRegions(this.config.get<string>("PROPS_REGIONS", "us") ?? "us")
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
   * Sport keys the scheduled props job runs for, from PROPS_SPORTS
   * (comma-separated, default empty: off). A key needs prop markets and must
   * also be in activeSportKeys(), because props are graded inside settleSport,
   * which is only scheduled for active sports. Other keys are dropped with a
   * warning.
   */
  propsSportKeys(): string[] {
    const raw = this.config.get<string>("PROPS_SPORTS", "") ?? ""
    const requested = Array.from(new Set(raw.split(",").map((s) => s.trim()).filter(Boolean)))
    const active = new Set(this.activeSportKeys())
    return requested.filter((key) => {
      const reason = !this.propMarketsFor(key).length
        ? "it has no prop markets"
        : !active.has(key)
          ? "it is not in ACTIVE_SPORTS"
          : null
      if (reason && !this.warnedPropsKeys.has(key)) {
        this.warnedPropsKeys.add(key)
        this.logger.warn(`PROPS_SPORTS: ignoring ${key} because ${reason}`)
      }
      return !reason
    })
  }

  /** The Sport name stored on Game rows for an Odds API sport key, e.g. "NBA". */
  sportFor(sportKey: string): Sport | null {
    return this.SPORT_KEYS[sportKey] ?? null
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

  propMarketsFor(sportKey: string): string[] {
    return PROP_MARKETS[sportKey] ?? []
  }

  /**
   * List scheduled/live events for a sport. The listing has cost 0 credits so
   * far; cost and remaining come from this response's own headers (the shared
   * feed.quota is overwritten by concurrent poll jobs), so a caller can tell
   * if that changes.
   */
  async fetchEvents(sportKey: string): Promise<{ events: OddsEvent[]; cost: number | null; remaining: number | null }> {
    const res = await this.http.get<OddsApiGame[]>(`/sports/${sportKey}/events`)
    return {
      events: res.data.map((e) => ({
        id: e.id,
        homeTeam: e.home_team,
        awayTeam: e.away_team,
        commenceTime: new Date(e.commence_time),
      })),
      ...creditsFrom(res.headers),
    }
  }

  /**
   * Fetch player props for a single event across all books, in propsRegions().
   * Each (player, prop, number) becomes its own 2-way (Over/Under) market so the
   * engine can de-vig it exactly like a game total. A call costs (markets
   * returned x regions) credits, read from this response's headers; books is
   * null only when the sport has no prop markets (and nothing was requested).
   * Failures throw OddsApiError.
   */
  async fetchEventProps(
    sportKey: string,
    eventId: string
  ): Promise<{ books: GameBooks | null; cost: number | null; remaining: number | null }> {
    const markets = this.propMarketsFor(sportKey)
    if (markets.length === 0) return { books: null, cost: 0, remaining: null }

    const res = await this.http.get<OddsApiGame>(`/sports/${sportKey}/events/${eventId}/odds`, {
      params: {
        regions: this.propsRegions(),
        markets: markets.join(","),
        oddsFormat: "american",
        includeLinks: "true",
        includeSids: "true",
      },
    })
    return { books: this.transformProps(res.data), ...creditsFrom(res.headers) }
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
            // A spread is signed ("Chiefs -6.5", "Raiders +6.5"); a total is not ("Over 45.5").
            description:
              o.point == null ? o.name : `${o.name} ${type !== "total" && o.point > 0 ? "+" : ""}${o.point}`,
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
    // (book, prop, player, number) already taken, so a repeated market cannot
    // put one book in the same consensus twice.
    const seen = new Set<string>()

    for (const bm of g.bookmakers) {
      for (const m of bm.markets) {
        // Group this book's outcomes for this prop by player (description
        // field) and number. Most books post one number per player; some
        // (Bovada) post a ladder of them in one market, and each number is
        // its own Over/Under bet that other books may price.
        const byLine = new Map<string, { player: string; point: number; outs: OddsApiOutcome[] }>()
        for (const o of m.outcomes) {
          const player = o.description
          // The name is part of the outcome id and the board ref, whose
          // separators it must not contain. A prop without a number is not a
          // two-way line.
          if (!player || UNSAFE_PLAYER_CHARS.test(player)) continue
          if (typeof o.point !== "number" || !Number.isFinite(o.point)) continue
          const groupKey = `${player}\u0000${o.point}`
          const group = byLine.get(groupKey) ?? { player, point: o.point, outs: [] }
          group.outs.push(o)
          byLine.set(groupKey, group)
        }

        for (const { player, point, outs } of byLine.values()) {
          // De-vigging needs exactly one Over and one Under at the same number.
          const over = outs.filter((o) => o.name.toLowerCase() === "over")
          const under = outs.filter((o) => o.name.toLowerCase() === "under")
          if (outs.length !== 2 || over.length !== 1 || under.length !== 1) continue
          const seenKey = `${bm.key}\u0000${m.key}\u0000${player}\u0000${point}`
          if (seen.has(seenKey)) continue
          seen.add(seenKey)

          const label = PROP_LABELS[m.key] ?? m.key
          const key = `${m.key}|${player}`
          const sides: [string, OddsApiOutcome][] = [
            ["Over", over[0]],
            ["Under", under[0]],
          ]
          const line: MarketLine = {
            id: `${g.id}:${bm.key}:${m.key}:${player}`,
            type: "prop",
            name: key,
            rawName: m.key,
            outcomes: sides.map(([side, o]) => ({
              id: `${g.id}:${m.key}:${player}:${side}:${point}`,
              name: side,
              description: `${player} ${side} ${point} ${label}`,
              odds: fromAmerican(o.price),
              point,
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

/** One event from The Odds API's /events listing. */
export interface OddsEvent {
  id: string
  homeTeam: string
  awayTeam: string
  commenceTime: Date
}

/** US regions only. us_dfs (pick'em) is out of scope for the book comparison. */
const ALLOWED_REGIONS = new Set(["us", "us2", "us_ex"])

/** A comma-separated regions setting, filtered to ALLOWED_REGIONS; "us" when none is left. */
function parseRegions(raw: string): string {
  const picked = Array.from(
    new Set(
      raw
        .split(",")
        .map((r) => r.trim().toLowerCase())
        .filter((r) => ALLOWED_REGIONS.has(r))
    )
  )
  return picked.length ? picked.join(",") : "us"
}

/** A numeric response header, or null when it is missing or not a number. */
function headerNumber(headers: unknown, key: string): number | null {
  const h = (headers ?? {}) as Record<string, unknown>
  const raw = h[key]
  if (raw == null || raw === "") return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** What one call cost and the credits left after it, from its own headers. */
function creditsFrom(headers: unknown): { cost: number | null; remaining: number | null } {
  return { cost: headerNumber(headers, "x-requests-last"), remaining: headerNumber(headers, "x-requests-remaining") }
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
