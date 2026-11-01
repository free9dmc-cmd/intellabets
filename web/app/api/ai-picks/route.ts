import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { chooseAISlip } from "@/lib/ai"
import {
  defaultSelection,
  eligibleCandidates,
  inRiskBand,
  isAISport,
  isBetType,
  isPropSport,
  isRiskLevel,
  isSlipKind,
  legCount,
  parlayMath,
  riskBandBounds,
  upcomingGameCount,
  type BetType,
  type RiskLevel,
  type SlipKind,
} from "@/lib/ai-picks"
import { getBetslip, getBoard, isEngineConfigured, type BoardCandidate } from "@/lib/engine"
import { hasAIAccess } from "@/lib/entitlements"
import { check, clientKey, tooManyRequests } from "@/lib/rate-limit"
import { SPORTSBOOK_CHOICES, sportsbookKey, stateCode } from "@/lib/sportsbooks"

// The route's hard cap. Every step below works to a deadline inside it, so
// the user always gets JSON back rather than a platform timeout.
export const maxDuration = 60
const DEADLINE_MS = 50_000

/**
 * Game-line prices older than this are not offered as live; the engine polls
 * every 30 min. A board that states its own window (props: several hours,
 * since props are fetched twice per game) uses that instead.
 */
const MAX_PRICE_AGE_MS = 90 * 60_000

const BET_TYPE_LABEL: Record<BetType, string> = { single: "single bet", parlay: "parlay", "same-game-parlay": "same-game parlay" }
const RISK_LABEL: Record<RiskLevel, string> = { low: "Favorites", medium: "Balanced", high: "Underdogs" }

/** A board bet in the shape the slip rules use: its ref is its id. */
type Candidate = BoardCandidate & { id: string }

/**
 * Builds a betslip from the engine's board of real, upcoming bets (game lines,
 * or player props for PROP_SPORTS): Claude chooses the legs and explains them,
 * and every leg comes back priced at the user's sportsbook with a link that
 * opens it there.
 */
