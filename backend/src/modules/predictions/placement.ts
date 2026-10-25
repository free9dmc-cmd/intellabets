import { decimalToAmerican } from "../sportsbook/utils/odds-normalizer"
import { buildBetslipLink, getSportsbook, isRoutableBook, SPORTSBOOKS } from "./deeplinks"
import type { BookKind, LinkKind, LinkSource, SportsbookEntry } from "./deeplinks"

/**
 * Turns a prediction into step-by-step instructions for placing it yourself at
 * the sportsbook that had the best price.
 *
 * This produces INSTRUCTIONS ONLY. Nothing here places a bet, logs into an
 * account, or automates anything at a sportsbook — that would violate every
 * book's terms of service and, in most jurisdictions, require a licence the
 * platform does not hold. The user places their own bet.
 */

export interface Book {
  key: string
  name: string
  url: string
  /** What this book calls each market in its own UI. */
  marketLabels: Record<string, string>
  /** Where the market lives in their navigation. */
  navHint: string
}

/**
 * UI wording for books whose sportsbook we have described by hand. Every other
 * registry book gets the generic labels and hint below.
 */
const BOOK_UI: Record<string, Pick<Book, "marketLabels" | "navHint">> = {
  draftkings: {
    marketLabels: { moneyline: "Moneyline", spread: "Spread", total: "Total", prop: "Player Props" },
    navHint: "Pick the sport in the left sidebar, then find the game. The three main columns are Spread, Total, Moneyline.",
  },
  fanduel: {
    marketLabels: { moneyline: "Moneyline", spread: "Spread", total: "Total Points", prop: "Player Props" },
    navHint: "Choose the sport from the top nav, then the game. Columns are Spread, Total, Moneyline.",
  },
  betmgm: {
    marketLabels: { moneyline: "Moneyline", spread: "Spread", total: "Totals", prop: "Player Props" },
    navHint: "Select the league from the A-Z menu, then the game.",
  },
  williamhill_us: {
    marketLabels: { moneyline: "Moneyline", spread: "Spread", total: "Over/Under", prop: "Player Props" },
    navHint: "Pick the league in the left menu, then the matchup.",
  },
  betrivers: {
    marketLabels: { moneyline: "Moneyline", spread: "Spread", total: "Total", prop: "Player Props" },
    navHint: "Select the league, then the event.",
  },
}

const DEFAULT_MARKET_LABELS: Record<string, string> = {
  moneyline: "Moneyline",
  spread: "Spread",
  total: "Total",
  prop: "Player Props",
}

function bookFromEntry(e: SportsbookEntry): Book {
  const ui = BOOK_UI[e.key]
  return {
    key: e.key,
    name: e.name,
    url: e.homeUrl,
    marketLabels: ui?.marketLabels ?? DEFAULT_MARKET_LABELS,
    navHint: ui?.navHint ?? "Choose the sport, then find the game.",
  }
}

/**
 * Display data for every registered book, in traffic order, derived from the
 * deep-link registry so names and home URLs live in one place.
 *
 * Two legacy keys are kept for older callers: "caesars" maps to Caesars
 * (The Odds API calls it "williamhill_us"), and "pointsbetus" covers PointsBet
 * US, whose US business moved to Fanatics. Neither key appears in the
 * current Odds API US list.
 */
export const BOOKS: Record<string, Book> = (() => {
  const out: Record<string, Book> = {}
  for (const e of SPORTSBOOKS) out[e.key] = bookFromEntry(e)
  out.caesars = { ...out.williamhill_us, key: "caesars" }
  out.pointsbetus = {
    key: "pointsbetus",
    name: "PointsBet",
    url: "",
    marketLabels: DEFAULT_MARKET_LABELS,
    navHint: "Choose the sport, then the game.",
  }
  return out
})()

const GENERIC_BOOK: Book = {
  key: "unknown",
  name: "your sportsbook",
  url: "",
  marketLabels: { moneyline: "Moneyline", spread: "Spread", total: "Total", prop: "Player Props" },
  navHint: "Find the game in your sportsbook's schedule.",
}

export function resolveBook(key: string | null | undefined): Book {
  if (!key) return GENERIC_BOOK
  return BOOKS[key.toLowerCase()] ?? { ...GENERIC_BOOK, name: key }
}

export interface PlacementStep {
  n: number
  instruction: string
  detail?: string
}

export interface PlacementGuide {
  book: string
  bookName: string
  bookUrl: string
  matchup: string
  commenceTime: string
  /** Exactly what to tap, e.g. "Kansas City Chiefs -6.5". */
  selection: string
  /** The book's own name for the market tab, e.g. "Total Points". */
  marketLabel: string
  oddsAmerican: string
  oddsDecimal: number
  steps: PlacementStep[]
  stake: {
    percentOfBankroll: number
    /** Worked example so the number is concrete. */
    exampleBankroll: number
    exampleStake: number
  }
  warnings: string[]
}

