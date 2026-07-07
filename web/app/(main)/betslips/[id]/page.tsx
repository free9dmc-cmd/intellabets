import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { statusBg, formatOdds, formatCurrency, timeAgo, SPORT_EMOJIS } from "@/lib/utils"
import SettleForm from "./SettleForm"

export default async function BetslipDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)

  const betslip = await prisma.betslip.findUnique({
    where: { id: params.id },
    include: {
      bets: true,
      user: {
        select: {
          id: true, username: true, name: true, image: true,
          isPremium: true, isVerified: true, winRate: true, subscriberCount: true,
        },
      },
    },
  })

  if (!betslip) notFound()

  // Access control
  const isOwner = session?.user?.id === betslip.userId
  let hasAccess = betslip.isPublic || isOwner

  if (!hasAccess && session?.user) {
    const sub = await prisma.subscription.findUnique({
      where: {
        subscriberId_tipsterId: { subscriberId: session.user.id, tipsterId: betslip.userId },
      },
    })
    hasAccess = sub?.status === "active" && (sub.expiresAt > new Date())
  }

  if (!hasAccess) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <div className="text-5xl mb-4">🔐</div>
        <h1 className="text-xl font-bold text-white mb-2">Premium Content</h1>
        <p className="text-gray-400 mb-6">
          Subscribe to <span className="text-white font-semibold">@{betslip.user.username}</span> to access this betslip.
        </p>
        <Link href={`/profile/${betslip.user.username}`} className="btn-primary">
          View Profile & Subscribe
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link href="/betslips" className="text-gray-400 hover:text-white text-sm">← Back</Link>
      </div>

      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{SPORT_EMOJIS[betslip.sport] ?? "🏆"}</span>
              <h1 className="text-xl font-black text-white">{betslip.title}</h1>
            </div>
            {betslip.description && (
              <p className="text-gray-400 text-sm mt-1">{betslip.description}</p>
            )}
            <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
              {betslip.league && <span>{betslip.league}</span>}
              <span>{timeAgo(betslip.createdAt)}</span>
              {betslip.isPublic && <span className="text-blue-400">Public</span>}
              {betslip.isAI && <span className="text-purple-400">🧠 AI Generated</span>}
            </div>
          </div>
          <span className={`text-sm px-3 py-1 rounded-full font-medium border ${statusBg(betslip.status)}`}>
            {betslip.status.toUpperCase()}
          </span>
        </div>

        {/* Tipster */}
        <Link href={`/profile/${betslip.user.username}`}>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-white/3 border border-gray-800 hover:border-gray-700 transition-colors">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={betslip.user.image ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${betslip.user.username}`}
              alt={betslip.user.name}
              className="w-9 h-9 rounded-full"
            />
            <div>
              <div className="text-white text-sm font-medium flex items-center gap-1">
                {betslip.user.name}
                {betslip.user.isVerified && <span className="text-blue-400 text-xs">✓</span>}
              </div>
              <div className="text-gray-500 text-xs">@{betslip.user.username}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-emerald-400 font-bold text-sm">
                {(betslip.user.winRate * 100).toFixed(1)}% win
              </div>
            </div>
          </div>
        </Link>

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="text-center p-3 rounded-lg bg-white/3 border border-gray-800">
            <div className="font-bold text-white">{formatOdds(Math.round(betslip.totalOdds))}</div>
            <div className="text-gray-500 text-xs">Odds</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-white/3 border border-gray-800">
            <div className="font-bold text-white">{formatCurrency(betslip.stake)}</div>
            <div className="text-gray-500 text-xs">Stake</div>
          </div>
          <div className={`text-center p-3 rounded-lg border ${betslip.status === "pending" ? "bg-white/3 border-gray-800" : betslip.profitLoss >= 0 ? "bg-emerald-500/8 border-emerald-500/20" : "bg-red-500/8 border-red-500/20"}`}>
            <div className={`font-bold ${betslip.status === "pending" ? "text-white" : betslip.profitLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {betslip.status === "pending"
                ? formatCurrency(betslip.potentialReturn)
                : (betslip.profitLoss >= 0 ? "+" : "") + formatCurrency(betslip.profitLoss)}
            </div>
            <div className="text-gray-500 text-xs">
              {betslip.status === "pending" ? "To Win" : "P/L"}
            </div>
          </div>
        </div>
      </div>

      {/* Individual bets */}
      <div className="card p-6 space-y-4">
        <h2 className="font-bold text-white text-sm uppercase tracking-wide">Picks ({betslip.bets.length})</h2>
        {betslip.bets.map((bet, i) => (
          <div key={bet.id} className="p-4 rounded-lg border border-gray-800" style={{ background: "rgba(255,255,255,0.02)" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="font-medium text-white text-sm">{bet.game}</div>
                <div className="text-purple-300 text-sm mt-0.5 font-medium">{bet.pick}</div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span className="capitalize">{bet.betType}</span>
                  {bet.line && <span>Line: {bet.line}</span>}
                  {bet.gameDate && <span>{new Date(bet.gameDate).toLocaleDateString()}</span>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`font-bold ${bet.odds > 0 ? "text-emerald-400" : "text-white"}`}>
                  {formatOdds(Math.round(bet.odds))}
                </div>
                {bet.result && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${statusBg(bet.result)} mt-1 inline-block`}>
                    {bet.result.toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Settle form (owner only, pending only) */}
      {isOwner && betslip.status === "pending" && (
        <SettleForm betslipId={betslip.id} bets={betslip.bets.map((b) => ({ id: b.id, pick: b.pick }))} />
      )}
    </div>
  )
}
