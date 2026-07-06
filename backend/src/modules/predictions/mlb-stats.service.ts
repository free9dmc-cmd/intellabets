import { Injectable, Logger } from "@nestjs/common"
import axios, { AxiosInstance } from "axios"

export interface PlayerStatLine {
  hits: number
  totalBases: number
  homeRuns: number
  strikeouts: number // pitcher strikeouts
}

/**
 * Grades MLB player props using the free, public MLB Stats API
 * (statsapi.mlb.com — no key required). Given a game's date and teams, it
 * returns a map of player full name -> their box-score stat line.
 */
@Injectable()
export class MlbStatsService {
  private readonly logger = new Logger(MlbStatsService.name)
  private readonly http: AxiosInstance

  constructor() {
    this.http = axios.create({ baseURL: "https://statsapi.mlb.com/api", timeout: 12_000 })
  }

  /**
   * @param dateISO   game date (YYYY-MM-DD)
   * @param homeTeam  full team name as it appears in odds data
   * @param awayTeam  full team name
   * @returns map of player fullName -> stat line, or null if the box score
   *          isn't available (game not found / not final).
   */
  async getPlayerStats(dateISO: string, homeTeam: string, awayTeam: string): Promise<Map<string, PlayerStatLine> | null> {
    const gamePk = await this.findGamePk(dateISO, homeTeam, awayTeam)
    if (!gamePk) {
      this.logger.warn(`No MLB gamePk for ${awayTeam} @ ${homeTeam} on ${dateISO}`)
      return null
    }

    try {
      const { data } = await this.http.get(`/v1.1/game/${gamePk}/feed/live`)
      const status = data?.gameData?.status?.abstractGameState
      if (status !== "Final") {
        this.logger.debug(`Game ${gamePk} not final yet (${status})`)
        return null
      }

      const map = new Map<string, PlayerStatLine>()
      for (const side of ["home", "away"] as const) {
        const players = data?.liveData?.boxscore?.teams?.[side]?.players ?? {}
        for (const key of Object.keys(players)) {
          const p = players[key]
          const name: string | undefined = p?.person?.fullName
          if (!name) continue
          const bat = p?.stats?.batting ?? {}
          const pit = p?.stats?.pitching ?? {}
          map.set(name, {
            hits: num(bat.hits),
            totalBases: num(bat.totalBases),
            homeRuns: num(bat.homeRuns),
            strikeouts: num(pit.strikeOuts),
          })
        }
      }
      return map
    } catch (err) {
      this.logger.warn(`MLB boxscore fetch failed for ${gamePk}: ${errMsg(err)}`)
      return null
    }
  }

  /** Map a stored prop stat key + player to their actual number. */
  statForKey(statKey: string, line: PlayerStatLine): number | null {
    switch (statKey) {
      case "batter_hits": return line.hits
      case "batter_total_bases": return line.totalBases
      case "batter_home_runs": return line.homeRuns
      case "pitcher_strikeouts": return line.strikeouts
      default: return null
    }
  }

  private async findGamePk(dateISO: string, homeTeam: string, awayTeam: string): Promise<number | null> {
    try {
      const { data } = await this.http.get(`/v1/schedule`, {
        params: { sportId: 1, date: dateISO },
      })
      const games = data?.dates?.[0]?.games ?? []
      const norm = (s: string) => s.toLowerCase().trim()
      const match = games.find(
        (g: any) =>
          norm(g.teams?.home?.team?.name ?? "") === norm(homeTeam) &&
          norm(g.teams?.away?.team?.name ?? "") === norm(awayTeam)
      )
      return match?.gamePk ?? null
    } catch (err) {
      this.logger.warn(`MLB schedule lookup failed: ${errMsg(err)}`)
      return null
    }
  }
}

function num(x: unknown): number {
  const n = typeof x === "string" ? parseInt(x, 10) : typeof x === "number" ? x : 0
  return isNaN(n) ? 0 : n
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