export interface PredictionForGuide {
  marketType: string
  selection: string
  outcomeName: string
  point: number | null
  offeredOdds: number
  offeredBook: string
  kellyStake: number
  edgePercent: number
  game: { homeTeam: string; awayTeam: string; commenceTime: Date; sport: string }
}

function formatAmerican(decimal: number): string {
  const a = decimalToAmerican(decimal)
  return a > 0 ? `+${a}` : `${a}`
}

/**
 * Human-readable description of the exact selection, in the wording the book
 * uses on the bet itself.
 */
function describeSelection(p: PredictionForGuide): string {
  const { marketType, outcomeName, point } = p
  if (marketType === "total" && point != null) {
    const side = outcomeName.toLowerCase() === "over" ? "Over" : "Under"
    return `${side} ${point}`
  }
  if (marketType === "spread" && point != null) {
    return `${outcomeName} ${point > 0 ? "+" : ""}${point}`
  }
  if (marketType === "moneyline") {
    return `${outcomeName} to win`
  }
  return p.selection
}

export function buildPlacementGuide(
  p: PredictionForGuide,
  opts: { bankroll?: number } = {}
): PlacementGuide {
  const book = resolveBook(p.offeredBook)
  const matchup = `${p.game.awayTeam} @ ${p.game.homeTeam}`
  const marketLabel = book.marketLabels[p.marketType] ?? p.marketType
  const selection = describeSelection(p)
  const american = formatAmerican(p.offeredOdds)

  const bankroll = opts.bankroll ?? 1000
  const pct = p.kellyStake * 100
  const exampleStake = Math.round(bankroll * p.kellyStake * 100) / 100

  const steps: PlacementStep[] = [
    {
      n: 1,
      instruction: `Open ${book.name}`,
      detail: book.url
        ? `${book.url} — this book had the best price on this bet when we checked.`
        : "This book had the best price when we checked.",
    },
    {
      n: 2,
      instruction: `Find ${matchup}`,
      detail: `${p.game.sport}. ${book.navHint}`,
    },
    {
      n: 3,
      instruction: `Go to the "${marketLabel}" market`,
      detail:
        p.marketType === "prop"
          ? "Open the game, then the player props tab, and find the player and stat below."
          : `On most books this is a column on the game row; tap the game for the full list.`,
    },
    {
      n: 4,
      instruction: `Select: ${selection}`,
      detail: `It should be showing around ${american}.`,
    },
    {
      n: 5,
      instruction: `Check the price before you confirm`,
      detail: `If it is worse than ${american}, the edge may already be gone. See the warning below.`,
    },
    {
      n: 6,
      instruction: `Stake ${pct.toFixed(2)}% of your bankroll`,
      detail: `On a $${bankroll.toLocaleString()} bankroll that is about $${exampleStake.toFixed(2)}. This is a quarter-Kelly size, capped at 5%.`,
    },
  ]

  const warnings: string[] = [
    `Odds move constantly. This edge was calculated at ${american}; at a materially worse price the bet may no longer be +EV.`,
    "Only bet what you can afford to lose. A positive expected value does not mean this individual bet wins.",
    "You must be 21+ and located where sports betting is legal. Check your own jurisdiction.",
    "IntellaBets does not place bets, hold funds, or operate a sportsbook. You place your own bets on your own account.",
  ]

  if (p.edgePercent < 3) {
    warnings.unshift(
      `The edge here is thin (${p.edgePercent.toFixed(1)}%). It disappears with a small price move, so skip it if the number has already shifted.`
    )
  }

  return {
    book: book.key,
    bookName: book.name,
    bookUrl: book.url,
    matchup,
    commenceTime: p.game.commenceTime.toISOString(),
    selection,
    marketLabel,
    oddsAmerican: american,
    oddsDecimal: p.offeredOdds,
    steps,
    stake: {
      percentOfBankroll: Math.round(pct * 100) / 100,
      exampleBankroll: bankroll,
      exampleStake,
    },
    warnings,
  }
}

// ─── Comparing the same bet across books ──────────────────────────────────────

export interface BookOption {
  book: string
  bookName: string
  oddsAmerican: string
  oddsDecimal: number
  /** Total returned if it wins, including the stake back. */
  payout: number
  profit: number
  /**
   * Validated link to this book, ideally a pre-populated betslip. Built by
   * buildBetslipLink; null when the book is not in the registry.
   */
  link: string | null
  /** What `link` opens: a filled betslip, the event page, or the book's home page. */
  linkKind: LinkKind | null
  /** Where `link` came from: The Odds API, a sourced template, or the home-page fallback. */
  linkSource: LinkSource | null
  /** Traffic tier from the registry (1 = largest books); null if unregistered. */
  tier: 1 | 2 | null
  /** Traffic rank from the registry (1 = most traffic); null if unregistered. */
  trafficRank: number | null
  /** Sportsbook, prediction exchange or sweepstakes app; null if unregistered. */
  bookKind: BookKind | null
  isBest: boolean
  isPreferred: boolean
  /** How much less this book pays than the best one, for the same stake. */
  lessThanBest: number
}

/** Sort key for books outside the registry: after every ranked book. */
const UNRANKED = Number.MAX_SAFE_INTEGER

