import { Injectable, Logger } from "@nestjs/common"
import axios, { AxiosInstance } from "axios"
import { easternDate, personNames, shiftDate, teamMatches, type PersonNames } from "./player-names"

export interface NhlSkaterLine {
  goals: number
  assists: number
  points: number
  sog: number // shots on goal
}

export interface NhlPlayer extends PersonNames {
  playerId: number
  team: string // abbrev, e.g. "CAR"
  /** null for goalies: they dressed, but have no skater line to grade. */
  line: NhlSkaterLine | null
}

export interface NhlGameStats {
  gameId: number
  /** Every dressed player of both teams, skaters and goalies. */
  players: NhlPlayer[]
}

interface ScoreGame {
  id: number
  startTimeUTC: string
  scheduleState: string
  home: string // nickname, e.g. "Hurricanes"
  away: string
}

/** Largest gap allowed between the NHL's start time and the odds feed's (seen: 10 min). */
const MAX_START_GAP_MS = 3 * 3_600_000
/** How long one date's score lookup is reused: about one settle run. */
const SCORE_TTL_MS = 10 * 60_000

/**
 * Grades NHL player props using the NHL's public web API (api-web.nhle.com —
 * no key required, but undocumented). Given a game's start and teams, it
 * returns every dressed player with their full names and box-score line.
 * Anything unexpected in a response reads as "not final yet" (null), never as
 * "did not play".
 */
@Injectable()
export class NhlStatsService {
  private readonly logger = new Logger(NhlStatsService.name)
  private readonly http: AxiosInstance
  private readonly scores = new Map<string, { expires: number; games: Promise<ScoreGame[] | null> }>()

  constructor() {
    this.http = axios.create({ baseURL: "https://api-web.nhle.com/v1", timeout: 12_000 })
  }

  /**
   * @param commenceTime  start time from the odds feed
   * @param homeTeam      full team name as it appears in odds data
   * @param awayTeam      full team name
   * @returns the game's dressed players, or null if the game isn't found,
   *          isn't official yet, or a response isn't the expected shape.
   */
  async getGameStats(commenceTime: Date, homeTeam: string, awayTeam: string): Promise<NhlGameStats | null> {
    const game = await this.findGame(commenceTime, homeTeam, awayTeam)
    if (!game) return null

    try {
      const { data: box } = await this.http.get(`/gamecenter/${game.id}/boxscore`)
      // "OFF" is the official final; "FINAL" can still see stat corrections.
      if (box?.gameState !== "OFF") {
        this.logger.debug(`NHL game ${game.id} not official yet (${box?.gameState})`)
        return null
      }
      if (!box.playerByGameStats) {
        this.logger.warn(`NHL boxscore ${game.id} has no player stats`)
        return null
      }

      const { data: pbp } = await this.http.get(`/gamecenter/${game.id}/play-by-play`)
      const players = nhlPlayersFrom(box, pbp)
      if (!players) {
        this.logger.warn(`NHL game ${game.id}: unexpected boxscore or roster shape, not grading`)
        return null
      }
      return { gameId: game.id, players }
    } catch (err) {
      this.logger.warn(`NHL boxscore fetch failed for ${game.id}: ${errMsg(err)}`)
      return null
    }
  }

  /** Map a stored prop stat key to the player's actual number. */
  statForKey(statKey: string, line: NhlSkaterLine): number | null {
    switch (statKey) {
      case "player_points": return line.points
      case "player_shots_on_goal": return line.sog
      default: return null
    }
  }

  /**
   * The NHL game the odds feed's event refers to. The NHL dates games in US
   * Eastern time, so that date's slate is read first and the days either side
   * only if it has no match. Exactly one match is required.
   */
  private async findGame(commenceTime: Date, homeTeam: string, awayTeam: string): Promise<ScoreGame | null> {
    const label = `${awayTeam} @ ${homeTeam} (${commenceTime.toISOString()})`
    const accepts = (g: ScoreGame) =>
      g.scheduleState === "OK" &&
      teamMatches(homeTeam, g.home) &&
      teamMatches(awayTeam, g.away) &&
      Math.abs(Date.parse(g.startTimeUTC) - commenceTime.getTime()) <= MAX_START_GAP_MS

    const date = easternDate(commenceTime)
    for (const dates of [[date], [shiftDate(date, -1), shiftDate(date, 1)]]) {
      const matches: ScoreGame[] = []
      for (const d of dates) {
        const games = await this.scoreGames(d)
        if (!games) return null
        matches.push(...games.filter(accepts))
      }
      if (matches.length === 1) return matches[0]
      if (matches.length > 1) {
        this.logger.warn(`${matches.length} NHL games match ${label}: ${matches.map((g) => g.id).join(", ")}`)
        return null
      }
    }
    this.logger.warn(`No NHL game for ${label}`)
    return null
  }

