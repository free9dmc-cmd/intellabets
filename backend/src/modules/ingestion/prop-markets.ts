/**
 * Player-prop markets: which ones are fetched per sport, their display names,
 * and how a prop outcome id is read back.
 *
 * Outcome ids are built by OddsAggregatorService.transformProps as
 * "<oddsEventId>:<statKey>:<player>:<Over|Under>:<point>", identical across
 * books, so a board ref "<gameId>~<outcomeId>" names one bet at every book.
 */

/**
 * Player-prop market keys per sport (Over/Under style — cleanly de-viggable).
 * Single-sided markets like anytime-TD are intentionally excluded because
 * they have no fair 2-way to de-vig against.
 */
export const PROP_MARKETS: Record<string, string[]> = {
  americanfootball_nfl: ["player_pass_yds", "player_pass_tds", "player_rush_yds", "player_reception_yds", "player_receptions"],
  basketball_nba: ["player_points", "player_rebounds", "player_assists", "player_threes"],
  baseball_mlb: ["batter_hits", "batter_total_bases", "batter_home_runs", "pitcher_strikeouts"],
  icehockey_nhl: ["player_points", "player_shots_on_goal"],
}

/** Human-readable prop labels for selection text. */
export const PROP_LABELS: Record<string, string> = {
  player_pass_yds: "Passing Yards",
  player_pass_tds: "Passing TDs",
  player_rush_yds: "Rushing Yards",
  player_reception_yds: "Receiving Yards",
  player_receptions: "Receptions",
  player_points: "Points",
  player_rebounds: "Rebounds",
  player_assists: "Assists",
  player_threes: "3-Pointers",
  player_shots_on_goal: "Shots on Goal",
  batter_hits: "Hits",
  batter_total_bases: "Total Bases",
  batter_home_runs: "Home Runs",
  pitcher_strikeouts: "Strikeouts",
}

export const PROP_MARKET_KEYS: ReadonlySet<string> = new Set(Object.values(PROP_MARKETS).flat())

/**
 * Characters a player name must not contain: ":" splits the outcome id, "~"
 * splits a board ref, "," splits the refs list and "|" splits the market key.
 */
export const UNSAFE_PLAYER_CHARS = /[:~,|]/

/** Sports whose player props the engine can grade (see settleSport). */
export const GRADED_PROP_SPORT_KEYS: ReadonlySet<string> = new Set(["baseball_mlb", "icehockey_nhl"])

export interface PropOutcome {
  eventId: string
  statKey: string
  player: string
  side: "Over" | "Under"
  point: number
}

/** A prop outcome id read back into its parts, or null if it is not one. */
export function parsePropOutcomeId(id: string): PropOutcome | null {
  const parts = id.split(":")
  if (parts.length !== 5) return null
  const [eventId, statKey, player, side, pointText] = parts
  if (!eventId || !player || !PROP_MARKET_KEYS.has(statKey)) return null
  if (side !== "Over" && side !== "Under") return null
  if (pointText.trim() === "") return null
  const point = Number(pointText)
  if (!Number.isFinite(point)) return null
  return { eventId, statKey, player, side, point }
}

/** True for a snapshot market key that holds a player prop ("<statKey>|<player>"). */
export function isPropMarketKey(key: string): boolean {
  return key.includes("|")
}
