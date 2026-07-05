import { Injectable, Logger } from "@nestjs/common"
import { buildConsensus, BookMarket } from "./devig"
import type { Market } from "../sportsbook/types/provider.types"
import type { ConsensusOutcome, EngineConfig, ValueBet } from "./prediction.types"

const DEFAULTS: Required<EngineConfig> = {
  minEdgePercent: 2,
  kellyFraction: 0.25,
  minBooks: 3,
  maxStake: 0.05,
}

/**
 * The core prediction engine.
 *
 * It does NOT try to out-model the market. Instead it:
 *   1. De-vigs each book and averages to a consensus fair probability
 *      (the sharpest estimate available).
 *   2. Line-shops for the best available price.
 *   3. Surfaces bets where the best price implies positive expected value
 *      against the consensus fair probability (+EV = long-term profitable).
 *   4. Sizes stakes with fractional Kelly.
 *   5. Scores confidence from book agreement, sample size, and edge.
 */
@Injectable()
export class PredictionEngineService {
  private readonly logger = new Logger(PredictionEngineService.name)

  /**
   * Analyse a single game whose markets have been captured from multiple books.
   *
   * @param game          the canonical game (any provider is fine for metadata)
   * @param booksByMarket map of marketType -> per-book MarketLine[]
   */
  analyzeGame(
    game: Pick<Market, "id" | "canonicalId" | "sport" | "homeTeam" | "awayTeam" | "commenceTime">,
    booksByMarket: Map<string, BookMarket[]>,
    config: EngineConfig = {}
  ): ValueBet[] {
    const cfg = { ...DEFAULTS, ...config }
    const results: ValueBet[] = []

    for (const [marketType, books] of booksByMarket.entries()) {
      if (books.length < cfg.minBooks) {
        this.logger.debug(
          `Skipping ${marketType} for ${game.canonicalId}: only ${books.length} books (need ${cfg.minBooks})`
        )
        continue
      }

      const consensus = buildConsensus(books)

      for (const outcome of consensus) {
        const bet = this.evaluateOutcome(game, marketType, outcome, books.length, cfg)
        if (bet) results.push(bet)
      }
    }

    // Highest edge first
    return results.sort((a, b) => b.edgePercent - a.edgePercent)
  }

  /**
   * Convenience: analyse many games at once, returning a flat ranked list.
   */
  analyzeSlate(
    games: {
      game: Pick<Market, "id" | "canonicalId" | "sport" | "homeTeam" | "awayTeam" | "commenceTime">
      booksByMarket: Map<string, BookMarket[]>
    }[],
    config: EngineConfig = {}
  ): ValueBet[] {
    return games
      .flatMap((g) => this.analyzeGame(g.game, g.booksByMarket, config))
      .sort((a, b) => b.confidence - a.confidence)
  }

  // ─── Core evaluation ──────────────────────────────────────────────────────

  private evaluateOutcome(
    game: Pick<Market, "id" | "canonicalId" | "sport" | "homeTeam" | "awayTeam" | "commenceTime">,
    marketType: string,
    outcome: ConsensusOutcome,
    numBooks: number,
    cfg: Required<EngineConfig>
  ): ValueBet | null {
    const { fairProbability, bestDecimal } = outcome
    if (fairProbability <= 0 || bestDecimal <= 1) return null

    // Expected value per $1 staked: p * decimal - 1
    const ev = fairProbability * bestDecimal - 1
    const edgePercent = ev * 100

    if (edgePercent < cfg.minEdgePercent) return null

    const kellyStake = this.kellyStake(fairProbability, bestDecimal, cfg)
    const confidence = this.confidenceScore(edgePercent, outcome.bookAgreement, numBooks)

    return {
      gameId: game.id,
      canonicalId: game.canonicalId,
      sport: game.sport,
      matchup: `${game.awayTeam} @ ${game.homeTeam}`,
      commenceTime: game.commenceTime,
      marketType: marketType as ValueBet["marketType"],
      outcomeId: outcome.outcomeId,
      selection: outcome.selection,
      outcomeName: outcome.name,
      point: outcome.point,
      fairProbability: round(fairProbability, 4),
      offeredDecimal: round(bestDecimal, 3),
      offeredBook: outcome.bestBook,
      edgePercent: round(edgePercent, 2),
      kellyStake: round(kellyStake, 4),
      confidence: round(confidence, 1),
      numBooks,
    }
  }

  /**
   * Fractional Kelly criterion.
   *   f* = (b*p - q) / b
   * where b = decimal - 1 (net odds), p = win prob, q = 1 - p.
   * We then multiply by kellyFraction (e.g. 0.25) and cap at maxStake.
   */
  private kellyStake(p: number, decimal: number, cfg: Required<EngineConfig>): number {
    const b = decimal - 1
    if (b <= 0) return 0
    const q = 1 - p
    const full = (b * p - q) / b
    if (full <= 0) return 0
    return Math.min(full * cfg.kellyFraction, cfg.maxStake)
  }

  /**
   * Composite confidence 0-100:
   *   - edge magnitude (bigger edge = more confident, saturating)
   *   - book agreement (lower cross-book variance = sharper consensus)
   *   - sample size (more books = more trustworthy)
   */
  private confidenceScore(edgePercent: number, bookAgreement: number, numBooks: number): number {
    const edgeScore = Math.min(1, edgePercent / 10)          // 10%+ edge saturates
    const agreementScore = bookAgreement                      // already 0-1
    const sampleScore = Math.min(1, numBooks / 6)             // 6+ books saturates

    // Weighted blend — agreement matters most (a big "edge" with disagreeing
    // books is usually a stale line, not a real edge).
    const composite =
      0.30 * edgeScore +
      0.45 * agreementScore +
      0.25 * sampleScore

    return composite * 100
  }
}

function round(x: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(x * f) / f
}
