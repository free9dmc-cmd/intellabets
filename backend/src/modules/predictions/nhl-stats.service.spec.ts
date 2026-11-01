import * as fs from "fs"
import * as path from "path"
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios"
import { Logger } from "@nestjs/common"
import { NhlStatsService, nhlPlayersFrom, type NhlGameStats } from "./nhl-stats.service"
import { matchPlayer, personNames } from "./player-names"

// Trimmed real responses from api-web.nhle.com (fetched 2026-11-01):
//   CBJ @ CAR 2026020206 (final, 2026-10-29 23:00Z)
//   CGY @ COL 2026020226 (final, 2026-11-01 02:00Z, so 2026-10-31 in Eastern time)
//   WPG @ CAR 2026020227 (not started, gameState FUT)
// The Odds API lists NHL games 10 minutes after the NHL's start time.

Logger.overrideLogger(false)

const FIXTURES = path.join(__dirname, "__fixtures__/nhl")
const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"))

const REAL_ROUTES: Record<string, string> = {
  "/score/2026-10-29": "score-2026-10-29",
  "/score/2026-10-31": "score-2026-10-31",
  "/score/2026-11-01": "score-2026-11-01",
  "/gamecenter/2026020206/boxscore": "boxscore-2026020206",
  "/gamecenter/2026020206/play-by-play": "play-by-play-2026020206",
  "/gamecenter/2026020226/boxscore": "boxscore-2026020226",
  "/gamecenter/2026020226/play-by-play": "play-by-play-2026020226",
  "/gamecenter/2026020227/boxscore": "boxscore-2026020227",
}

/** A service whose HTTP calls are answered from `routes` (404 otherwise), and the paths it asked for. */
function service(routes: Record<string, unknown> = {}) {
  const requested: string[] = []
  const svc = new NhlStatsService()
  const adapter = async (config: InternalAxiosRequestConfig) => {
    const url = config.url ?? ""
    requested.push(url)
    const body = url in routes ? routes[url] : url in REAL_ROUTES ? fixture(REAL_ROUTES[url]) : undefined
    if (body === undefined) {
      const response = { status: 404, statusText: "Not Found", data: {}, headers: new AxiosHeaders(), config }
      throw new AxiosError("Request failed with status code 404", "ERR_BAD_REQUEST", config, null, response)
    }
    return { status: 200, statusText: "OK", data: body, headers: new AxiosHeaders(), config }
  }
  ;(svc as unknown as { http: { defaults: { adapter: unknown } } }).http.defaults.adapter = adapter
  return { svc, requested }
}

const CBJ_AT_CAR = [new Date("2026-10-29T23:10:00Z"), "Carolina Hurricanes", "Columbus Blue Jackets"] as const
const CGY_AT_COL = [new Date("2026-11-01T02:10:00Z"), "Colorado Avalanche", "Calgary Flames"] as const
const WPG_AT_CAR = [new Date("2026-11-01T18:10:00Z"), "Carolina Hurricanes", "Winnipeg Jets"] as const

function line(game: NhlGameStats | null, oddsName: string) {
  const m = matchPlayer(game?.players ?? [], oddsName)
  if (m.kind !== "found") throw new Error(`${oddsName}: ${m.kind}`)
  return m.player.line
}

