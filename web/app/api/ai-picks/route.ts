import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { chooseAISlip } from "@/lib/ai"
import {
  LEG_COUNT,
  RISK_STRATEGY,
  americanFromDecimal,
  eligibleCandidates,
  isAISport,
  isBetType,
  isRiskLevel,
  parlayMath,
} from "@/lib/ai-picks"
import { getBetslip, getIngestionStatus, getStrategyPicks, isEngineConfigured } from "@/lib/engine"
import { hasAIAccess } from "@/lib/entitlements"
import { check, clientKey, tooManyRequests } from "@/lib/rate-limit"
import { sportsbookKey, stateCode } from "@/lib/sportsbooks"

// One model call plus a few engine calls; well under this in practice.
export const maxDuration = 60

const BET_TYPE_LABEL = { single: "single bet", parlay: "parlay", "same-game-parlay": "same-game parlay" }
const RISK_LABEL = { low: "Safe", medium: "Balanced", high: "High Value" }

/**
 * Builds a betslip from the engine's real, upcoming picks: Claude chooses the
 * legs and explains them, and every leg comes back priced at the user's
 * sportsbook with a link that opens it there.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { sport, betType, riskLevel } = body ?? {}
  if (!isAISport(sport) || !isBetType(betType) || !isRiskLevel(riskLevel)) {
    return NextResponse.json({ error: "Choose a sport, bet type and risk level." }, { status: 400 })
  }
  const book = sportsbookKey(body.book)
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
  const pool = await getStrategyPicks(RISK_STRATEGY[riskLevel], { sport, limit: 60 })
  if (!pool) {
    return NextResponse.json({ error: "Live picks are unavailable right now. Please try again shortly.", code: "ENGINE_UNAVAILABLE" }, { status: 503 })
  }
  const candidates = eligibleCandidates(pool.predictions, betType, legs, Date.now())

  const choice = candidates.length >= legs
    ? await chooseAISlip({ sport, betType, riskLevel, legs, candidates })
    : null
  if (!choice) {
    return NextResponse.json({
      betslip: null,
      notice: await emptyNotice({
        sport,
        betType,
        riskLevel,
        legs,
        // What limits a slip: legs for a single, distinct games for a parlay,
        // qualifying games for a same-game parlay.
        found:
          betType === "single" ? candidates.length : new Set(candidates.map((c) => c.gameId)).size,
      }),
    })
  }

  const slip = await getBetslip(choice.picks.map((p) => p.id), { book, state, stake })
  if (!slip) {
    return NextResponse.json({ error: "Could not load sportsbook prices. Please try again.", code: "PRICES_UNAVAILABLE" }, { status: 502 })
  }

  const byId = new Map(choice.picks.map((p) => [p.id, p]))
  const legsOut = slip.legs.map((l) => ({
    ...l,
    edgePercent: byId.get(l.predictionId)?.edgePercent ?? null,
    reasoning: choice.reasons[l.predictionId] ?? null,
  }))
  const math = parlayMath(
    legsOut.map((l) => ({
      decimal: (l.atBook ?? l.best)?.oddsDecimal ?? 1,
      fairProbability: l.fairProbability,
    }))
  )
  // The combined price is only real when one book prices every leg. With no
  // book chosen, a single bet still has a real price: the best one available.
  const single = slip.legs.length === 1 ? slip.legs[0] : null
  const combinedDecimal = slip.combinedDecimal ?? (single && !slip.book ? single.best?.oddsDecimal ?? null : null)
  const payout = slip.payout ?? (combinedDecimal ? Math.round(slip.stake * combinedDecimal * 100) / 100 : null)

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
      combinedAmerican: combinedDecimal ? americanFromDecimal(combinedDecimal) : null,
      payout,
      winProbability: math.winProbability,
      parlayLink: slip.parlayLink,
      note: slip.note,
      sameGameWarning:
        betType === "same-game-parlay"
          ? "Same-game legs move together, so the sportsbook prices this parlay itself (usually below the legs multiplied), and the win chance shown treats the legs as independent."
          : null,
      pricesAsOf: slip.pricesAsOf,
      disclaimer: slip.disclaimer,
    },
  })
}

/** Why no slip could be built, in words a customer can act on. */
async function emptyNotice(p: {
  sport: string
  betType: keyof typeof BET_TYPE_LABEL
  riskLevel: keyof typeof RISK_LABEL
  legs: number
  found: number
}): Promise<string> {
  const status = await getIngestionStatus()
  const lastSnap = status?.data.lastSnapshotAt ? new Date(status.data.lastSnapshotAt).getTime() : 0
  if (!status || Date.now() - lastSnap > 3 * 3_600_000) {
    return "Live odds are temporarily unavailable, so there are no current picks to build a betslip from. Please check back soon."
  }
  const kind = `${RISK_LABEL[p.riskLevel]} ${p.sport}`
  if (p.betType === "same-game-parlay") {
    return `No ${p.sport} game has ${p.legs} ${RISK_LABEL[p.riskLevel]} picks in different markets right now. Try a regular parlay, a single bet, or another risk level.`
  }
  if (p.found === 0) {
    return `The engine has no ${kind} picks right now. Try another sport or risk level.`
  }
  if (p.betType === "parlay") {
    return `A ${kind} parlay needs ${p.legs} legs from different games, and the engine has picks in ${p.found} game${p.found === 1 ? "" : "s"} right now. Try a lower risk level (fewer legs), a single bet, or another sport.`
  }
  return `The engine has no ${kind} picks right now. Try another sport or risk level.`
}
