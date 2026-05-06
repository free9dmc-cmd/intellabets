import { Injectable } from "@nestjs/common"
import { randomUUID } from "crypto"
import { fromAmerican } from "../utils/odds-normalizer"
import type { ISportsbookProvider } from "./provider.interface"
import type {
  Market,
  MarketLine,
  PropBet,
  ProviderHealth,
  PseudoBetRequest,
  PseudoBetResult,
  ListMarketsOptions,
  GetPropsOptions,
  Sport,
} from "../types/provider.types"

// ─── Sample game fixtures ─────────────────────────────────────────────────────

interface GameFixture {
  sport: Sport
  league: string
  homeTeam: string
  awayTeam: string
  spreadHome: number   // home team spread, e.g. -6.5
  totalLine: number    // e.g. 224.5
  homeML: number       // American moneyline for home
  awayML: number
  daysFromNow: number
}

const FIXTURES: GameFixture[] = [
  { sport: "NFL", league: "NFL", homeTeam: "Kansas City Chiefs", awayTeam: "Las Vegas Raiders", spreadHome: -6.5, totalLine: 44.5, homeML: -275, awayML: +225, daysFromNow: 0 },
  { sport: "NFL", league: "NFL", homeTeam: "Philadelphia Eagles", awayTeam: "Dallas Cowboys", spreadHome: -3, totalLine: 47, homeML: -155, awayML: +130, daysFromNow: 0 },
  { sport: "NFL", league: "NFL", homeTeam: "San Francisco 49ers", awayTeam: "Seattle Seahawks", spreadHome: -4.5, totalLine: 42.5, homeML: -200, awayML: +168, daysFromNow: 1 },
  { sport: "NFL", league: "NFL", homeTeam: "Green Bay Packers", awayTeam: "Chicago Bears", spreadHome: -7, totalLine: 40, homeML: -310, awayML: +248, daysFromNow: 1 },
  { sport: "NBA", league: "NBA", homeTeam: "Golden State Warriors", awayTeam: "LA Lakers", spreadHome: -2.5, totalLine: 224.5, homeML: -130, awayML: +110, daysFromNow: 0 },
  { sport: "NBA", league: "NBA", homeTeam: "Boston Celtics", awayTeam: "Miami Heat", spreadHome: -4.5, totalLine: 214, homeML: -190, awayML: +158, daysFromNow: 0 },
  { sport: "NBA", league: "NBA", homeTeam: "Denver Nuggets", awayTeam: "Phoenix Suns", spreadHome: -3, totalLine: 229, homeML: -148, awayML: +124, daysFromNow: 1 },
  { sport: "MLB", league: "MLB", homeTeam: "New York Yankees", awayTeam: "Boston Red Sox", spreadHome: -1.5, totalLine: 8.5, homeML: -145, awayML: +122, daysFromNow: 0 },
  { sport: "MLB", league: "MLB", homeTeam: "LA Dodgers", awayTeam: "San Francisco Giants", spreadHome: -1.5, totalLine: 7.5, homeML: -175, awayML: +147, daysFromNow: 0 },
  { sport: "NHL", league: "NHL", homeTeam: "Toronto Maple Leafs", awayTeam: "Montreal Canadiens", spreadHome: -1.5, totalLine: 5.5, homeML: -185, awayML: +152, daysFromNow: 1 },
]

const PROP_TEMPLATES = [
  { propType: "Passing Yards", category: "passing" as const, playerName: "Patrick Mahomes", team: "Kansas City Chiefs", sport: "NFL", line: 287.5, overOdds: -118, underOdds: -104 },
  { propType: "Passing Touchdowns", category: "passing" as const, playerName: "Patrick Mahomes", team: "Kansas City Chiefs", sport: "NFL", line: 2.5, overOdds: -140, underOdds: +118 },
  { propType: "Rushing Yards", category: "rushing" as const, playerName: "Derrick Henry", team: "Dallas Cowboys", sport: "NFL", line: 74.5, overOdds: -112, underOdds: -110 },
  { propType: "Receiving Yards", category: "receiving" as const, playerName: "Tyreek Hill", team: "Miami Dolphins", sport: "NFL", line: 82.5, overOdds: -115, underOdds: -107 },
  { propType: "Points", category: "scoring" as const, playerName: "LeBron James", team: "LA Lakers", sport: "NBA", line: 24.5, overOdds: -118, underOdds: -104 },
  { propType: "Rebounds", category: "rebounds" as const, playerName: "Nikola Jokic", team: "Denver Nuggets", sport: "NBA", line: 12.5, overOdds: -130, underOdds: +108 },
  { propType: "Assists", category: "assists" as const, playerName: "Nikola Jokic", team: "Denver Nuggets", sport: "NBA", line: 9.5, overOdds: -108, underOdds: -114 },
  { propType: "3-Pointers Made", category: "scoring" as const, playerName: "Stephen Curry", team: "Golden State Warriors", sport: "NBA", line: 4.5, overOdds: +104, underOdds: -126 },
]

// ─── Provider ─────────────────────────────────────────────────────────────────

@Injectable()
export class MockProvider implements ISportsbookProvider {
  readonly name = "mock"
  readonly displayName = "Mock Provider (Dev)"
  readonly supportsLive = false

  async listMarkets(options: ListMarketsOptions = {}): Promise<Market[]> {
    await this.simulateLatency()

    const { sport, limit = 20 } = options
    const filtered = sport
      ? FIXTURES.filter((f) => f.sport === sport)
      : FIXTURES

    return filtered.slice(0, limit).map((f) => this.buildMarket(f))
  }

