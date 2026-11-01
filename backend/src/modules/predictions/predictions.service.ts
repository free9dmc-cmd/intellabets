import { Injectable, Logger } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { PrismaService } from "../../common/prisma/prisma.service"
import { PredictionEngineService } from "./prediction-engine.service"
import { AIAnalystService } from "./ai-analyst.service"
import { OddsAggregatorService, OddsApiError } from "../ingestion/odds-aggregator.service"
import type { GameBooks } from "../ingestion/odds-aggregator.service"
import { GRADED_PROP_SPORT_KEYS, parsePropOutcomeId } from "../ingestion/prop-markets"
import { RealtimeService } from "../realtime/realtime.service"
import { MlbStatsService } from "./mlb-stats.service"
import { NhlPropsGrader } from "./nhl-props.grader"
import {
  HOLDS_GAME_LINES,
  HOLDS_PROPS,
  MAX_PRICE_AGE_MS,
  boardSideKey,
  booksByMarketFrom,
  gameLinesFrom,
  inProbBand,
  isGameLine,
  propFields,
  propsFrom,
  propsMaxPriceAgeMs,
  type BoardKind,
} from "./board-helpers"
import {
  STRATEGIES,
  computeLineMovement,
  matchesStrategy,
  scoreForStrategy,
  type StrategyKey,
} from "./strategies"
import { buildPlacementGuide, compareBooks, resolveBookKey } from "./placement"
import type { BookOption, BookPriceInput } from "./placement"
import { buildParlayLink, getSportsbook, isRoutableBook } from "./deeplinks"
import type { DeepLink } from "./deeplinks"
import type { BookMarket } from "./devig"
import type { EngineConfig } from "./prediction.types"
import type { Sport } from "../sportsbook/types/provider.types"

@Injectable()
export class PredictionsService {
  private readonly logger = new Logger(PredictionsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: PredictionEngineService,
    private readonly ai: AIAnalystService,
    private readonly aggregator: OddsAggregatorService,
    private readonly realtime: RealtimeService,
    private readonly mlbStats: MlbStatsService,
    private readonly nhlProps: NhlPropsGrader
  ) {}

  /**
   * End-to-end ingestion + prediction for one sport:
   *  1. pull the multi-book slate
   *  2. upsert games + snapshot odds
   *  3. run the de-vig/EV engine
   *  4. AI-review the value bets
   *  5. persist non-"pass" predictions
   */
  async ingestAndPredict(sportKey: string, config: EngineConfig = {}): Promise<{ games: number; predictions: number }> {
    if (!this.aggregator.isConfigured()) {
      this.logger.warn("THE_ODDS_API_KEY not configured — skipping ingestion")
      return { games: 0, predictions: 0 }
    }

    const slate = await this.aggregator.fetchSlate(sportKey)
    let predictionCount = 0
    for (const gb of slate) {
      predictionCount += await this.analyzeAndPersist(gb, { config, sportKey, allowStarted: false })
    }

    this.logger.log(`${sportKey}: ${slate.length} games, ${predictionCount} new predictions`)
    return { games: slate.length, predictions: predictionCount }
  }

  /**
   * Ingest LIVE (in-play) game markets and generate predictions on them.
   * Same engine, but analyses games that have already started and aren't final.
   */
  async ingestLiveAndPredict(sportKey: string, config: EngineConfig = {}): Promise<{ games: number; predictions: number }> {
    if (!this.aggregator.isConfigured()) return { games: 0, predictions: 0 }

    const slate = await this.aggregator.fetchSlate(sportKey)
    const live = slate.filter((gb) => gb.commenceTime.getTime() <= Date.now())
    let predictionCount = 0
    for (const gb of live) {
      predictionCount += await this.analyzeAndPersist(gb, { config, sportKey, allowStarted: true, isLive: true })
    }

    this.logger.log(`${sportKey} LIVE: ${live.length} in-play games, ${predictionCount} predictions`)
    return { games: live.length, predictions: predictionCount }
  }

  /**
   * Ingest player props for a sport's next events now (the admin endpoint;
   * the scheduled props job is PropsIngestService). Each event call costs
   * (markets x regions) credits and is written to the PropsFetch ledger, so it
   * counts toward the props job's monthly cap. Engine +EV prop picks are only
   * created for sports whose props can be graded (GRADED_PROP_SPORT_KEYS);
   * for the others the call stores the props snapshot for the board only.
   */
  async ingestPropsAndPredict(
    sportKey: string,
    maxEvents = 5,
    config: EngineConfig = {}
  ): Promise<{ events: number; predictions: number; credits: number }> {
    if (!this.aggregator.isConfigured()) return { events: 0, predictions: 0, credits: 0 }
    const markets = this.aggregator.propMarketsFor(sportKey)
    if (markets.length === 0) {
      this.logger.warn(`No prop markets configured for ${sportKey}`)
      return { events: 0, predictions: 0, credits: 0 }
    }

    const listing = await this.aggregator.fetchEvents(sportKey)
    let credits = 0
    if (listing.cost) {
      this.logger.error(`${sportKey}: the events listing cost ${listing.cost} credits; it is no longer free`)
      await this.prisma.propsFetch.create({ data: { sportKey, kind: "listing", cost: listing.cost } })
      credits += listing.cost
    }
    // Soonest first. Started games are left out (their pregame props are
    // gone), and so are games more than 36 hours away, whose props are rarely
    // posted yet, so maxEvents goes to games that have them.
    const now = Date.now()
    const targets = listing.events
      .filter((e) => e.commenceTime.getTime() > now && e.commenceTime.getTime() <= now + MANUAL_PROPS_HORIZON_MS)
      .sort((a, b) => a.commenceTime.getTime() - b.commenceTime.getTime())
      .slice(0, maxEvents)

    const estimate = markets.length * this.aggregator.propsRegions().split(",").length
    let predictionCount = 0
    for (const ev of targets) {
      // Claim the call in the ledger first, at the estimate, so it counts even
      // if the process dies mid-call; the real cost replaces it below.
      const claim = await this.prisma.propsFetch.create({
        data: { sportKey, eventId: ev.id, slot: null, kind: "manual", cost: estimate },
        select: { id: true },
      })
      let fetched: Awaited<ReturnType<OddsAggregatorService["fetchEventProps"]>>
      try {
        fetched = await this.aggregator.fetchEventProps(sportKey, ev.id)
      } catch (err) {
        // The claim keeps the estimate: a failed call may still have been charged.
        credits += estimate
        // A rejected key or an exhausted quota fails every later call too.
        if (err instanceof OddsApiError && err.isAuthFailure) throw err
        this.logger.error(
          `${ev.awayTeam} @ ${ev.homeTeam}: props fetch failed: ${err instanceof Error ? err.message : String(err)}`
        )
        continue
      }
      const gb = fetched.books
      const marketCount = gb?.booksByMarket.size ?? 0
      const cost = fetched.cost ?? estimate
      credits += cost
      await this.prisma.propsFetch.update({ where: { id: claim.id }, data: { cost, markets: marketCount } })
      this.logger.log(`${ev.awayTeam} @ ${ev.homeTeam}: ${marketCount} prop markets posted (${cost} credits)`)
      if (!gb || marketCount === 0) continue
      predictionCount += await this.analyzeAndPersist(gb, { config, sportKey, allowStarted: false, isProp: true })
    }

    this.logger.log(`${sportKey} PROPS: ${targets.length} events, ${predictionCount} predictions, ${credits} credits`)
    return { events: targets.length, predictions: predictionCount, credits }
  }

