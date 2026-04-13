import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { statusBg, formatOdds, formatCurrency, timeAgo, SPORT_EMOJIS } from "@/lib/utils"

export default async function BetslipsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) redirect("/login")

  const betslips = await prisma.betslip.findMany({
    where: { userId: user.id },
    include: { bets: true },
    orderBy: { createdAt: "desc" },
  })

  const wonCount = betslips.filter((b) => b.status === "won").length
  const lostCount = betslips.filter((b) => b.status === "lost").length
  const pendingCount = betslips.filter((b) => b.status === "pending").length
  const totalPL = betslips.reduce((s, b) => s + b.profitLoss, 0)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">My <span className="gradient-text">Betslips</span></h1>
          <p className="text-gray-400 text-sm mt-1">Track your picks and manage results</p>
        </div>
        {user.isPremium ? (
          <Link href="/betslips/new" className="btn-primary text-sm py-2 px-4">
            + New Betslip
          </Link>
        ) : (
          <Link href="/premium" className="btn-secondary text-sm py-2 px-4">
            ✦ Go Premium to Create
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 text-center">
          <div className="text-xl font-black text-white">{betslips.length}</div>
          <div className="text-gray-500 text-xs mt-0.5">Total</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xl font-black text-emerald-400">{wonCount}</div>
          <div className="text-gray-500 text-xs mt-0.5">Won</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xl font-black text-red-400">{lostCount}</div>
          <div className="text-gray-500 text-xs mt-0.5">Lost</div>
        </div>
        <div className="card p-4 text-center">
          <div className={`text-xl font-black ${totalPL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {totalPL >= 0 ? "+" : ""}{formatCurrency(totalPL)}
          </div>
          <div className="text-gray-500 text-xs mt-0.5">Total P/L</div>
        </div>
      </div>

      {/* Betslips list */}
      {betslips.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-4">📋</div>
          <h3 className="text-white font-bold text-lg mb-2">No betslips yet</h3>
          {user.isPremium ? (
            <>
              <p className="text-gray-400 text-sm mb-6">Create your first betslip and start building your track record.</p>
              <Link href="/betslips/new" className="btn-primary text-sm py-2.5 px-6">
                Create First Betslip
              </Link>
            </>
          ) : (
            <>
              <p className="text-gray-400 text-sm mb-6">Upgrade to Premium to create betslips and earn from your subscribers.</p>
              <Link href="/premium" className="btn-primary text-sm py-2.5 px-6">
                Upgrade to Premium
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {betslips.map((slip) => (
            <Link key={slip.id} href={`/betslips/${slip.id}`}>
              <div className="card card-hover p-5 cursor-pointer">
                <div className="flex items-start gap-4">
                  <div className="text-2xl">{SPORT_EMOJIS[slip.sport] ?? "🏆"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-white">{slip.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${statusBg(slip.status)}`}>
                        {slip.status.toUpperCase()}
                      </span>
                      {slip.isPublic && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          PUBLIC
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-400">
                      {slip.league && <span className="mr-2">{slip.league}</span>}
                      {slip.bets.length} bet{slip.bets.length !== 1 ? "s" : ""} · {timeAgo(slip.createdAt)}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {slip.bets.slice(0, 3).map((bet, i) => (
                        <span key={i} className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded">
                          {bet.pick}
                        </span>
                      ))}
                      {slip.bets.length > 3 && (
                        <span className="text-xs text-gray-500">+{slip.bets.length - 3} more</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-white">{formatOdds(Math.round(slip.totalOdds))}</div>
                    <div className="text-xs text-gray-500 mt-0.5">${slip.stake} stake</div>
                    {slip.status !== "pending" && (
                      <div className={`text-sm font-bold mt-1 ${slip.profitLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {slip.profitLoss >= 0 ? "+" : ""}{formatCurrency(slip.profitLoss)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
