import { Injectable, Logger } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { PrismaService } from "../../common/prisma/prisma.service"
import { PredictionEngineService } from "./prediction-engine.service"
import { AIAnalystService } from "./ai-analyst.service"
import { OddsAggregatorService } from "../ingestion/odds-aggregator.service"
import { RealtimeService } from "../realtime/realtime.service"
import { MlbStatsService } from "./mlb-stats.service"
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
    private readonly mlbStats: MlbStatsService
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
      predictionCount += await this.analyzeAndPersist(gb, { config, allowStarted: false })
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
      predictionCount += await this.analyzeAndPersist(gb, { config, allowStarted: true, isLive: true })
    }

    this.logger.log(`${sportKey} LIVE: ${live.length} in-play games, ${predictionCount} predictions`)
    return { games: live.length, predictions: predictionCount }
  }

  /**
   * Ingest player props for a sport's events and generate +EV prop predictions.
   * One API call per event, so capped by maxEvents to protect quota.
   */
  async ingestPropsAndPredict(sportKey: string, maxEvents = 5, config: EngineConfig = {}): Promise<{ events: number; predictions: number }> {
    if (!this.aggregator.isConfigured()) return { events: 0, predictions: 0 }
    if (this.aggregator.propMarketsFor(sportKey).length === 0) {
      this.logger.warn(`No prop markets configured for ${sportKey}`)
      return { events: 0, predictions: 0 }
    }

    const events = await this.aggregator.fetchEvents(sportKey)
    // Prioritise soonest/in-play events.
    const targets = events
      .sort((a, b) => a.commenceTime.getTime() - b.commenceTime.getTime())
      .slice(0, maxEvents)

    let predictionCount = 0
    for (const ev of targets) {
      const gb = await this.aggregator.fetchEventProps(sportKey, ev.id).catch(() => null)
      const marketCount = gb?.booksByMarket.size ?? 0
      this.logger.log(`${ev.awayTeam} @ ${ev.homeTeam}: ${marketCount} prop markets posted`)
      if (!gb || marketCount === 0) continue
      const isLive = gb.commenceTime.getTime() <= Date.now()
      predictionCount += await this.analyzeAndPersist(gb, { config, allowStarted: true, isProp: true, isLive })
    }

    this.logger.log(`${sportKey} PROPS: ${targets.length} events, ${predictionCount} predictions`)
    return { events: targets.length, predictions: predictionCount }
  }

  /**
   * Shared path: upsert game, snapshot odds, run the engine, AI-review, persist
   * surviving +EV bets, and broadcast them. Returns the number persisted.
   */
  private async analyzeAndPersist(
    gb: Awaited<ReturnType<OddsAggregatorService["fetchSlate"]>>[number],
    opts: { config: EngineConfig; allowStarted: boolean; isProp?: boolean; isLive?: boolean }
  ): Promise<number> {
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
    const isClosing = minsToStart > 0 && minsToStart <= 60
    await this.prisma.oddsSnapshot.create({
      data: {
        gameId: game.id,
        provider: "the-odds-api",
        isClosing,
        markets: serializeBooks(gb.booksByMarket) as Prisma.InputJsonValue,
      },
    })

    // Pre-game jobs only predict on games that haven't started.
    if (!opts.allowStarted && minsToStart <= 0) return 0

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

      // Grade player props (MLB only for now — free MLB Stats API).
      if (sportKey === "baseball_mlb") {
        settled += await this.settleMlbProps(game.id, game.homeTeam, game.awayTeam, game.commenceTime)
      }
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

    const snap = await this.prisma.oddsSnapshot.findFirst({
      where: { gameId: p.gameId },
      orderBy: { capturedAt: "desc" },
      select: { markets: true, capturedAt: true },
    })

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
   * that book's price. Prices older than MAX_PRICE_AGE_MS are left out.
   */
  async board(opts: { sport?: string; book?: string | null; limit?: number } = {}) {
    const now = Date.now()
    const limit = Math.min(Math.max(opts.limit ?? 60, 1), 200)
    const games = await this.prisma.game.findMany({
      where: {
        commenceTime: { gt: new Date(now), lt: new Date(now + BOARD_WINDOW_MS) },
        ...(opts.sport ? { sport: opts.sport } : {}),
      },
      orderBy: { commenceTime: "asc" },
      take: 200,
    })
    const empty = { candidates: [] as BoardCandidate[], pricesAsOf: null as string | null, booksWithPrices: [] as string[] }
    if (games.length === 0) return empty

    const snaps = await this.prisma.oddsSnapshot.findMany({
      where: { gameId: { in: games.map((g) => g.id) }, capturedAt: { gt: new Date(now - MAX_PRICE_AGE_MS) } },
      orderBy: [{ gameId: "asc" }, { capturedAt: "desc" }],
      distinct: ["gameId"],
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
    const bookKey = resolveBookKey(opts.book)
    const byId = new Map(games.map((g) => [g.id, g]))
    const booksWithPrices = new Set<string>()
    const candidates: BoardCandidate[] = []
    let oldest: Date | null = null

    for (const snap of snaps) {
      const game = byId.get(snap.gameId)
      if (!game) continue
      const booksByMarket = booksByMarketFrom(snap.markets)
      for (const books of booksByMarket.values()) {
        for (const b of books) if (isRoutableBook(b.book)) booksWithPrices.add(b.book)
      }
      const bets = this.engine.analyzeGame(asEngineGame(game), booksByMarket, { minEdgePercent: -100 })
      let used = false
      for (const bet of bets) {
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
          marketType: bet.marketType,
          selection: bet.selection,
          outcomeName: bet.outcomeName,
          point: bet.point ?? null,
          fairProbability: bet.fairProbability,
          offeredOdds: decimal,
          offeredBook: book,
          edgePercent: Math.round((bet.fairProbability * decimal - 1) * 10000) / 100,
          confidence: bet.confidence,
          numBooks: bet.numBooks,
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
    return {
      candidates: candidates.slice(0, limit),
      pricesAsOf: oldest?.toISOString() ?? null,
      booksWithPrices: Array.from(booksWithPrices).sort(),
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
    const snap = await this.prisma.oddsSnapshot.findFirst({
      where: { gameId },
      orderBy: { capturedAt: "desc" },
      select: { markets: true },
    })
    if (!snap) return null
    const bet = this.engine
      .analyzeGame(asEngineGame(game), booksByMarketFrom(snap.markets), { minEdgePercent: -100 })
      .find((b) => b.outcomeId === outcomeId)
    if (!bet) return null
    const created = await this.prisma.prediction.create({
      data: {
        gameId,
        userId: null,
        source: "board",
        marketType: bet.marketType,
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
    for (const ref of opts.refs ?? []) {
      const id = await this.predictionIdForRef(ref)
      if (id) fromRefs.push(id)
    }
    const unique = Array.from(new Set([...ids.filter(Boolean), ...fromRefs])).slice(0, MAX_BETSLIP_LEGS)
    const stake = opts.stake && Number.isFinite(opts.stake) && opts.stake > 0 ? opts.stake : 10
    const preds = await this.prisma.prediction.findMany({
      where: { id: { in: unique } },
      include: { game: true },
    })
    const byId = new Map(preds.map((p) => [p.id, p]))
    const now = Date.now()

    const legs: BetslipLeg[] = []
    const linkInputs: (BookPriceInput | null)[] = []
    const fairByGame = new Map<string, Map<string, number>>()
    let oldestPrices: Date | null = null
    for (const id of unique) {
      const p = byId.get(id)
      if (!p) continue
      const snap = await this.prisma.oddsSnapshot.findFirst({
        where: { gameId: p.gameId },
        orderBy: { capturedAt: "desc" },
        select: { markets: true, capturedAt: true },
      })
      if (snap && (!oldestPrices || snap.capturedAt < oldestPrices)) oldestPrices = snap.capturedAt
      const prices = snap ? pricesFromSnapshot(snap.markets, p.outcomeId) : new Map<string, BookPriceInput>()
      if (snap && !fairByGame.has(p.gameId)) {
        const bets = this.engine.analyzeGame(asEngineGame(p.game), booksByMarketFrom(snap.markets), { minEdgePercent: -100 })
        fairByGame.set(p.gameId, new Map(bets.map((b) => [b.outcomeId, b.fairProbability])))
      }
      // The stored value is a fallback for an outcome no longer in the prices.
      const fair = fairByGame.get(p.gameId)?.get(p.outcomeId) ?? p.fairProbability
      const comparison = compareBooks({
        selection: p.selection,
        matchup: `${p.game.awayTeam} @ ${p.game.homeTeam}`,
        stake,
        pricesByBook: prices,
        preferredBook: opts.book ?? null,
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
        atBook: atBook ? legPrice(atBook, fair) : null,
        best: comparison.best ? legPrice(comparison.best, fair) : null,
      })
      linkInputs.push(atBook ? prices.get(atBook.book) ?? null : null)
    }

    const bookKey = resolveBookKey(opts.book)
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
    const bookName = entry?.name ?? opts.book ?? null
    let note: string
    if (!bookKey) note = "Pick your sportsbook to see its prices and betslip links."
    else if (legs.length === 0) note = "None of these picks were found."
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
    // snapshots taken before commenceTime.
    const target =
      (await this.prisma.oddsSnapshot.findFirst({
        where: { gameId, isClosing: true, capturedAt: { lt: commenceTime } },
        orderBy: { capturedAt: "desc" },
      })) ??
      (await this.prisma.oddsSnapshot.findFirst({
        where: { gameId, capturedAt: { lt: commenceTime } },
        orderBy: { capturedAt: "desc" },
      }))

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

/** Older prices are not offered: the engine polls every 30 minutes. */
const MAX_PRICE_AGE_MS = 90 * 60_000

/** One bet on the board. `ref` identifies it until it becomes a prediction. */
export interface BoardCandidate {
  ref: string
  /** The engine's own +EV pick for this outcome, if there is one. */
  predictionId: string | null
  gameId: string
  outcomeId: string
  marketType: string
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
  game: { id: string; sport: string; league: string; homeTeam: string; awayTeam: string; commenceTime: string }
}

/** A stored game as the engine's input; Game.sport holds an engine Sport. */
function asEngineGame<G extends { sport: string }>(game: G): G & { sport: Sport } {
  return game as G & { sport: Sport }
}

/** A stored snapshot's markets as the engine's input shape. */
function booksByMarketFrom(markets: unknown): Map<string, BookMarket[]> {
  return new Map(Object.entries((markets ?? {}) as Record<string, BookMarket[]>))
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