  /** One date's games, reused for the rest of the settle run. */
  private scoreGames(date: string): Promise<ScoreGame[] | null> {
    const now = Date.now()
    for (const [d, entry] of this.scores) if (entry.expires <= now) this.scores.delete(d)

    const cached = this.scores.get(date)
    if (cached) return cached.games

    const games = this.fetchScoreGames(date)
    const entry = { expires: now + SCORE_TTL_MS, games }
    this.scores.set(date, entry)
    // Failures are not reused: the next game retries.
    void games.then((g) => {
      if (!g && this.scores.get(date) === entry) this.scores.delete(date)
    })
    return games
  }

  private async fetchScoreGames(date: string): Promise<ScoreGame[] | null> {
    try {
      const { data } = await this.http.get(`/score/${date}`)
      if (!Array.isArray(data?.games)) {
        this.logger.warn(`NHL score ${date}: no games list`)
        return null
      }
      const games: ScoreGame[] = []
      for (const g of data.games) {
        const home = g?.homeTeam?.name?.default
        const away = g?.awayTeam?.name?.default
        if (typeof g?.id !== "number" || typeof home !== "string" || typeof away !== "string") continue
        games.push({
          id: g.id,
          startTimeUTC: String(g.startTimeUTC ?? ""),
          scheduleState: String(g.gameScheduleState ?? ""),
          home,
          away,
        })
      }
      return games
    } catch (err) {
      this.logger.warn(`NHL score lookup failed for ${date}: ${errMsg(err)}`)
      return null
    }
  }
}

/**
 * Join a boxscore's players to the play-by-play's roster for full names.
 * Boxscores carry abbreviated names ("A. Svechnikov"); rosterSpots carry the
 * full first and last names in every locale the NHL publishes. Returns null on
 * any shape it does not expect, including a player with no roster entry.
 */
export function nhlPlayersFrom(box: any, pbp: any): NhlPlayer[] | null {
  const spots = pbp?.rosterSpots
  if (!Array.isArray(spots)) return null
  const names = new Map<number, PersonNames>()
  for (const spot of spots) {
    const first = localeValues(spot?.firstName)
    const last = localeValues(spot?.lastName)
    if (typeof spot?.playerId !== "number" || first.length === 0 || last.length === 0) return null
    names.set(spot.playerId, personNames(first, last))
  }

  const players: NhlPlayer[] = []
  for (const side of ["awayTeam", "homeTeam"] as const) {
    const groups = box?.playerByGameStats?.[side]
    const { forwards, defense, goalies } = groups ?? {}
    if (!Array.isArray(forwards) || !Array.isArray(defense) || !Array.isArray(goalies)) return null
    if (forwards.length + defense.length === 0 || goalies.length === 0) return null
    const team = typeof box?.[side]?.abbrev === "string" ? box[side].abbrev : side

    for (const entry of [...forwards, ...defense, ...goalies]) {
      const playerName = names.get(entry?.playerId)
      if (!playerName) return null
      let line: NhlSkaterLine | null = null
      if (!goalies.includes(entry)) {
        const { goals, assists, points, sog } = entry
        if (![goals, assists, points, sog].every((n) => typeof n === "number" && Number.isFinite(n))) return null
        line = { goals, assists, points, sog }
      }
      players.push({ playerId: entry.playerId, team, line, ...playerName })
    }
  }
  return players
}

/** Every spelling in a localized name object ({ default: "Joseph", fr: "Joe" }). */
function localeValues(name: unknown): string[] {
  if (!name || typeof name !== "object") return []
  return Object.values(name).filter((v): v is string => typeof v === "string" && v.trim() !== "")
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