  /**
   * Store one event's player props for the board: upsert the game and save a
   * props snapshot, with no engine run and no picks. The scheduled props job
   * calls this, so it never marks a game live.
   */
  async savePropsSnapshot(gb: GameBooks): Promise<void> {
    await this.saveSnapshot(gb, { isLive: false, isProp: true })
  }

  /** Upsert a game by its canonical id and snapshot every book's odds for it. */
  private async saveSnapshot(gb: GameBooks, opts: { isLive: boolean; isProp: boolean }) {
    const minsToStart = (gb.commenceTime.getTime() - Date.now()) / 60000

    const game = await this.prisma.game.upsert({
      where: { canonicalId: gb.canonicalId },
      create: {
        canonicalId: gb.canonicalId,
        externalId: gb.externalId,
        sport: gb.sport,
        league: gb.league,
        homeTeam: gb.homeTeam,
        awayTeam: gb.awayTeam,
        commenceTime: gb.commenceTime,
        status: opts.isLive ? "live" : "scheduled",
      },
      update: { commenceTime: gb.commenceTime, ...(opts.isLive ? { status: "live" } : {}) },
    })

    // Flag any pregame snapshot inside the last hour before kickoff. The old
    // window (10 minutes before to 5 after) was both narrower than the default
    // 30-minute poll interval -- so most games never got a flagged snapshot at
    // all -- and open on the wrong side, since a snapshot 5 minutes after
    // kickoff is an in-play price, not a closing one. Several snapshots may
    // now qualify; the reader takes the latest, which is the one we want.
    // Closing prices are read from game-line snapshots only, so a props
    // snapshot is never flagged.
    const isClosing = !opts.isProp && minsToStart > 0 && minsToStart <= 60
    await this.prisma.oddsSnapshot.create({
      data: {
        gameId: game.id,
        provider: "the-odds-api",
        isClosing,
        markets: serializeBooks(gb.booksByMarket) as Prisma.InputJsonValue,
      },
    })
    return { game, minsToStart }
  }

  /**
   * Shared path: upsert game, snapshot odds, run the engine, AI-review, persist
   * surviving +EV bets, and broadcast them. Returns the number persisted.
   */
  private async analyzeAndPersist(
    gb: GameBooks,
    opts: { config: EngineConfig; sportKey: string; allowStarted: boolean; isProp?: boolean; isLive?: boolean }
  ): Promise<number> {
    const { game, minsToStart } = await this.saveSnapshot(gb, { isLive: !!opts.isLive, isProp: !!opts.isProp })

    // Pre-game jobs only predict on games that haven't started.
    if (!opts.allowStarted && minsToStart <= 0) return 0
    // A prop pick in a sport with no grader would stay pending forever, so
    // those props are kept for the board only.
    if (opts.isProp && !GRADED_PROP_SPORT_KEYS.has(opts.sportKey)) return 0

    const valueBets = this.engine.analyzeGame(
      { id: game.id, canonicalId: gb.canonicalId, sport: gb.sport, homeTeam: gb.homeTeam, awayTeam: gb.awayTeam, commenceTime: gb.commenceTime },
      gb.booksByMarket,
      opts.config
    )
    if (valueBets.length === 0) return 0

    const reviewed = await this.ai.review(valueBets)
    const keep = reviewed.filter((r) => r.aiVerdict !== "pass")

    let count = 0
    for (const p of keep) {
      // Props carry the engine's internal market key; normalise to "prop".
      if (opts.isProp) p.marketType = "prop"

      const existing = await this.prisma.prediction.findFirst({
        where: { gameId: game.id, outcomeId: p.outcomeId, status: "pending", userId: null, source: "engine" },
      })
      if (existing) continue

      await this.prisma.prediction.create({
        data: {
          gameId: game.id,
          userId: null,
          marketType: p.marketType,
          outcomeId: p.outcomeId,
          selection: p.selection,
          outcomeName: p.outcomeName,
          point: p.point,
          fairProbability: p.fairProbability,
          offeredOdds: p.offeredDecimal,
          offeredBook: p.offeredBook,
          edgePercent: p.edgePercent,
          kellyStake: p.kellyStake,
          confidence: p.confidence,
          reasoning: p.reasoning,
        },
      })
      count++
      await this.realtime.newPrediction(p)
    }
    return count
  }