  async getOdds(gameId: string): Promise<Market> {
    await this.simulateLatency()

    const fixture = FIXTURES.find((f) => this.buildGameId(f) === gameId)
    if (!fixture) {
      // Return first fixture as fallback for any unknown ID
      return this.buildMarket(FIXTURES[0])
    }
    return this.buildMarket(fixture)
  }

  async getProps(gameId: string, options: GetPropsOptions = {}): Promise<PropBet[]> {
    await this.simulateLatency()

    const { category, playerId } = options
    let templates = PROP_TEMPLATES

    if (category) templates = templates.filter((t) => t.category === category)
    if (playerId) templates = templates.filter((t) => t.playerName === playerId)

    return templates.map((t) => this.buildProp(gameId, t))
  }

  async placePseudoBet(request: PseudoBetRequest): Promise<PseudoBetResult> {
    await this.simulateLatency()

    const potentialReturn = parseFloat(
      (request.stake * request.odds.decimal).toFixed(2)
    )

    const settlement = new Date()
    settlement.setHours(settlement.getHours() + 4)

    return {
      success: true,
      betId: randomUUID(),
      reference: `MOCK-${Date.now().toString(36).toUpperCase()}`,
      placedAt: new Date(),
      estimatedSettlement: settlement,
      stake: request.stake,
      potentialReturn,
      message: "Mock bet recorded. No real money placed.",
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      healthy: true,
      latencyMs: Math.floor(Math.random() * 50) + 10,
      checkedAt: new Date(),
    }
  }

  // ─── Builders ───────────────────────────────────────────────────────────────

  private buildMarket(f: GameFixture): Market {
    const gameId = this.buildGameId(f)
    const commence = new Date()
    commence.setDate(commence.getDate() + f.daysFromNow)
    commence.setHours(19, 30, 0, 0)

    // Add small random variance to simulate live odds movement
    const jitter = () => (Math.random() - 0.5) * 4

    const markets: MarketLine[] = [
      {
        id: `${gameId}:moneyline`,
        type: "moneyline",
        name: "moneyline",
        rawName: "h2h",
        outcomes: [
          {
            id: `${gameId}:ml:home`,
            name: f.homeTeam,
            description: `${f.homeTeam} to win`,
            odds: fromAmerican(Math.round(f.homeML + jitter())),
            isMain: true,
          },
          {
            id: `${gameId}:ml:away`,
            name: f.awayTeam,
            description: `${f.awayTeam} to win`,
            odds: fromAmerican(Math.round(f.awayML + jitter())),
            isMain: true,
          },
        ],
        lastUpdated: new Date(),
      },
      {
        id: `${gameId}:spread`,
        type: "spread",
        name: "spread",
        rawName: "spreads",
        outcomes: [
          {
            id: `${gameId}:spread:home`,
            name: f.homeTeam,
            description: `${f.homeTeam} ${f.spreadHome > 0 ? "+" : ""}${f.spreadHome}`,
            odds: fromAmerican(-110),
            point: f.spreadHome,
            isMain: true,
          },
          {
            id: `${gameId}:spread:away`,
            name: f.awayTeam,
            description: `${f.awayTeam} ${f.spreadHome > 0 ? "" : "+"}${-f.spreadHome}`,
            odds: fromAmerican(-110),
            point: -f.spreadHome,
            isMain: true,
          },
        ],
        lastUpdated: new Date(),
      },
      {
        id: `${gameId}:total`,
        type: "total",
        name: "total",
        rawName: "totals",
        outcomes: [
          {
            id: `${gameId}:total:over`,
            name: "Over",
            description: `Over ${f.totalLine}`,
            odds: fromAmerican(-110),
            point: f.totalLine,
            isMain: true,
          },
          {
            id: `${gameId}:total:under`,
            name: "Under",
            description: `Under ${f.totalLine}`,
            odds: fromAmerican(-110),
            point: f.totalLine,
            isMain: true,
          },
        ],
        lastUpdated: new Date(),
      },
    ]

    return {
      id: gameId,
      canonicalId: `${f.sport}:${f.homeTeam}:${f.awayTeam}:${commence.toISOString().slice(0, 10)}`,
      sport: f.sport,
      league: f.league,
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
      commenceTime: commence,
      provider: this.name,
      isLive: false,
      markets,
    }
  }

  private buildProp(gameId: string, t: (typeof PROP_TEMPLATES)[0]): PropBet {
    const id = `${gameId}:prop:${t.playerName.replace(/\s/g, "_")}:${t.propType.replace(/\s/g, "_")}`
    return {
      id,
      gameId,
      playerName: t.playerName,
      team: t.team,
      propType: t.propType,
      category: t.category,
      line: t.line,
      outcomes: [
        {
          id: `${id}:over`,
          name: "Over",
          description: `Over ${t.line} ${t.propType}`,
          odds: fromAmerican(t.overOdds),
          point: t.line,
          isMain: true,
        },
        {
          id: `${id}:under`,
          name: "Under",
          description: `Under ${t.line} ${t.propType}`,
          odds: fromAmerican(t.underOdds),
          point: t.line,
          isMain: true,
        },
      ],
      provider: this.name,
      lastUpdated: new Date(),
    }
  }

  private buildGameId(f: GameFixture): string {
    return `mock:${f.sport.toLowerCase()}:${f.homeTeam.replace(/\s/g, "_").toLowerCase()}:${f.awayTeam.replace(/\s/g, "_").toLowerCase()}`
  }

  private simulateLatency(): Promise<void> {
    return new Promise((r) => setTimeout(r, Math.random() * 60 + 20))
  }
}