export async function POST(req: Request) {
  const started = Date.now()
  const remaining = () => DEADLINE_MS - (Date.now() - started)

  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { sport, betType, riskLevel } = body ?? {}
  if (!isAISport(sport) || !isBetType(betType) || !isRiskLevel(riskLevel)) {
    return NextResponse.json({ error: "Choose a sport, bet type and risk level." }, { status: 400 })
  }
  const kind: unknown = body.kind ?? "lines"
  if (!isSlipKind(kind)) {
    return NextResponse.json({ error: "Choose game lines or player props." }, { status: 400 })
  }
  const props = kind === "props"
  if (props && !isPropSport(sport)) {
    return NextResponse.json({ error: "Player props are available for NBA, NFL and NHL." }, { status: 400 })
  }
  const state = stateCode(body.state)
  const rawStake = Number(body.stake)
  const stake = Number.isFinite(rawStake) && rawStake >= 1 ? Math.min(Math.round(rawStake * 100) / 100, 10_000) : 10

  // AI Picks is unlocked by a standalone AI subscription OR by an active
  // Premium membership (Premium bundles AI Picks). Checked against the DB, not
  // the JWT, so a lapsed membership can't ride a stale token.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      isPremium: true,
      premiumUntil: true,
      preferredBook: true,
      aiSubscription: { select: { status: true, expiresAt: true } },
    },
  })

  if (!hasAIAccess(user)) {
    return NextResponse.json(
      { error: "AI Picks subscription or Premium membership required", code: "NO_AI_SUB" },
      { status: 403 }
    )
  }

  // A parlay is placed at one book, so it needs one. The saved book covers a
  // caller that sent no book at all; an explicit null is "best price anywhere".
  const book = body.book === undefined ? sportsbookKey(user?.preferredBook) : sportsbookKey(body.book)
  if (!book && betType !== "single") {
    return NextResponse.json(
      { error: "Choose your sportsbook: a parlay has to be placed at one book.", code: "BOOK_REQUIRED" },
      { status: 400 }
    )
  }

  // Paid access is not unlimited access: each generation costs real tokens, so
  // one subscriber cannot script this into an unbounded bill.
  const rl = await check(`aipicks:${clientKey(req, session.user.id)}`, 15, 3600)
  if (!rl.ok) {
    return tooManyRequests(rl.retryAfter, "You have generated a lot of picks in the last hour. Please try again shortly.")
  }

  if (!isEngineConfigured()) {
    return NextResponse.json({ error: "Live picks are unavailable right now.", code: "ENGINE_UNAVAILABLE" }, { status: 503 })
  }

  // Remember the book so the Engine Picks page defaults to it too.
  if (book && book !== user?.preferredBook) {
    await prisma.user.update({ where: { id: session.user.id }, data: { preferredBook: book } }).catch(() => {})
  }

  const legs = legCount(kind, riskLevel, betType)
  // The risk band goes to the engine so it is applied before the board is cut
  // to size; inRiskBand below still decides.
  const board = await getBoard(sport, {
    book,
    limit: 200,
    kind,
    ...riskBandBounds(riskLevel),
    timeoutMs: Math.min(30_000, remaining() - 15_000),
  })
  if (!board) {
    return NextResponse.json(
      { error: "Live picks are unavailable right now. Please try again in a minute.", code: "ENGINE_UNAVAILABLE" },
      { status: 503 }
    )
  }
  // An engine that predates props ignores kind and answers with game lines.
  if (props && board.kind !== "props") {
    return NextResponse.json(
      { error: "Player props are unavailable right now. Please try again later.", code: "ENGINE_UNAVAILABLE" },
      { status: 503 }
    )
  }
  const now = Date.now()
  const inBand: Candidate[] = board.candidates
    .filter((c) => inRiskBand(c, riskLevel))
    .map((c) => ({ ...c, id: c.ref }))
  const candidates = eligibleCandidates(inBand, betType, legs, now)

  // The engine's own pick exists whenever any legal slip does, so without one
  // the model is not asked (it could only fail the same rules).
  const choice =
    candidates.length >= legs && defaultSelection(candidates, betType, legs)
      ? await chooseAISlip({ sport, betType, riskLevel, legs, kind, candidates, budgetMs: remaining() - 12_000 })
      : null
  if (!choice) {
    return NextResponse.json({
      betslip: null,
      notice: emptyNotice({
        kind,
        sport,
        betType,
        riskLevel,
        legs,
        book,
        bookName: book ? SPORTSBOOK_CHOICES.find((b) => b.key === book)?.name ?? book : null,
        boardSize: board.candidates.length,
        // What limits a slip: bets for a single, distinct games for a parlay.
        found: betType === "single" ? inBand.length : upcomingGameCount(inBand, now),
        booksWithPrices: board.booksWithPrices,
      }),
    })
  }

  const slip = await getBetslip(
    { refs: choice.picks.map((p) => p.ref) },
    { book, state, stake, timeoutMs: Math.max(3_000, remaining() - 2_000) }
  )
  if (!slip) {
    return NextResponse.json({ error: "Could not load sportsbook prices. Please try again.", code: "PRICES_UNAVAILABLE" }, { status: 502 })
  }
  // A ref the engine no longer finds means new prices landed while the slip
  // was being built (its legs come from the newer snapshot's bets).
  if (slip.unresolvedRefs?.length) {
    return NextResponse.json({
      betslip: null,
      notice: `${slip.book ? `${slip.book.name} just updated its prices` : "Sportsbook prices just updated"}. Please generate the slip again.`,
    })
  }
  // An engine that predates unresolvedRefs drops those legs without a word.
  if (slip.legs.length !== choice.picks.length) {
    return NextResponse.json({ error: "Could not load sportsbook prices. Please try again.", code: "PRICES_UNAVAILABLE" }, { status: 502 })
  }
  // Prices this old are not live, whatever the board said a moment ago.
  const maxPriceAgeMs =
    typeof board.maxPriceAgeMs === "number" && board.maxPriceAgeMs > 0 ? board.maxPriceAgeMs : MAX_PRICE_AGE_MS
  if (!slip.pricesAsOf || Date.now() - Date.parse(slip.pricesAsOf) > maxPriceAgeMs) {
    return NextResponse.json({
      betslip: null,
      notice: props
        ? `These player prop prices are more than ${Math.round(maxPriceAgeMs / 360_000) / 10} hours old, so we won't offer them. Props are refreshed a few hours before each game and again about an hour before.`
        : "Live odds are refreshing. Please try again in a few minutes.",
    })
  }
  // The board only offers bets the chosen book prices, so a leg it no longer
  // prices means new odds landed while the slip was being built.
  if (book && slip.legs.some((l) => !l.atBook)) {
    return NextResponse.json({
      betslip: null,
      notice: `${slip.book?.name ?? "Your sportsbook"} just updated its odds. Please generate the slip again.`,
    })
  }

  // The board ref became a prediction; reasons are keyed by ref, legs come back in order.
  const legsOut = slip.legs.map((l, i) => ({
    ...l,
    reasoning: choice.reasons[choice.picks[i].id] ?? null,
  }))
  const math = parlayMath(legsOut.map((l) => ({ decimal: (l.atBook ?? l.best)?.oddsDecimal ?? 1, fairProbability: l.fairProbability })))

  // Same-game legs move together and the book prices them itself, so the
  // legs multiplied would overstate the payout: show no combined price.
  const sgp = betType === "same-game-parlay"
  const single = slip.legs.length === 1 ? slip.legs[0] : null
  // With a book chosen every leg is priced there (checked above); the best
  // price anywhere stands in only when no book was chosen.
  const singlePrice = single ? (book ? single.atBook : single.atBook ?? single.best) : null
  const combinedDecimal = sgp ? null : single ? singlePrice?.oddsDecimal ?? null : slip.combinedDecimal
  const payout = combinedDecimal ? Math.round(slip.stake * combinedDecimal * 100) / 100 : null

  return NextResponse.json({
    betslip: {
      title: choice.title,
      description: choice.description,
      analysis: choice.analysis,
      writtenBy: choice.writtenBy,
      kind,
      sport,
      betType,
      riskLevel,
      book: slip.book,
      state,
      stake: slip.stake,
      legs: legsOut,
      combinedDecimal,
      combinedAmerican: single ? singlePrice?.oddsAmerican ?? null : combinedDecimal ? americanOdds(combinedDecimal) : null,
      payout,
      winProbability: math.winProbability,
      parlayLink: slip.parlayLink,
      note: slip.note,
      sameGameWarning: sgp
        ? `Same-game legs move together, so ${slip.book?.name ?? "your sportsbook"} prices this parlay itself, and the win chance shown treats the legs as independent.`
        : null,
      // Props are priced hours before the game from prices alone; say so with every prop slip.
      propsNote: props
        ? `Player prop prices are captured a few hours before each game and again about an hour before, so they can be out of date. IntellaBets has no injury, lineup or player-stat data: the win chance comes only from sportsbook prices with their margin removed. Confirm every leg at ${slip.book?.name ?? "your sportsbook"} before placing.`
        : null,
      pricesAsOf: slip.pricesAsOf,
      disclaimer: slip.disclaimer,
    },
  })
}

