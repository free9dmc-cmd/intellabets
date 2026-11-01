import { Prisma } from "@prisma/client"
import type { BookMarket } from "./devig"
import { PROP_LABELS, isPropMarketKey, parsePropOutcomeId } from "../ingestion/prop-markets"

/**
 * Pure pieces of the board and its snapshot reads, kept apart from
 * PredictionsService so they can be tested without a database.
 */

/** What the board offers: game lines (moneyline, spread, total) or player props. */
export type BoardKind = "lines" | "props"

export function isBoardKind(v: unknown): v is BoardKind {
  return v === "lines" || v === "props"
}

/** Older game-line prices are not offered: the engine polls every 30 minutes. */
export const MAX_PRICE_AGE_MS = 90 * 60_000

/**
 * Older player-prop prices are not offered. Props are fetched twice per game
 * (a few hours before and about an hour before), so the window has to span
 * the gap between those fetches: 330 minutes by default.
 */
export function propsMaxPriceAgeMs(raw: string | undefined = process.env.PROPS_MAX_PRICE_AGE_MIN): number {
  const minutes = raw === undefined || raw.trim() === "" ? NaN : Number(raw)
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 330) * 60_000
}

/** The markets the game-line poll captures; props are keyed "<market>|<player>". */
const GAME_LINE_MARKETS: readonly string[] = ["moneyline", "spread", "total"]

export function isGameLine(marketType: string): boolean {
  return GAME_LINE_MARKETS.includes(marketType)
}

/** A stored snapshot's markets as the engine's input shape. */
export function booksByMarketFrom(markets: unknown): Map<string, BookMarket[]> {
  return new Map(Object.entries((markets ?? {}) as Record<string, BookMarket[]>))
}

/** A snapshot's game-line markets only. */
export function gameLinesFrom(markets: unknown): Map<string, BookMarket[]> {
  return new Map(Array.from(booksByMarketFrom(markets)).filter(([type]) => isGameLine(type)))
}

/** A snapshot's player-prop markets only. */
export function propsFrom(markets: unknown): Map<string, BookMarket[]> {
  return new Map(Array.from(booksByMarketFrom(markets)).filter(([key]) => isPropMarketKey(key)))
}

/** SQL: the snapshot holds game lines (markets is jsonb keyed by market type). */
export const HOLDS_GAME_LINES = Prisma.sql`(
  (markets -> 'moneyline') IS NOT NULL OR (markets -> 'spread') IS NOT NULL OR (markets -> 'total') IS NOT NULL
)`

/** OddsSnapshot.provider for game-line and player-prop snapshots. */
export const GAME_LINES_SNAPSHOT_PROVIDER = "the-odds-api"
export const PROPS_SNAPSHOT_PROVIDER = "the-odds-api:props"

/**
 * SQL: the snapshot holds player props. Tested on the keys rather than as
 * "not game lines", because a poll that finds a game with no bookmakers
 * stores an empty {} snapshot, which would otherwise hide the props one.
 */
export const HOLDS_PROPS = Prisma.sql`(
  CASE WHEN jsonb_typeof(markets) = 'object'
    THEN EXISTS (SELECT 1 FROM jsonb_object_keys(markets) k WHERE strpos(k, '|') > 0)
    ELSE false END
)`

/** The player and stat a prop board bet is on, or null if its outcome id is not a prop's. */
export function propFields(
  marketKey: string,
  outcomeId: string
): { marketKey: string; player: string; stat: string } | null {
  const prop = parsePropOutcomeId(outcomeId)
  if (!prop || marketKey !== `${prop.statKey}|${prop.player}`) return null
  return { marketKey, player: prop.player, stat: PROP_LABELS[prop.statKey] ?? prop.statKey }
}

/**
 * The side of a market a board bet is on, for keeping one number per side.
 *
 * Game lines: a team giving points and the same team getting them (-1.5 vs
 * +1.5) are different bets, so the sign of the point is part of the side.
 * Props: one side of one player's stat ("Over" on Jayson Tatum's assists),
 * whatever the number, so each player keeps their own Over and Under.
 */
export function boardSideKey(c: {
  gameId: string
  marketType: string
  marketKey: string | null
  outcomeName: string
  point: number | null
}): string {
  if (c.marketKey) return `${c.gameId}|${c.marketKey}|${c.outcomeName}`
  return `${c.gameId}|${c.marketType}|${c.outcomeName}|${Math.sign(c.point ?? 0)}`
}

/** True when a win chance is inside the requested band; a missing bound is open. */
export function inProbBand(p: number, band: { minProb?: number; maxProb?: number }): boolean {
  if (band.minProb !== undefined && p < band.minProb) return false
  if (band.maxProb !== undefined && p > band.maxProb) return false
  return true
}