  /**
   * Settle completed games: mark closing snapshot, grade predictions, compute CLV.
   */
  async settleSport(sportKey: string): Promise<{ settled: number }> {
    if (!this.aggregator.isConfigured()) return { settled: 0 }

    const scores = await this.aggregator.fetchScores(sportKey, 2)
    let settled = 0
    const propGraders: Record<string, (gameId: string, home: string, away: string, start: Date) => Promise<number>> = {
      baseball_mlb: (...args) => this.settleMlbProps(...args),
      icehockey_nhl: (...args) => this.nhlProps.settle(...args),
    }

    for (const s of scores) {
      if (s.homeScore == null || s.awayScore == null) continue

      const game = await this.prisma.game.findFirst({ where: { externalId: s.externalId } })
      if (!game) continue

      await this.prisma.game.update({
        where: { id: game.id },
        data: { status: "final", homeScore: s.homeScore, awayScore: s.awayScore },
      })

      const closing = await this.getClosingDecimals(game.id, game.commenceTime)

      // Props can't be graded without a player-stats feed — skip them here.
      const preds = await this.prisma.prediction.findMany({
        where: { gameId: game.id, status: "pending", marketType: { not: "prop" } },
      })

      for (const pred of preds) {
        const result = gradeOutcome(pred, s.homeScore, s.awayScore, game.homeTeam, game.awayTeam)
        const closingDecimal = closing.get(pred.outcomeId)
        const clv = closingDecimal ? round((pred.offeredOdds / closingDecimal - 1) * 100, 2) : null

        await this.prisma.prediction.update({
          where: { id: pred.id },
          data: { status: result, closingOdds: closingDecimal ?? null, clv, settledAt: new Date() },
        })
        settled++
      }

      // Grade player props where a free stats feed exists (MLB Stats API,
      // NHL api-web). Chosen by sport key: NBA and NHL share stat keys such as
      // player_points, so the stat alone does not say which feed to ask.
      const gradeProps = propGraders[sportKey]
      if (gradeProps) settled += await gradeProps(game.id, game.homeTeam, game.awayTeam, game.commenceTime)
    }

    this.logger.log(`${sportKey}: settled ${settled} predictions`)
    return { settled }
  }

  /**
   * Grade pending MLB prop predictions for a finished game using real box-score
   * stats. Props DNP (player not in box score) are voided.
   */
  private async settleMlbProps(gameId: string, homeTeam: string, awayTeam: string, commenceTime: Date): Promise<number> {
    const props = await this.prisma.prediction.findMany({
      where: { gameId, status: "pending", marketType: "prop" },
    })
    if (props.length === 0) return 0

    const dateISO = commenceTime.toISOString().slice(0, 10)
    const stats = await this.mlbStats.getPlayerStats(dateISO, homeTeam, awayTeam)
    if (!stats) return 0

    let graded = 0
    for (const pred of props) {
      // outcomeId format: "<eventId>:<statKey>:<player>:<Over|Under>:<point>"
      const parts = pred.outcomeId.split(":")
      const statKey = parts[1]
      const player = parts[2]
      if (!statKey || !player || pred.point == null) continue

      const line = stats.get(player)
      let status: "won" | "lost" | "push" | "void"
      if (!line) {
        status = "void" // did not play
      } else {
        const actual = this.mlbStats.statForKey(statKey, line)
        if (actual == null) continue
        if (actual === pred.point) status = "push"
        else {
          const over = actual > pred.point
          const tookOver = pred.outcomeName.toLowerCase() === "over"
          status = over === tookOver ? "won" : "lost"
        }
      }

      await this.prisma.prediction.update({
        where: { id: pred.id },
        data: { status, settledAt: new Date() },
      })
      graded++
    }
    this.logger.log(`Graded ${graded} MLB props for game ${gameId}`)
    return graded
  }

  /** House predictions currently pending, newest & most confident first. */
  async listPending(sport?: string, limit = 50) {
    return this.prisma.prediction.findMany({
      where: { userId: null, source: "engine", status: "pending", ...(sport ? { game: { sport } } : {}) },
      include: { game: true },
      orderBy: [{ confidence: "desc" }, { edgePercent: "desc" }],
      take: limit,
    })
  }

  /**
   * Pending predictions filtered and ranked by a strategy.
   *
   * All strategies draw from the same pool of +EV bets — none of them invent
   * edge. Movement-based strategies (steam/contrarian) need at least two odds
   * snapshots for the game, so they return fewer picks early in a game's life.
   */
  async listByStrategy(strategy: StrategyKey, sport?: string, limit = 25) {
    const def = STRATEGIES[strategy]

    const candidates = await this.prisma.prediction.findMany({
      // Pregame picks stay "pending" until settlement, so without the time
      // filter a game already under way (whose pregame price is long gone)
      // would still be offered as a bet.
      where: {
        userId: null,
        source: "engine",
        status: "pending",
        game: { commenceTime: { gt: new Date() }, ...(sport ? { sport } : {}) },
      },
      include: { game: true },
      orderBy: [{ confidence: "desc" }],
      // Pull a wider pool than we return, since strategies filter it down.
      take: Math.max(limit * 6, 100),
    })

    // Movement needs snapshot history; only load it for strategies that use it.
    const movementByOutcome = new Map<string, ReturnType<typeof computeLineMovement>>()
    if (def.needsMovement) {
      const gameIds = Array.from(new Set(candidates.map((c) => c.gameId)))
      for (const gameId of gameIds) {
        const snaps = await this.prisma.oddsSnapshot.findMany({
          where: { gameId },
          orderBy: { capturedAt: "asc" },
          select: { markets: true },
        })
        if (snaps.length < 2) continue
        for (const c of candidates.filter((x) => x.gameId === gameId)) {
          movementByOutcome.set(c.outcomeId, computeLineMovement(snaps, c.outcomeId))
        }
      }
    }

    const enriched = candidates.map((c) => ({
      prediction: c,
      candidate: {
        fairProbability: c.fairProbability,
        confidence: c.confidence,
        edgePercent: c.edgePercent,
        movement: movementByOutcome.get(c.outcomeId) ?? null,
      },
    }))

    const picks = enriched
      .filter((e) => matchesStrategy(strategy, e.candidate))
      .sort((a, b) => scoreForStrategy(strategy, b.candidate) - scoreForStrategy(strategy, a.candidate))
      .slice(0, limit)

    return {
      strategy: def,
      count: picks.length,
      // Say so when a strategy came up empty, rather than implying no edge exists.
      note:
        picks.length === 0
          ? def.needsMovement
            ? "No qualifying picks yet — this strategy needs at least two odds snapshots per game, so it fills in as lines move."
            : "No current picks match this strategy."
          : undefined,
      predictions: picks.map((p) => ({
        ...p.prediction,
        lineMovement: p.candidate.movement
          ? {
              openImpliedProbability: round(p.candidate.movement.openProb, 4),
              currentImpliedProbability: round(p.candidate.movement.currentProb, 4),
              deltaPercentagePoints: round(p.candidate.movement.delta * 100, 2),
            }
          : null,
      })),
    }
  }