function americanOdds(d: number): string {
  const a = d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1))
  return a > 0 ? `+${a}` : `${a}`
}

/** Why no slip could be built, in words a customer can act on. */
function emptyNotice(p: {
  kind: SlipKind
  sport: string
  betType: BetType
  riskLevel: RiskLevel
  legs: number
  book: string | null
  bookName: string | null
  boardSize: number
  found: number
  booksWithPrices: string[]
}): string {
  const props = p.kind === "props"
  const risk = RISK_LABEL[p.riskLevel]
  // The engine applies the risk band, so an empty board can still have
  // prices: booksWithPrices (from every snapshot looked at) tells them apart.
  const noPrices = p.booksWithPrices.length === 0 || (p.book !== null && !p.booksWithPrices.includes(p.book))
  if (p.boardSize === 0 && noPrices) {
    if (p.bookName && p.booksWithPrices.length > 0) {
      const names = p.booksWithPrices
        .map((k) => SPORTSBOOK_CHOICES.find((b) => b.key === k)?.name)
        .filter(Boolean)
        .join(", ")
      return props
        ? `${p.bookName} has no current ${p.sport} player prop prices in our feed. Books with prop prices right now: ${names}.`
        : `${p.bookName} has no current ${p.sport} prices in our feed. Books with prices right now: ${names}.`
    }
    return props
      ? `No ${p.sport} player props are priced right now. Props are posted a few hours before each game; check back closer to game time.`
      : `There are no upcoming ${p.sport} games with live prices right now. Try another sport, or check back soon.`
  }
  const kind = `${risk} ${p.sport}`
  const noBets = props
    ? p.riskLevel === "medium"
      ? `There are no ${kind} player props right now. Props are posted a few hours before each game; check back closer to game time.`
      : `There are no ${kind} player props right now. Most props are priced near 50/50, so try Balanced.`
    : `There are no ${kind} bets right now. Try another risk level or sport.`
  if (p.betType === "same-game-parlay") {
    return props
      ? `No ${p.sport} game has ${p.legs} ${risk} player props on different players or stats right now. Try ${p.riskLevel === "medium" ? "a single or a parlay" : "a single, a parlay, or Balanced"}.`
      : `No ${p.sport} game has ${p.legs} ${risk} bets in different markets right now. Try a regular parlay, a single bet, or another risk level.`
  }
  if (p.found === 0) return noBets
  if (p.betType === "parlay") {
    return `A ${kind} ${props ? "player-prop parlay" : BET_TYPE_LABEL[p.betType]} needs ${p.legs} legs from different games, and only ${p.found} game${p.found === 1 ? " has" : "s have"} one right now. Try another risk level (fewer legs), a single bet, or another sport.`
  }
  return noBets
}