describe("NhlStatsService.getGameStats", () => {
  it("finds a late game on its Eastern date (CGY @ COL, 02:00Z on Nov 1 is Oct 31)", async () => {
    const { svc, requested } = service()
    const game = await svc.getGameStats(...CGY_AT_COL)
    expect(requested).toEqual([
      "/score/2026-10-31",
      "/gamecenter/2026020226/boxscore",
      "/gamecenter/2026020226/play-by-play",
    ])
    expect(game?.gameId).toBe(2026020226)
    expect(game?.players).toHaveLength(40)
    expect(line(game, "Cale Makar")).toEqual({ goals: 0, assists: 4, points: 4, sog: 3 })
    expect(line(game, "Nathan MacKinnon")).toEqual({ goals: 1, assists: 1, points: 2, sog: 5 })
  })

  it("reads Svechnikov (SOG 1, points 0) and Jarvis (points 2, SOG 3) from CBJ @ CAR", async () => {
    const { svc } = service()
    const game = await svc.getGameStats(...CBJ_AT_CAR)
    expect(game?.gameId).toBe(2026020206)

    const svechnikov = line(game, "Andrei Svechnikov")!
    expect(svc.statForKey("player_shots_on_goal", svechnikov)).toBe(1)
    expect(svc.statForKey("player_points", svechnikov)).toBe(0)

    const jarvis = line(game, "Seth Jarvis")!
    expect(svc.statForKey("player_points", jarvis)).toBe(2)
    expect(svc.statForKey("player_shots_on_goal", jarvis)).toBe(3)

    expect(svc.statForKey("player_assists", jarvis)).toBeNull()
  })

  it("matches every Carolina name from the Odds API sample; Winnipeg's are absent", async () => {
    const { svc } = service()
    const game = await svc.getGameStats(...CBJ_AT_CAR)
    // Player names from the WPG @ CAR props sample (The Odds API, 2026-11-01).
    const carolina = ["Andrei Svechnikov", "Jaccob Slavin", "Jackson Blake", "Jalen Chatfield", "Jordan Martinook",
      "Logan Stankoven", "Mark Jankowski", "Nikolaj Ehlers", "Sean Walker", "Sebastian Aho", "Seth Jarvis",
      "Shayne Gostisbehere", "William Carrier"]
    const winnipeg = ["Cole Perfetti", "Dawson Mercer", "Elias Salomonsson", "Gabriel Vilardi", "Kyle Connor",
      "Mark Scheifele", "Neal Pionk"]
    for (const name of carolina) expect([name, matchPlayer(game!.players, name).kind]).toEqual([name, "found"])
    for (const name of winnipeg) expect([name, matchPlayer(game!.players, name).kind]).toEqual([name, "absent"])
  })

  it("counts goalies as dressed, with no skater line", async () => {
    const { svc } = service()
    const game = await svc.getGameStats(...CBJ_AT_CAR)
    // Bussi was the backup (TOI 00:00) but dressed.
    const m = matchPlayer(game!.players, "Brandon Bussi")
    expect(m.kind === "found" && m.player.line).toBeNull()
  })

  it("accepts the Odds API's +10 min start but not a start more than 3 h away", async () => {
    const { svc } = service()
    expect((await svc.getGameStats(new Date("2026-10-29T23:10:00Z"), CBJ_AT_CAR[1], CBJ_AT_CAR[2]))?.gameId).toBe(2026020206)
    expect((await svc.getGameStats(new Date("2026-10-30T02:00:00Z"), CBJ_AT_CAR[1], CBJ_AT_CAR[2]))?.gameId).toBe(2026020206)
    expect(await svc.getGameStats(new Date("2026-10-30T02:01:00Z"), CBJ_AT_CAR[1], CBJ_AT_CAR[2])).toBeNull()
  })

  it("does not match home and away swapped", async () => {
    const { svc } = service()
    expect(await svc.getGameStats(CBJ_AT_CAR[0], CBJ_AT_CAR[2], CBJ_AT_CAR[1])).toBeNull()
  })

  it("returns null for a game that has not started (FUT), without reading the roster", async () => {
    const { svc, requested } = service()
    expect(await svc.getGameStats(...WPG_AT_CAR)).toBeNull()
    expect(requested).toEqual(["/score/2026-11-01", "/gamecenter/2026020227/boxscore"])
  })

  it("returns null while the game is FINAL but not yet OFF (official)", async () => {
    const box = { ...fixture("boxscore-2026020206"), gameState: "FINAL" }
    const { svc } = service({ "/gamecenter/2026020206/boxscore": box })
    expect(await svc.getGameStats(...CBJ_AT_CAR)).toBeNull()
  })

  it("skips a postponed game", async () => {
    const score = fixture("score-2026-10-31")
    for (const g of score.games) if (g.id === 2026020226) g.gameScheduleState = "PPD"
    const { svc } = service({ "/score/2026-10-31": score })
    expect(await svc.getGameStats(...CGY_AT_COL)).toBeNull()
  })

  it("looks at the days either side when the Eastern date has no match", async () => {
    const { svc, requested } = service({
      "/score/2026-10-29": { games: [] },
      "/score/2026-10-28": { games: [] },
      "/score/2026-10-30": fixture("score-2026-10-29"),
    })
    expect((await svc.getGameStats(...CBJ_AT_CAR))?.gameId).toBe(2026020206)
    expect(requested.slice(0, 3)).toEqual(["/score/2026-10-29", "/score/2026-10-28", "/score/2026-10-30"])
  })

  it("returns null when more than one game matches", async () => {
    const score = fixture("score-2026-10-29")
    const twin = { ...score.games.find((g: { id: number }) => g.id === 2026020206), id: 2026029999 }
    const { svc, requested } = service({ "/score/2026-10-29": { games: [...score.games, twin] } })
    expect(await svc.getGameStats(...CBJ_AT_CAR)).toBeNull()
    expect(requested.some((u) => u.startsWith("/gamecenter"))).toBe(false)
  })

  it("reads each date's scores once per settle run", async () => {
    const { svc, requested } = service()
    await svc.getGameStats(...CBJ_AT_CAR)
    await svc.getGameStats(new Date("2026-10-29T23:10:00Z"), "Tampa Bay Lightning", "Winnipeg Jets")
    expect(requested.filter((u) => u === "/score/2026-10-29")).toHaveLength(1)
  })

  it("does not reuse a failed score lookup", async () => {
    let calls = 0
    const { svc } = service()
    const http = (svc as unknown as { http: { defaults: { adapter: (c: InternalAxiosRequestConfig) => Promise<unknown> } } }).http
    const real = http.defaults.adapter
    http.defaults.adapter = async (config) => {
      if (config.url === "/score/2026-10-29" && calls++ === 0) throw new AxiosError("timeout of 12000ms exceeded", "ECONNABORTED", config)
      return real(config)
    }
    expect(await svc.getGameStats(...CBJ_AT_CAR)).toBeNull()
    expect((await svc.getGameStats(...CBJ_AT_CAR))?.gameId).toBe(2026020206)
  })

  it("returns null when a response is not the expected shape", async () => {
    const box = fixture("boxscore-2026020206")
    const noStats = { ...box }
    delete noStats.playerByGameStats
    expect(await service({ "/gamecenter/2026020206/boxscore": noStats }).svc.getGameStats(...CBJ_AT_CAR)).toBeNull()
    expect(await service({ "/gamecenter/2026020206/play-by-play": {} }).svc.getGameStats(...CBJ_AT_CAR)).toBeNull()
    expect(await service({ "/score/2026-10-29": { gameWeek: [] } }).svc.getGameStats(...CBJ_AT_CAR)).toBeNull()
    expect(await service({ "/gamecenter/2026020206/play-by-play": undefined, "/gamecenter/2026020206/boxscore": undefined })
      .svc.getGameStats(...CBJ_AT_CAR)).toBeNull()
  })
})

