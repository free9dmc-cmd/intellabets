import { decimalToAmerican } from "../sportsbook/utils/odds-normalizer"

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

export const BOOKS: Record<string, Book> = {
  draftkings: {
    key: "draftkings",
    name: "DraftKings",
    url: "https://sportsbook.draftkings.com",
    marketLabels: { moneyline: "Moneyline", spread: "Spread", total: "Total", prop: "Player Props" },
    navHint: "Pick the sport in the left sidebar, then find the game. The three main columns are Spread, Total, Moneyline.",
  },
  fanduel: {
    key: "fanduel",
    name: "FanDuel",
    url: "https://sportsbook.fanduel.com",
    marketLabels: { moneyline: "Moneyline", spread: "Spread", total: "Total Points", prop: "Player Props" },
    navHint: "Choose the sport from the top nav, then the game. Columns are Spread, Total, Moneyline.",
  },
  betmgm: {
    key: "betmgm",
    name: "BetMGM",
    url: "https://sports.betmgm.com",
    marketLabels: { moneyline: "Moneyline", spread: "Spread", total: "Totals", prop: "Player Props" },
    navHint: "Select the league from the A-Z menu, then the game.",
  },
  caesars: {
    key: "caesars",
    name: "Caesars",
    url: "https://sportsbook.caesars.com",
    marketLabels: { moneyline: "Moneyline", spread: "Spread", total: "Over/Under", prop: "Player Props" },
    navHint: "Pick the league in the left menu, then the matchup.",
  },
  pointsbetus: {
    key: "pointsbetus",
    name: "PointsBet",
    url: "https://pointsbet.com",
    marketLabels: { moneyline: "Moneyline", spread: "Spread", total: "Total", prop: "Player Props" },
    navHint: "Choose the sport, then the game.",
  },
  betrivers: {
    key: "betrivers",
    name: "BetRivers",
    url: "https://betrivers.com",
    marketLabels: { moneyline: "Moneyline", spread: "Spread", total: "Total", prop: "Player Props" },
    navHint: "Select the league, then the event.",
  },
}

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
    "You must be 18+ (21+ in some states) and located where sports betting is legal. Check your own jurisdiction.",
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