  /**
   * Every book's current price for one prediction, ranked by what it pays.
   *
   * Users bet where their money already is, so this shows their own book
   * alongside the best one and states the difference in dollars rather than
   * assuming they will open a new account.
   */
  async compareBooksFor(
    predictionId: string,
    stake = 100,
    preferredBook?: string | null,
    state?: string | null
  ) {
    const p = await this.prisma.prediction.findUnique({
      where: { id: predictionId },
      include: { game: true },
    })
    if (!p) return null

    const snap = await this.latestSnapshot(p.gameId, p.marketType)

    const comparison = compareBooks({
      selection: p.selection,
      matchup: `${p.game.awayTeam} @ ${p.game.homeTeam}`,
      stake,
      pricesByBook: snap ? pricesFromSnapshot(snap.markets, p.outcomeId) : new Map(),
      preferredBook,
      state,
    })

    return {
      ...comparison,
      pricesAsOf: snap?.capturedAt?.toISOString() ?? null,
      // Restated on every response: prices move, and a stale quote is the main
      // way a user ends up taking a bet that is no longer +EV.
      disclaimer:
        "Prices change constantly. Confirm the number in your sportsbook before placing — if it has moved against you, the edge may be gone.",
    }
  }

  /**
   * Every upcoming bet in a sport that licensed books price, best value first.
   *
   * This is the pool AI Picks builds from. Unlike the strategy lists it is not
   * limited to +EV picks: a bet whose price is below fair is included with its
   * true (negative) edge, so a slip can always be built and is always honest
   * about the price. With a book, only bets that book prices are returned, at
   * that book's price. Prices older than maxPriceAgeMs are left out: 90
   * minutes for game lines, PROPS_MAX_PRICE_AGE_MIN (330) for player props,
   * which are fetched only a couple of times per game.
   *
   * kind "props" offers player props (marketType "prop", with the player and
   * stat), one bet per player, stat and side. minProb/maxProb keep bets whose
   * win chance is in that band, before the limit, so a narrow band is not
   * emptied by better-edged bets outside it.
   */
  async board(
    opts: {
      sport?: string
      book?: string | null
      limit?: number
      kind?: BoardKind
      minProb?: number
      maxProb?: number
    } = {}
  ) {
    const now = Date.now()
    const kind: BoardKind = opts.kind ?? "lines"
    const props = kind === "props"
    const maxPriceAgeMs = props ? propsMaxPriceAgeMs() : MAX_PRICE_AGE_MS
    const limit = Math.min(Math.max(opts.limit ?? 60, 1), 200)
    const empty = {
      kind,
      candidates: [] as BoardCandidate[],
      pricesAsOf: null as string | null,
      booksWithPrices: [] as string[],
      maxPriceAgeMs,
    }
    const bookKey = resolveBookKey(opts.book)
    // Offshore and unregistered books are never offered, even when asked for.
    if (bookKey && !isRoutableBook(bookKey)) return empty
    const games = await this.prisma.game.findMany({
      where: {
        commenceTime: { gt: new Date(now), lt: new Date(now + BOARD_WINDOW_MS) },
        ...(opts.sport ? { sport: opts.sport } : {}),
      },
      orderBy: { commenceTime: "asc" },
      take: 200,
    })
    if (games.length === 0) return empty

    // The newest snapshot of this kind per game, picked in the database:
    // Prisma runs `distinct` in memory, which would load every snapshot's markets.
    const latest = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT ON ("gameId") id FROM "OddsSnapshot"
      WHERE "gameId" IN (${Prisma.join(games.map((g) => g.id))})
        AND "capturedAt" > ${utcTimestamp(new Date(now - maxPriceAgeMs))}::timestamp
        AND ${props ? HOLDS_PROPS : HOLDS_GAME_LINES}
      ORDER BY "gameId", "capturedAt" DESC`
    const snaps =
      latest.length === 0
        ? []
        : await this.prisma.oddsSnapshot.findMany({
            where: { id: { in: latest.map((r) => r.id) } },
            select: { gameId: true, markets: true, capturedAt: true },
          })
    const engineIds = new Map(
      (
        await this.prisma.prediction.findMany({
          where: { gameId: { in: games.map((g) => g.id) }, status: "pending", userId: null, source: "engine" },
          select: { id: true, gameId: true, outcomeId: true },
        })
      ).map((p) => [`${p.gameId}~${p.outcomeId}`, p.id])
    )
    const byId = new Map(games.map((g) => [g.id, g]))
    const booksWithPrices = new Set<string>()
    const candidates: BoardCandidate[] = []
    let oldest: Date | null = null

    for (const snap of snaps) {
      const game = byId.get(snap.gameId)
      if (!game) continue
      const booksByMarket = props ? propsFrom(snap.markets) : gameLinesFrom(snap.markets)
      for (const books of booksByMarket.values()) {
        for (const b of books) if (isRoutableBook(b.book)) booksWithPrices.add(b.book)
      }
      const bets = this.engine.analyzeGame(asEngineGame(game), booksByMarket, { minEdgePercent: -100 })
      const pricesAsOf = snap.capturedAt.toISOString()
      let used = false
      for (const bet of bets) {
        // A prop's marketType from the engine is its "<stat>|<player>" key.
        // Rows and candidates always say "prop"; the key travels as marketKey.
        // A prop whose outcome id cannot be read back could not become a leg.
        const prop = props ? propFields(bet.marketType, bet.outcomeId) : null
        if (props && !prop) continue
        let decimal = bet.offeredDecimal
        let book = bet.offeredBook
        if (bookKey) {
          const atBook = pricesFromSnapshot(snap.markets, bet.outcomeId).get(bookKey)
          if (!atBook) continue
          decimal = atBook.decimal
          book = bookKey
        }
        const ref = `${game.id}~${bet.outcomeId}`
        candidates.push({
          ref,
          predictionId: engineIds.get(ref) ?? null,
          gameId: game.id,
          outcomeId: bet.outcomeId,
          marketType: prop ? "prop" : bet.marketType,
          marketKey: prop?.marketKey ?? null,
          player: prop?.player ?? null,
          stat: prop?.stat ?? null,
          selection: bet.selection,
          outcomeName: bet.outcomeName,
          point: bet.point ?? null,
          fairProbability: bet.fairProbability,
          offeredOdds: decimal,
          offeredBook: book,
          edgePercent: Math.round((bet.fairProbability * decimal - 1) * 10000) / 100,
          confidence: bet.confidence,
          numBooks: bet.numBooks,
          pricesAsOf,
          game: {
            id: game.id,
            sport: game.sport,
            league: game.league,
            homeTeam: game.homeTeam,
            awayTeam: game.awayTeam,
            commenceTime: game.commenceTime.toISOString(),
          },
        })
        used = true
      }
      if (used && (!oldest || snap.capturedAt < oldest)) oldest = snap.capturedAt
    }

    candidates.sort((a, b) => b.edgePercent - a.edgePercent || b.confidence - a.confidence)
    // Without a book, one side of a market can appear at several numbers
    // (-3 and -3.5, or Over 24.5 and Over 25.5 points); keep its best-priced
    // one (see boardSideKey). The band is applied first, so a side keeps its
    // best number inside the band rather than vanishing with one outside it.
    const sides = new Set<string>()
    const board = candidates.filter((c) => {
      if (!inProbBand(c.fairProbability, opts)) return false
      const side = boardSideKey(c)
      if (sides.has(side)) return false
      sides.add(side)
      return true
    })
    return {
      kind,
      candidates: board.slice(0, limit),
      pricesAsOf: oldest?.toISOString() ?? null,
      booksWithPrices: Array.from(booksWithPrices).sort(),
      maxPriceAgeMs,
    }
  }

  /**
   * The prediction id for a board ref ("gameId~outcomeId"), creating a
   * source "board" prediction when there is none, so the leg gets the same
   * links, tracking and settlement as an engine pick. Null when the outcome is
   * not in the game's latest prices.
   */
  private async predictionIdForRef(ref: string): Promise<string | null> {
    const sep = ref.indexOf("~")
    if (sep <= 0) return null
    const gameId = ref.slice(0, sep)
    const outcomeId = ref.slice(sep + 1)
    const existing = await this.prisma.prediction.findFirst({
      where: { gameId, outcomeId, status: "pending", userId: null },
      // Prefer the engine's own pick for this outcome.
      orderBy: { source: "desc" },
      select: { id: true },
    })
    if (existing) return existing.id

    const game = await this.prisma.game.findUnique({ where: { id: gameId } })
    if (!game || game.commenceTime.getTime() <= Date.now()) return null
    // A ref is a game line or a player prop; a prop's outcome id names its
    // stat and player, so only that one market of the props snapshot is priced.
    const prop = parsePropOutcomeId(outcomeId)
    const snap = await this.latestSnapshot(gameId, prop ? "prop" : "moneyline")
    if (!snap) return null
    let markets: Map<string, BookMarket[]>
    if (prop) {
      const key = `${prop.statKey}|${prop.player}`
      markets = new Map(Array.from(propsFrom(snap.markets)).filter(([k]) => k === key))
    } else {
      markets = gameLinesFrom(snap.markets)
    }
    const bet = this.engine
      .analyzeGame(asEngineGame(game), markets, { minEdgePercent: -100 })
      .find((b) => b.outcomeId === outcomeId)
    if (!bet) return null
    // Settlement grades game lines by type and props as "prop"; any other
    // stored type would be graded a push, refunding a decided bet.
    const marketType = prop ? "prop" : bet.marketType
    if (marketType !== "prop" && !isGameLine(marketType)) return null
    return this.prisma.$transaction(async (tx) => {
      // Two users choosing the same bet at once must share one row: lock on
      // the ref, then look again before creating.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ref}))`
      const raced = await tx.prediction.findFirst({
        where: { gameId, outcomeId, status: "pending", userId: null },
        orderBy: { source: "desc" },
        select: { id: true },
      })
      if (raced) return raced.id
      const created = await tx.prediction.create({
        data: {
          gameId,
          userId: null,
          source: "board",
          marketType,
          outcomeId: bet.outcomeId,
          selection: bet.selection,
          outcomeName: bet.outcomeName,
          point: bet.point ?? null,
          fairProbability: bet.fairProbability,
          offeredOdds: bet.offeredDecimal,
          offeredBook: bet.offeredBook,
          edgePercent: bet.edgePercent,
          kellyStake: bet.kellyStake,
          confidence: bet.confidence,
        },
        select: { id: true },
      })
      return created.id
    })
  }

  /**
   * The newest snapshot of a game holding this kind of market. Game lines and
   * player props are captured by separate jobs into separate snapshots, so the
   * newest snapshot of any kind can be missing the market entirely. Anything
   * that is not a game line is a prop.
   */
  private async latestSnapshot(gameId: string, marketType: string) {
    const holds = isGameLine(marketType) ? HOLDS_GAME_LINES : HOLDS_PROPS
    const [row] = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "OddsSnapshot" WHERE "gameId" = ${gameId} AND ${holds}
      ORDER BY "capturedAt" DESC LIMIT 1`
    if (!row) return null
    return this.prisma.oddsSnapshot.findUnique({
      where: { id: row.id },
      select: { id: true, markets: true, capturedAt: true },
    })
  }

  /**
   * Several picks priced at ONE sportsbook: the betslip a user builds there.
   *
   * A parlay can only be placed at a single book, so this answers "what does my
   * book pay for these legs, and what do I tap to add each one". Each leg also
   * carries the best price anywhere for comparison. A leg the book does not
   * price comes back with atBook: null instead of being dropped, so the caller
   * can say which one to swap. The combined parlay price and the one-tap parlay
   * link exist only when the book prices every leg.
   *
   * Legs are given as prediction ids or as board refs; refs are turned into
   * predictions first. The win chance and edges are recomputed from the same
   * latest snapshot the prices come from, so every number on a leg agrees.
   */
  async betslipFor(
    ids: string[],
    opts: { book?: string | null; state?: string | null; stake?: number; refs?: string[] } = {}
  ) {
    const fromRefs: string[] = []
    // A ref whose outcome is no longer in the game's latest prices (the book
    // moved its number, or the game started) is returned by name rather than
    // dropped, so the caller can say the slip needs building again.
    const unresolvedRefs: string[] = []
    for (const ref of opts.refs ?? []) {
      const id = await this.predictionIdForRef(ref)
      if (id) fromRefs.push(id)
      else unresolvedRefs.push(ref)
    }
    const unique = Array.from(new Set([...ids.filter(Boolean), ...fromRefs])).slice(0, MAX_BETSLIP_LEGS)
    const stake = opts.stake && Number.isFinite(opts.stake) && opts.stake > 0 ? opts.stake : 10
    const preds = await this.prisma.prediction.findMany({
      where: { id: { in: unique } },
      include: { game: true },
    })
    const byId = new Map(preds.map((p) => [p.id, p]))
    const now = Date.now()

    // Offshore and unregistered books are never named or priced, even when asked for.
    const requested = resolveBookKey(opts.book)
    const bookKey = requested && isRoutableBook(requested) ? requested : null

    const legs: BetslipLeg[] = []
    const linkInputs: (BookPriceInput | null)[] = []
    const fairBySnapshot = new Map<string, Map<string, number>>()
    let oldestPrices: Date | null = null
    for (const id of unique) {
      const p = byId.get(id)
      if (!p) continue
      const snap = await this.latestSnapshot(p.gameId, p.marketType)
      if (snap && (!oldestPrices || snap.capturedAt < oldestPrices)) oldestPrices = snap.capturedAt
      const prices = snap ? pricesFromSnapshot(snap.markets, p.outcomeId) : new Map<string, BookPriceInput>()
      if (snap && !fairBySnapshot.has(snap.id)) {
        const bets = this.engine.analyzeGame(asEngineGame(p.game), booksByMarketFrom(snap.markets), { minEdgePercent: -100 })
        fairBySnapshot.set(snap.id, new Map(bets.map((b) => [b.outcomeId, b.fairProbability])))
      }
      // The stored value is a fallback for an outcome no longer in the prices.
      const fair = (snap && fairBySnapshot.get(snap.id)?.get(p.outcomeId)) ?? p.fairProbability
      const comparison = compareBooks({
        selection: p.selection,
        matchup: `${p.game.awayTeam} @ ${p.game.homeTeam}`,
        stake,
        pricesByBook: prices,
        preferredBook: bookKey,
        state: opts.state ?? null,
      })
      const atBook = comparison.preferred
      legs.push({
        predictionId: p.id,
        gameId: p.gameId,
        sport: p.game.sport,
        matchup: comparison.matchup,
        commenceTime: p.game.commenceTime.toISOString(),
        started: p.game.commenceTime.getTime() <= now,
        marketType: p.marketType,
        selection: p.selection,
        fairProbability: fair,
        confidence: p.confidence,
        pricesAsOf: snap?.capturedAt.toISOString() ?? null,
        atBook: atBook ? legPrice(atBook, fair) : null,
        best: comparison.best ? legPrice(comparison.best, fair) : null,
      })
      linkInputs.push(atBook ? prices.get(atBook.book) ?? null : null)
    }

    const entry = getSportsbook(bookKey)
    const allPriced = legs.length > 0 && legs.every((l) => l.atBook)
    // Kept at the snapshots' 4 dp so a one-leg slip matches its leg's price.
    const product = allPriced ? legs.reduce((acc, l) => acc * l.atBook!.oddsDecimal, 1) : null
    // The sourced multi-leg links are regular parlays. Books build same-game
    // parlays in their own flow, so legs sharing a game get per-leg links only.
    const distinctGames = new Set(legs.map((l) => l.gameId)).size === legs.length
    const parlayLink =
      allPriced && legs.length > 1 && bookKey && distinctGames
        ? buildParlayLink(
            bookKey,
            linkInputs.map((li) => ({
              providerLink: li?.link ?? null,
              outcomeSid: li?.outcomeSid ?? null,
              marketSid: li?.marketSid ?? null,
              eventSid: li?.eventSid ?? null,
            })),
            opts.state ?? null
          )
        : null

    const missing = legs.filter((l) => !l.atBook).length
    const notBetslip = legs.filter((l) => l.atBook && l.atBook.linkKind !== "betslip").length
    const bookName = entry?.name ?? bookKey
    let note: string
    if (!bookKey) note = "No sportsbook chosen, so each leg shows the best price at any licensed book. Pick your sportsbook to see its own prices."
    else if (legs.length === 0) note = "None of these picks were found."
    else if (unresolvedRefs.length > 0)
      note = `${unresolvedRefs.length} of these picks ${unresolvedRefs.length === 1 ? "is" : "are"} no longer in the latest prices, so ${unresolvedRefs.length === 1 ? "it was" : "they were"} left out. Build the slip again.`
    else if (missing > 0) note = `${bookName} has no current price for ${missing} of these ${legs.length} legs. Swap those legs or use another book.`
    else if (notBetslip > 0)
      note = `${notBetslip} of ${legs.length} legs open the game or ${bookName}'s home page rather than the betslip: find the selection there and add it yourself${legs.length > 1 ? ", then choose Parlay" : ""}.`
    else if (legs.length > 1 && !distinctGames)
      note = `Tap each leg to add it to your ${bookName} betslip, then choose Same Game Parlay there. ${bookName} sets the price.`
    else if (legs.length > 1 && !parlayLink)
      note = `Tap each leg to add it to your ${bookName} betslip, then choose Parlay there. ${bookName} sets the final parlay price.`
    else note = `Prices are from ${bookName}.`

    return {
      book: bookKey ? { key: bookKey, name: bookName } : null,
      stake,
      legs,
      combinedDecimal: product === null ? null : Math.round(product * 10000) / 10000,
      payout: product === null ? null : Math.round(stake * product * 100) / 100,
      parlayLink,
      note,
      pricesAsOf: oldestPrices?.toISOString() ?? null,
      unresolvedRefs,
      disclaimer:
        "Prices change constantly. Confirm every leg in your sportsbook before placing — if a price has moved against you, the edge may be gone.",
    }
  }

  /** Step-by-step instructions for placing one prediction at the best-priced book. */
  async placementGuide(predictionId: string, bankroll?: number) {
    const p = await this.prisma.prediction.findUnique({
      where: { id: predictionId },
      include: { game: true },
    })
    if (!p) return null
    return buildPlacementGuide(
      {
        marketType: p.marketType,
        selection: p.selection,
        outcomeName: p.outcomeName,
        point: p.point,
        offeredOdds: p.offeredOdds,
        offeredBook: p.offeredBook,
        kellyStake: p.kellyStake,
        edgePercent: p.edgePercent,
        game: {
          homeTeam: p.game.homeTeam,
          awayTeam: p.game.awayTeam,
          commenceTime: p.game.commenceTime,
          sport: p.game.sport,
        },
      },
      { bankroll }
    )
  }

  /**
   * Settlement results for a set of predictions.
   *
   * The consumer app tracks what users actually bet, but grading lives here
   * with the game data. Rather than duplicating scores and grading rules into
   * the web app, it asks for the outcome of the pick a bet was based on.
   */
  async resultsFor(ids: string[]) {
    if (ids.length === 0) return { results: [] }
    const rows = await this.prisma.prediction.findMany({
      where: { id: { in: ids.slice(0, 200) } },
      select: {
        id: true,
        status: true,
        settledAt: true,
        closingOdds: true,
        clv: true,
        game: { select: { status: true, homeScore: true, awayScore: true, homeTeam: true, awayTeam: true } },
      },
    })
    return {
      results: rows.map((r) => ({
        predictionId: r.id,
        status: r.status,
        settledAt: r.settledAt?.toISOString() ?? null,
        closingOdds: r.closingOdds,
        clv: r.clv,
        gameStatus: r.game.status,
        finalScore:
          r.game.homeScore != null && r.game.awayScore != null
            ? `${r.game.awayTeam} ${r.game.awayScore} - ${r.game.homeScore} ${r.game.homeTeam}`
            : null,
      })),
    }
  }

  /** How fresh the stored odds and picks are, for the ingestion status endpoint. */
  async feedStats() {
    const now = new Date()
    const [lastSnapshot, upcomingGames, livePicks, lastPick] = await Promise.all([
      this.prisma.oddsSnapshot.findFirst({ orderBy: { capturedAt: "desc" }, select: { capturedAt: true } }),
      this.prisma.game.count({ where: { commenceTime: { gt: now } } }),
      this.prisma.prediction.count({
        where: { userId: null, source: "engine", status: "pending", game: { commenceTime: { gt: now } } },
      }),
      this.prisma.prediction.findFirst({
        where: { userId: null, source: "engine" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ])
    return {
      lastSnapshotAt: lastSnapshot?.capturedAt.toISOString() ?? null,
      lastPickAt: lastPick?.createdAt.toISOString() ?? null,
      upcomingGames,
      livePicks,
    }
  }

  /** Rolling performance of house predictions — the honest scoreboard. */
  async performance() {
    const settled = await this.prisma.prediction.findMany({
      where: { userId: null, source: "engine", status: { in: ["won", "lost", "push"] } },
      select: { status: true, clv: true, edgePercent: true },
    })
    const wins = settled.filter((p) => p.status === "won").length
    const losses = settled.filter((p) => p.status === "lost").length
    const pushes = settled.filter((p) => p.status === "push").length
    const decided = wins + losses
    const clvs = settled.map((p) => p.clv).filter((c): c is number => c != null)

    return {
      total: settled.length,
      wins,
      losses,
      pushes,
      winRate: decided > 0 ? round((wins / decided) * 100, 1) : 0,
      avgClv: clvs.length ? round(clvs.reduce((s, c) => s + c, 0) / clvs.length, 2) : 0,
      positiveClvRate: clvs.length ? round((clvs.filter((c) => c > 0).length / clvs.length) * 100, 1) : 0,
    }
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async getClosingDecimals(gameId: string, commenceTime: Date): Promise<Map<string, number>> {
    // The closing line is the last price observed BEFORE the game started.
    //
    // This used to fall back to "the most recent snapshot for this game" when
    // no snapshot was flagged isClosing. Settlement runs after a game is
    // final, so that fallback routinely picked up an in-play or post-game
    // price -- a book pricing a team down 9-0 quotes something like 15.00
    // against a pregame 2.10, which records a CLV of -86% and says nothing
    // about whether the pick was good. Averaged in, a handful of those drag
    // the whole scoreboard negative.
    //
    // The isClosing flag is only a hint (it depends on a poll happening to
    // land in a narrow window before kickoff, which at a 30-minute poll
    // interval often does not happen). Correctness comes from the capturedAt
    // bound instead: prefer a flagged snapshot, but only ever consider
    // snapshots taken before commenceTime. Only game-line predictions are
    // graded here, so a later props-only snapshot must not stand in.
    const [row] = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "OddsSnapshot"
      WHERE "gameId" = ${gameId}
        AND "capturedAt" < ${utcTimestamp(commenceTime)}::timestamp
        AND ${HOLDS_GAME_LINES}
      ORDER BY "isClosing" DESC, "capturedAt" DESC LIMIT 1`
    const target = row
      ? await this.prisma.oddsSnapshot.findUnique({ where: { id: row.id }, select: { markets: true } })
      : null

    // No pregame snapshot means no honest closing line. Leave CLV null rather
    // than inventing one from a price that was never available pregame.
    if (!target) return new Map()

    const map = new Map<string, number>()
    const books = target.markets as unknown as StoredBooks
    for (const marketBooks of Object.values(books)) {
      for (const bm of marketBooks) {
        for (const o of bm.line.outcomes) {
          // Keep the best (highest) closing price seen across books per outcome.
          const prev = map.get(o.id) ?? 0
          if (o.odds.decimal > prev) map.set(o.id, o.odds.decimal)
        }
      }
    }
    return map
  }
}

// ─── serialization + grading ──────────────────────────────────────────────────

/** Read-side shape of a stored OddsSnapshot.markets JSON blob. */
type StoredBooks = Record<
  string,
  { book: string; line: { outcomes: { id: string; odds: { decimal: number } }[] } }[]
>

/**
 * Convert the book map into a JSON-safe value for a Prisma `Json` column.
 * The round-trip strips Dates to ISO strings (Prisma's InputJsonValue forbids
 * Date), which is exactly what we want for storage.
 */
/** One book's market as stored in OddsSnapshot.markets (see serializeBooks). */
interface SnapshotBookMarket {
  book: string
  line: {
    outcomes: { id: string; odds: { decimal: number }; link?: string; sid?: string }[]
    marketLink?: string
    marketSid?: string
    eventLink?: string
    eventSid?: string
  }
}

/** Most legs a betslip request may price; matches the largest AI parlay. */
export const MAX_BETSLIP_LEGS = 8

/** One book's price for a betslip leg. */
export interface LegPrice {
  book: string
  bookName: string
  oddsDecimal: number
  oddsAmerican: string
  /** Expected return at this price against the engine's fair probability, in %. */
  edgePercent: number
  link: string | null
  linkKind: DeepLink["kind"] | null
}

export interface BetslipLeg {
  predictionId: string
  gameId: string
  sport: string
  matchup: string
  commenceTime: string
  /** The game has started, so its pregame price no longer applies. */
  started: boolean
  marketType: string
  selection: string
  fairProbability: number
  confidence: number
  /** When this leg's prices were captured (its game's latest snapshot of this kind). */
  pricesAsOf: string | null
  /** The requested book's price and link, or null if it does not price this leg. */
  atBook: LegPrice | null
  best: LegPrice | null
}

function legPrice(o: BookOption, fairProbability: number): LegPrice {
  return {
    book: o.book,
    bookName: o.bookName,
    oddsDecimal: o.oddsDecimal,
    oddsAmerican: o.oddsAmerican,
    edgePercent: Math.round((fairProbability * o.oddsDecimal - 1) * 10000) / 100,
    link: o.link,
    linkKind: o.linkKind,
  }
}

/** Upcoming games the board looks at. */
const BOARD_WINDOW_MS = 8 * 86_400_000

/** Games the admin props call fetches: props are rarely posted further out. */
const MANUAL_PROPS_HORIZON_MS = 36 * 3_600_000

/** One bet on the board. `ref` identifies it until it becomes a prediction. */
export interface BoardCandidate {
  ref: string
  /** The engine's own +EV pick for this outcome, if there is one. */
  predictionId: string | null
  gameId: string
  outcomeId: string
  /** moneyline | spread | total, or "prop" for every player prop. */
  marketType: string
  /** A prop's "<stat>|<player>" key, e.g. "player_points|LeBron James"; null for game lines. */
  marketKey: string | null
  player: string | null
  /** The prop's stat as shown, e.g. "Points"; null for game lines. */
  stat: string | null
  selection: string
  outcomeName: string
  point: number | null
  fairProbability: number
  /** Decimal price at the requested book, or the best licensed price. */
  offeredOdds: number
  offeredBook: string
  /** Expected return at offeredOdds, in %. Usually negative: the book's margin. */
  edgePercent: number
  confidence: number
  numBooks: number
  /** When this game's prices were captured. */
  pricesAsOf: string
  game: { id: string; sport: string; league: string; homeTeam: string; awayTeam: string; commenceTime: string }
}

/** A stored game as the engine's input; Game.sport holds an engine Sport. */
function asEngineGame<G extends { sport: string }>(game: G): G & { sport: Sport } {
  return game as G & { sport: Sport }
}

/**
 * A Date as the text of a UTC timestamp, for comparing with a Prisma DateTime
 * column (timestamp without time zone, stored in UTC) in raw SQL whatever the
 * session's time zone.
 */
function utcTimestamp(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", "")
}

/**
 * Every book's price for one outcome in a stored snapshot, plus the links and
 * sids needed to send the user to it.
 */
function pricesFromSnapshot(markets: unknown, outcomeId: string): Map<string, BookPriceInput> {
  const pricesByBook = new Map<string, BookPriceInput>()
  const books = markets as Record<string, SnapshotBookMarket[]> | null
  for (const marketBooks of Object.values(books ?? {})) {
    if (!Array.isArray(marketBooks)) continue
    for (const bm of marketBooks) {
      const outcome = bm?.line?.outcomes?.find((o) => o.id === outcomeId)
      if (outcome && outcome.odds?.decimal > 1) {
        const line = bm.line
        // Ingestion stores outcome.link as (outcome link ?? market link).
        // When it equals the market link it is not a betslip, so it is
        // passed as a market link instead.
        const isMarketLink = !!outcome.link && outcome.link === line.marketLink
        pricesByBook.set(bm.book, {
          decimal: outcome.odds.decimal,
          link: isMarketLink ? null : outcome.link ?? null,
          outcomeSid: outcome.sid ?? null,
          marketSid: line.marketSid ?? null,
          marketLink: line.marketLink ?? null,
          eventSid: line.eventSid ?? null,
          eventLink: line.eventLink ?? null,
        })
      }
    }
  }
  return pricesByBook
}

function serializeBooks(booksByMarket: Map<string, BookMarket[]>): object {
  const obj: Record<string, BookMarket[]> = {}
  for (const [k, v] of booksByMarket.entries()) obj[k] = v
  return JSON.parse(JSON.stringify(obj)) as object
}

/**
 * Grade a settled outcome. Returns "won" | "lost" | "push".
 */
export function gradeOutcome(
  pred: { marketType: string; outcomeName: string; point: number | null },
  homeScore: number,
  awayScore: number,
  homeTeam: string,
  awayTeam: string
): "won" | "lost" | "push" {
  const { marketType, outcomeName, point } = pred

  if (marketType === "moneyline") {
    if (homeScore === awayScore) return "push"
    const winner = homeScore > awayScore ? homeTeam : awayTeam
    return outcomeName === winner ? "won" : "lost"
  }

  if (marketType === "spread" && point != null) {
    const isHome = outcomeName === homeTeam
    const teamScore = isHome ? homeScore : awayScore
    const oppScore = isHome ? awayScore : homeScore
    const margin = teamScore + point - oppScore
    if (margin === 0) return "push"
    return margin > 0 ? "won" : "lost"
  }

  if (marketType === "total" && point != null) {
    const total = homeScore + awayScore
    if (total === point) return "push"
    if (outcomeName.toLowerCase() === "over") return total > point ? "won" : "lost"
    if (outcomeName.toLowerCase() === "under") return total < point ? "won" : "lost"
  }

  // Unknown market — treat as push so it doesn't distort win rate.
  return "push"
}

function round(x: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(x * f) / f
}