describe("nhlPlayersFrom", () => {
  const box = () => fixture("boxscore-2026020206")
  const pbp = () => fixture("play-by-play-2026020206")

  it("joins every boxscore player to a full name", () => {
    const players = nhlPlayersFrom(box(), pbp())!
    expect(players).toHaveLength(40)
    expect(players.filter((p) => p.line === null)).toHaveLength(4)
    const valimaki = players.find((p) => p.playerId === 8479976)!
    expect(valimaki.team).toBe("CAR")
    expect(valimaki.fullNames).toEqual(["juuso valimaki"])
    // Every locale spelling is indexed: Svechnikov's cs/sk first name "Andrej".
    expect(players.find((p) => p.playerId === 8480830)!.fullNames).toContain("andrej svecnikov")
  })

  it("rejects a player with no roster entry", () => {
    const roster = pbp()
    roster.rosterSpots = roster.rosterSpots.filter((s: { playerId: number }) => s.playerId !== 8482093)
    expect(nhlPlayersFrom(box(), roster)).toBeNull()
  })

  it("rejects a skater without a stat", () => {
    const b = box()
    delete b.playerByGameStats.homeTeam.forwards[0].sog
    expect(nhlPlayersFrom(b, pbp())).toBeNull()
  })

  it("rejects a team with no goalies or no skaters listed", () => {
    const noGoalies = box()
    noGoalies.playerByGameStats.awayTeam.goalies = []
    expect(nhlPlayersFrom(noGoalies, pbp())).toBeNull()

    const noSkaters = box()
    noSkaters.playerByGameStats.homeTeam.forwards = []
    noSkaters.playerByGameStats.homeTeam.defense = []
    expect(nhlPlayersFrom(noSkaters, pbp())).toBeNull()

    const missing = box()
    delete missing.playerByGameStats.homeTeam.defense
    expect(nhlPlayersFrom(missing, pbp())).toBeNull()
  })
})

describe("matchPlayer on a real game", () => {
  it("is ambiguous for a duplicated name, unsure for a near miss, absent for an unknown surname", () => {
    const players = nhlPlayersFrom(fixture("boxscore-2026020206"), fixture("play-by-play-2026020206"))!
    // VAN dresses two Elias Petterssons (#40 C and #25 D).
    const both = [
      ...players,
      { playerId: 8480012, team: "VAN", line: null, ...personNames(["Elias"], ["Pettersson"]) },
      { playerId: 8483678, team: "VAN", line: null, ...personNames(["Elias"], ["Pettersson"]) },
    ]
    const m = matchPlayer(both, "Elias Pettersson")
    expect(m.kind).toBe("ambiguous")
    expect(m.kind === "ambiguous" && m.candidates.map((p) => p.playerId)).toEqual([8480012, 8483678])

    expect(matchPlayer(players, "Seth Jarvis").kind).toBe("found")
    expect(matchPlayer(players, "Erik Slavin").kind).toBe("unsure")
    expect(matchPlayer(players, "Kyle Connor").kind).toBe("absent")
  })
})
