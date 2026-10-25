/**
 * Sportsbooks a user can pick as "my book", in traffic order. Keys are The Odds
 * API's and must match the engine's registry
 * (backend/src/modules/predictions/deeplinks.ts). Licensed sportsbooks only:
 * the engine never routes to offshore books, exchanges or sweepstakes apps.
 *
 * Safe to import from client components; it holds no secrets.
 */
export const SPORTSBOOK_CHOICES: readonly { key: string; name: string; usesState?: boolean }[] = [
  { key: "fanduel", name: "FanDuel" },
  { key: "draftkings", name: "DraftKings" },
  { key: "fanatics", name: "Fanatics" },
  { key: "hardrockbet", name: "Hard Rock Bet" },
  // State-hosted: a filled betslip link needs the user's state.
  { key: "betmgm", name: "BetMGM", usesState: true },
  { key: "williamhill_us", name: "Caesars", usesState: true },
  { key: "betrivers", name: "BetRivers", usesState: true },
  { key: "espnbet", name: "theScore Bet" },
  { key: "ballybet", name: "Bally Bet" },
  { key: "betparx", name: "betPARX" },
]

const BOOK_KEYS = new Set(SPORTSBOOK_CHOICES.map((b) => b.key))

/** The book key if it is one we offer, otherwise null. */
export function sportsbookKey(raw: unknown): string | null {
  return typeof raw === "string" && BOOK_KEYS.has(raw) ? raw : null
}

/** 50 states + DC, the jurisdictions a US sportsbook can be licensed in. */
export const US_STATE_CODES: readonly string[] = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN",
  "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
  "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT",
  "VT", "VA", "WA", "WV", "WI", "WY",
]

const STATE_CODES = new Set(US_STATE_CODES)

/** Upper-case 2-letter state code if valid, otherwise null. */
export function stateCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const s = raw.trim().toUpperCase()
  return STATE_CODES.has(s) ? s : null
}
