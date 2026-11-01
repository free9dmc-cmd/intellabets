import * as fs from "fs"
import * as path from "path"
import { Logger } from "@nestjs/common"
import type { PrismaService } from "../../common/prisma/prisma.service"
import { NhlPropsGrader } from "./nhl-props.grader"
import { NhlStatsService, nhlPlayersFrom, type NhlGameStats } from "./nhl-stats.service"
import { personNames } from "./player-names"

// Grades props against the real CBJ @ CAR box score (2026020206, final):
// Svechnikov G0 A0 P0 SOG1, Jarvis G0 A2 P2 SOG3, Kochetkov in goal.

Logger.overrideLogger(false)

const FIXTURES = path.join(__dirname, "__fixtures__/nhl")
const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"))

const GAME: NhlGameStats = {
  gameId: 2026020206,
  players: nhlPlayersFrom(fixture("boxscore-2026020206"), fixture("play-by-play-2026020206"))!,
}

const EVENT = "0a1b2c3d4e5f60718293a4b5c6d7e8f9"
const START = new Date("2026-10-29T23:10:00Z")

interface Row {
  id: string
  outcomeId: string
}

function prop(id: string, statKey: string, player: string, side: "Over" | "Under", point: number): Row {
  return { id, outcomeId: `${EVENT}:${statKey}:${player}:${side}:${point}` }
}

function grader(rows: Row[], game: NhlGameStats | null = GAME) {
  const updates: { where: { id: string }; data: Record<string, unknown> }[] = []
  const findMany = jest.fn(async () => rows)
  const prisma = {
    prediction: {
      findMany,
      update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push(args)
        return args
      }),
    },
  }
  const stats = new NhlStatsService()
  const getGameStats = jest.spyOn(stats, "getGameStats").mockResolvedValue(game)
  const g = new NhlPropsGrader(prisma as unknown as PrismaService, stats)
  const statusOf = (id: string) => updates.find((u) => u.where.id === id)?.data.status ?? "pending"
  return { g, updates, findMany, getGameStats, statusOf }
}

describe("NhlPropsGrader.settle", () => {
  afterEach(() => jest.restoreAllMocks())

  it("makes no NHL call when the game has no pending props", async () => {
    const { g, findMany, getGameStats } = grader([])
    await expect(g.settle("game-1", "Carolina Hurricanes", "Columbus Blue Jackets", START)).resolves.toBe(0)
    expect(findMany).toHaveBeenCalledWith({ where: { gameId: "game-1", status: "pending", marketType: "prop" } })
    expect(getGameStats).not.toHaveBeenCalled()
  })

  it("leaves everything pending while the game is not final", async () => {
    const { g, updates, getGameStats } = grader([prop("p1", "player_points", "Seth Jarvis", "Over", 1.5)], null)
    await expect(g.settle("game-1", "Carolina Hurricanes", "Columbus Blue Jackets", START)).resolves.toBe(0)
    expect(getGameStats).toHaveBeenCalledWith(START, "Carolina Hurricanes", "Columbus Blue Jackets")
    expect(updates).toEqual([])
  })

  it("grades won, lost and push from the box score, and voids a player who did not dress", async () => {
    const rows = [
      prop("sv-sog-o0.5", "player_shots_on_goal", "Andrei Svechnikov", "Over", 0.5),
      prop("sv-sog-o1.5", "player_shots_on_goal", "Andrei Svechnikov", "Over", 1.5),
      prop("sv-sog-u1.5", "player_shots_on_goal", "Andrei Svechnikov", "Under", 1.5),
      prop("sv-pts-o0.5", "player_points", "Andrei Svechnikov", "Over", 0.5),
      prop("ja-pts-o1.5", "player_points", "Seth Jarvis", "Over", 1.5),
      prop("ja-pts-u1.5", "player_points", "Seth Jarvis", "Under", 1.5),
      prop("ja-sog-o3", "player_shots_on_goal", "Seth Jarvis", "Over", 3),
      prop("ja-sog-u3", "player_shots_on_goal", "Seth Jarvis", "Under", 3),
      prop("kc-pts-o0.5", "player_points", "Kyle Connor", "Over", 0.5),
    ]
    const { g, updates, statusOf } = grader(rows)
    await expect(g.settle("game-1", "Carolina Hurricanes", "Columbus Blue Jackets", START)).resolves.toBe(9)

    expect(statusOf("sv-sog-o0.5")).toBe("won")
    expect(statusOf("sv-sog-o1.5")).toBe("lost")
    expect(statusOf("sv-sog-u1.5")).toBe("won")
    expect(statusOf("sv-pts-o0.5")).toBe("lost")
    expect(statusOf("ja-pts-o1.5")).toBe("won")
    expect(statusOf("ja-pts-u1.5")).toBe("lost")
    expect(statusOf("ja-sog-o3")).toBe("push")
    expect(statusOf("ja-sog-u3")).toBe("push")
    expect(statusOf("kc-pts-o0.5")).toBe("void")

    // Only the result and when: no odds, CLV or other columns are touched.
    for (const u of updates) {
      expect(Object.keys(u.data).sort()).toEqual(["settledAt", "status"])
      expect(u.data.settledAt).toBeInstanceOf(Date)
    }
  })

  it("matches names the way the odds feed writes them (no accents)", async () => {
    const { g, statusOf } = grader([prop("va", "player_shots_on_goal", "Juuso Valimaki", "Under", 0.5)])
    await expect(g.settle("game-1", "Carolina Hurricanes", "Columbus Blue Jackets", START)).resolves.toBe(1)
    expect(statusOf("va")).toBe("won") // Välimäki: 0 shots
  })

  it("leaves ambiguous, uncertain, statless and unreadable props pending, logging each id", async () => {
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined)
    const withTwins: NhlGameStats = {
      ...GAME,
      players: [
        ...GAME.players,
        { playerId: 8480012, team: "VAN", line: { goals: 0, assists: 0, points: 0, sog: 0 }, ...personNames(["Elias"], ["Pettersson"]) },
        { playerId: 8483678, team: "VAN", line: { goals: 0, assists: 0, points: 0, sog: 0 }, ...personNames(["Elias"], ["Pettersson"]) },
      ],
    }
    const rows = [
      prop("twin", "player_points", "Elias Pettersson", "Over", 0.5),
      prop("near", "player_points", "Erik Slavin", "Over", 0.5),
      prop("goalie", "player_points", "Pyotr Kochetkov", "Over", 0.5),
      prop("wrong-stat", "player_assists", "Seth Jarvis", "Over", 0.5),
      { id: "garbled", outcomeId: `${EVENT}:player_points:Seth Jarvis:Over` },
      prop("ok", "player_points", "Seth Jarvis", "Over", 0.5),
    ]
    const { g, updates, statusOf } = grader(rows, withTwins)
    await expect(g.settle("game-1", "Carolina Hurricanes", "Columbus Blue Jackets", START)).resolves.toBe(1)

    expect(updates.map((u) => u.where.id)).toEqual(["ok"])
    expect(statusOf("ok")).toBe("won")
    const logged = warn.mock.calls.map((c) => String(c[0]))
    for (const id of ["twin", "near", "goalie", "wrong-stat", "garbled"]) {
      expect(statusOf(id)).toBe("pending")
      expect(logged.some((m) => m.includes(`Prop ${id} left pending`))).toBe(true)
    }
  })
})
