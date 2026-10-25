import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { chooseAISlip } from "@/lib/ai"
import {
  LEG_COUNT,
  eligibleCandidates,
  inRiskBand,
  isAISport,
  isBetType,
  isRiskLevel,
  parlayMath,
  upcomingGameCount,
  type BetType,
  type RiskLevel,
} from "@/lib/ai-picks"
import { getBetslip, getBoard, isEngineConfigured, type BoardCandidate } from "@/lib/engine"
import { hasAIAccess } from "@/lib/entitlements"
import { check, clientKey, tooManyRequests } from "@/lib/rate-limit"
import { SPORTSBOOK_CHOICES, sportsbookKey, stateCode } from "@/lib/sportsbooks"

// The route's hard cap. Every step below works to a deadline inside it, so
// the user always gets JSON back rather than a platform timeout.
export const maxDuration = 60
const DEADLINE_MS = 50_000

/** Prices older than this are not offered as live; the engine polls every 30 min. */
const MAX_PRICE_AGE_MS = 90 * 60_000

const BET_TYPE_LABEL: Record<BetType, string> = { single: "single bet", parlay: "parlay", "same-game-parlay": "same-game parlay" }
const RISK_LABEL: Record<RiskLevel, string> = { low: "Favorites", medium: "Balanced", high: "Underdogs" }

/** A board bet in the shape the slip rules use: its ref is its id. */
type Candidate = BoardCandidate & { id: string }

/**
 * Builds a betslip from the engine's board of real, upcoming bets: Claude
 * chooses the legs and explains them, and every leg comes back priced at the
 * user's sportsbook with a link that opens it there.
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
  // new browser that has not chosen yet.
  const book = sportsbookKey(body.book) ?? sportsbookKey(user?.preferredBook)
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

  const legs = LEG_COUNT[riskLevel][betType]
  const board = await getBoard(sport, { book, limit: 200, timeoutMs: Math.min(30_000, remaining() - 15_000) })
  if (!board) {
    return NextResponse.json(
      { error: "Live picks are unavailable right now. Please try again in a minute.", code: "ENGINE_UNAVAILABLE" },
      { status: 503 }
    )
  }
  const now = Date.now()
  const inBand: Candidate[] = board.candidates
    .filter((c) => inRiskBand(c, riskLevel))
    .map((c) => ({ ...c, id: c.ref }))
  const candidates = eligibleCandidates(inBand, betType, legs, now)

  const choice =
    candidates.length >= legs
      ? await chooseAISlip({ sport, betType, riskLevel, legs, candidates, budgetMs: remaining() - 12_000 })
      : null
  if (!choice) {
    return NextResponse.json({
      betslip: null,
      notice: emptyNotice({
        sport,
        betType,
        riskLevel,
        legs,
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
  if (!slip || slip.legs.length !== choice.picks.length) {
    return NextResponse.json({ error: "Could not load sportsbook prices. Please try again.", code: "PRICES_UNAVAILABLE" }, { status: 502 })
  }
  // Prices this old are not live, whatever the board said a moment ago.
  if (!slip.pricesAsOf || Date.now() - Date.parse(slip.pricesAsOf) > MAX_PRICE_AGE_MS) {
    return NextResponse.json({
      betslip: null,
      notice: "Live odds are refreshing. Please try again in a few minutes.",
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
  const singlePrice = single ? single.atBook ?? single.best : null
  const combinedDecimal = sgp ? null : single ? singlePrice?.oddsDecimal ?? null : slip.combinedDecimal
  const payout = combinedDecimal ? Math.round(slip.stake * combinedDecimal * 100) / 100 : null

  return NextResponse.json({
    betslip: {
      title: choice.title,
      description: choice.description,
      analysis: choice.analysis,
      writtenBy: choice.writtenBy,
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
  sport: string
  betType: BetType
  riskLevel: RiskLevel
  legs: number
  bookName: string | null
  boardSize: number
  found: number
  booksWithPrices: string[]
}): string {
  if (p.boardSize === 0) {
    if (p.bookName && p.booksWithPrices.length > 0) {
      const names = p.booksWithPrices
        .map((k) => SPORTSBOOK_CHOICES.find((b) => b.key === k)?.name)
        .filter(Boolean)
        .join(", ")
      return `${p.bookName} has no current ${p.sport} prices in our feed. Books with prices right now: ${names}.`
    }
    return `There are no upcoming ${p.sport} games with live prices right now. Try another sport, or check back soon.`
  }
  const kind = `${RISK_LABEL[p.riskLevel]} ${p.sport}`
  if (p.betType === "same-game-parlay") {
    return `No ${p.sport} game has ${p.legs} ${RISK_LABEL[p.riskLevel]} bets in different markets right now. Try a regular parlay, a single bet, or another risk level.`
  }
  if (p.found === 0) return `There are no ${kind} bets right now. Try another risk level or sport.`
  if (p.betType === "parlay") {
    return `A ${kind} ${BET_TYPE_LABEL[p.betType]} needs ${p.legs} legs from different games, and only ${p.found} game${p.found === 1 ? " has" : "s have"} one right now. Try another risk level (fewer legs), a single bet, or another sport.`
  }
  return `There are no ${kind} bets right now. Try another risk level or sport.`
}
