import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { hasAIAccess } from "@/lib/entitlements"
import { getStrategyPicks, isEngineConfigured, type StrategyResult } from "@/lib/engine"
import HowToBet from "./HowToBet"

export const dynamic = "force-dynamic"

const STRATEGY_TABS = [
  { key: "value", label: "Best Value" },
  { key: "safe", label: "Lower Variance" },
  { key: "longshot", label: "Higher Variance" },
  { key: "steam", label: "Following the Move" },
  { key: "contrarian", label: "Against the Move" },
]

function americanFromDecimal(d: number): string {
  const a = d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1))
  return a > 0 ? `+${a}` : `${a}`
}

export default async function PicksPage({
  searchParams,
}: {
  searchParams: { strategy?: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      isPremium: true,
      premiumUntil: true,
      aiSubscription: { select: { status: true, expiresAt: true } },
    },
  })

  if (!hasAIAccess(user)) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="text-6xl mb-6">📍</div>
        <h1 className="text-3xl font-black text-white mb-4">
          Unlock <span className="gradient-text">Engine Picks</span>
        </h1>
        <p className="text-gray-400 mb-8 leading-relaxed">
          Every pick comes with step-by-step instructions telling you exactly which sportsbook had
          the best price, what to select, and how much to stake.
        </p>
        <Link href="/premium" className="btn-primary py-3 px-10 font-bold inline-block" style={{ borderRadius: "10px" }}>
          View Plans
        </Link>
      </div>
    )
  }

  const active = STRATEGY_TABS.find((t) => t.key === searchParams.strategy)?.key ?? "value"

  let result: StrategyResult | null = null
  if (isEngineConfigured()) {
    result = await getStrategyPicks(active, { limit: 20 })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-white mb-1">
          📍 Engine <span className="gradient-text">Picks</span>
        </h1>
        <p className="text-gray-400 text-sm">
          Positive expected-value bets found by comparing every major sportsbook. Each one includes
          exactly where and how to place it.
        </p>
      </div>

      {/* Strategy tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STRATEGY_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/picks?strategy=${t.key}`}
            className={`whitespace-nowrap text-sm py-2 px-4 rounded-lg border transition-all ${
              active === t.key
                ? "bg-purple-500/15 border-purple-500/40 text-purple-300 font-semibold"
                : "border-gray-800 text-gray-400 hover:text-gray-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {!isEngineConfigured() && (
        <div className="card p-6 text-center text-gray-400">
          <p className="font-semibold text-white mb-1">Engine not connected</p>
          <p className="text-sm">Betting guidance is temporarily unavailable. Please check back shortly.</p>
        </div>
      )}

      {result && (
        <>
          <div className="card p-4 border-purple-500/20">
            <div className="font-bold text-white text-sm mb-1">{result.strategy.name}</div>
            <p className="text-gray-400 text-sm leading-relaxed">{result.strategy.description}</p>
            {/* Always show the caveat: every strategy has a real downside. */}
            <p className="text-gray-500 text-xs mt-2 leading-relaxed">
              <strong className="text-gray-400">Worth knowing:</strong> {result.strategy.caveat}
            </p>
          </div>

          {result.predictions.length === 0 && (
            <div className="card p-8 text-center text-gray-400">
              <div className="text-3xl mb-3">🔍</div>
              <p className="font-semibold text-white mb-1">No picks right now</p>
              <p className="text-sm">
                {result.note ??
                  "The engine only surfaces bets where the best available price genuinely beats the market consensus. Empty is normal — real edges are rare."}
              </p>
            </div>
          )}

          {result.predictions.map((p) => (
            <div key={p.id} className="card p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">
                    {p.game.sport} &middot; {new Date(p.game.commenceTime).toLocaleString()}
                  </div>
                  <div className="font-bold text-white mt-0.5">
                    {p.game.awayTeam} @ {p.game.homeTeam}
                  </div>
                  <div className="text-purple-300 text-sm mt-1">{p.selection}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-emerald-400 font-black text-lg">
                    {americanFromDecimal(p.offeredOdds)}
                  </div>
                  <div className="text-xs text-gray-500">{p.offeredBook}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="p-2 rounded-lg bg-white/3 border border-gray-800 text-center">
                  <div className="text-white font-bold text-sm">+{p.edgePercent.toFixed(1)}%</div>
                  <div className="text-gray-500 text-xs">Edge</div>
                </div>
                <div className="p-2 rounded-lg bg-white/3 border border-gray-800 text-center">
                  <div className="text-white font-bold text-sm">
                    {(p.fairProbability * 100).toFixed(0)}%
                  </div>
                  <div className="text-gray-500 text-xs">Fair win prob</div>
                </div>
                <div className="p-2 rounded-lg bg-white/3 border border-gray-800 text-center">
                  <div className="text-white font-bold text-sm">{p.confidence.toFixed(0)}</div>
                  <div className="text-gray-500 text-xs">Confidence</div>
                </div>
              </div>

              {p.lineMovement && (
                <div className="text-xs text-gray-400 mb-2">
                  Line has moved{" "}
                  <strong className={p.lineMovement.deltaPercentagePoints > 0 ? "text-emerald-400" : "text-yellow-400"}>
                    {p.lineMovement.deltaPercentagePoints > 0 ? "toward" : "away from"} this side
                  </strong>{" "}
                  by {Math.abs(p.lineMovement.deltaPercentagePoints).toFixed(1)} points since open.
                </div>
              )}

              {p.reasoning && (
                <p className="text-gray-400 text-xs leading-relaxed border-t border-gray-800/50 pt-2">
                  {p.reasoning}
                </p>
              )}

              <HowToBet predictionId={p.id} />
            </div>
          ))}
        </>
      )}

      <p className="text-gray-600 text-xs text-center leading-relaxed">
        IntellaBets does not accept wagers or place bets. You place your own bets at your own
        sportsbook. Positive expected value does not mean an individual bet will win. 18+ only —
        please gamble responsibly.
      </p>
    </div>
  )
}