/** One book's price for a selection, plus what is needed to build its link. */
export interface BookPriceInput {
  decimal: number
  /** outcome.link from The Odds API. */
  link?: string | null
  outcomeSid?: string | null
  marketSid?: string | null
  marketLink?: string | null
  eventSid?: string | null
  eventLink?: string | null
}

export interface BookComparison {
  selection: string
  matchup: string
  stake: number
  options: BookOption[]
  best: BookOption | null
  preferred: BookOption | null
  /** Extra profit from using the best book instead of the preferred one. */
  savingsVsPreferred: number
  note: string
}

/** User-facing book names / legacy keys -> The Odds API key. */
const PREFERRED_ALIASES: Record<string, string> = {
  caesars: "williamhill_us",
  "caesars sportsbook": "williamhill_us",
  thescore: "espnbet",
  "thescore bet": "espnbet",
  "espn bet": "espnbet",
}

/** The Odds API key for a book name or key a user gave us, e.g. "Caesars" -> "williamhill_us". */
export function resolveBookKey(book: string | null | undefined): string | null {
  const k = book?.trim().toLowerCase()
  if (!k) return null
  return PREFERRED_ALIASES[k] ?? k
}

/**
 * Rank every book offering this selection by what it actually pays.
 *
 * The point is the money, not the odds display: two books quoting -108 and -112
 * look similar until you see the payout on a real stake. Users bet at the book
 * they already have funded, so we show their book alongside the best one and
 * state the difference plainly rather than nagging them to switch.
 */
export function compareBooks(params: {
  selection: string
  matchup: string
  stake: number
  /** book key -> price plus link inputs (links and sids) from the latest odds snapshot */
  pricesByBook: Map<string, BookPriceInput>
  preferredBook?: string | null
  /** User's 2-letter state, used to fill state-specific book links. */
  state?: string | null
}): BookComparison {
  const { selection, matchup, stake, pricesByBook, preferredBook, state } = params
  // Users pick "Caesars"; The Odds API calls it williamhill_us. Resolve the
  // preference through the registry so the alias matches.
  const preferredKey = resolveBookKey(preferredBook)

  const raw: BookOption[] = Array.from(pricesByBook.entries())
    // Offshore/unlicensed books are never shown or linked (see deeplinks.ts).
    .filter(([book, v]) => v.decimal > 1 && isRoutableBook(book))
    .map(([book, v]) => {
      const resolved = resolveBook(book)
      const entry = getSportsbook(book)
      const deepLink = buildBetslipLink(book, {
        providerLink: v.link,
        outcomeSid: v.outcomeSid,
        marketSid: v.marketSid,
        marketLink: v.marketLink,
        eventSid: v.eventSid,
        eventLink: v.eventLink,
        state,
      })
      const payout = Math.round(stake * v.decimal * 100) / 100
      return {
        book,
        bookName: resolved.name,
        oddsAmerican: formatAmerican(v.decimal),
        oddsDecimal: v.decimal,
        payout,
        profit: Math.round((payout - stake) * 100) / 100,
        link: deepLink?.url ?? null,
        linkKind: deepLink?.kind ?? null,
        linkSource: deepLink?.source ?? null,
        tier: entry?.tier ?? null,
        trafficRank: entry?.trafficRank ?? null,
        bookKind: entry?.kind ?? null,
        isBest: false,
        isPreferred: preferredKey ? book.toLowerCase() === preferredKey : false,
        lessThanBest: 0,
      }
    })
    // Money first. On a tied payout the higher-traffic book wins, since the
    // user is more likely to have an account there.
    .sort(
      (a, b) =>
        b.payout - a.payout || (a.trafficRank ?? UNRANKED) - (b.trafficRank ?? UNRANKED)
    )

  if (raw.length === 0) {
    return {
      selection,
      matchup,
      stake,
      options: [],
      best: null,
      preferred: null,
      savingsVsPreferred: 0,
      note: "No current prices available for this selection.",
    }
  }

  raw[0].isBest = true
  for (const o of raw) {
    o.lessThanBest = Math.round((raw[0].payout - o.payout) * 100) / 100
  }

  const best = raw[0]
  const preferred = raw.find((o) => o.isPreferred) ?? null
  const savings = preferred ? Math.round((best.payout - preferred.payout) * 100) / 100 : 0

  let note: string
  if (!preferred) {
    note = `${best.bookName} pays the most on this bet: $${best.payout.toFixed(2)} back on a $${stake.toFixed(2)} stake.`
  } else if (preferred.isBest) {
    note = `${preferred.bookName} already has the best price on this bet — no reason to shop it.`
  } else {
    note = `${preferred.bookName} returns $${preferred.payout.toFixed(2)}; ${best.bookName} returns $${best.payout.toFixed(2)} — $${savings.toFixed(2)} more on the same $${stake.toFixed(2)} stake.`
  }

  return {
    selection,
    matchup,
    stake,
    options: raw,
    best,
    preferred,
    savingsVsPreferred: savings,
    note,
  }
}
