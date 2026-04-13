import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { formatCurrency, formatWinRate, statusBg, timeAgo, SPORT_EMOJIS } from "@/lib/utils"

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      aiSubscription: true,
      subscriptionsAsTipster: { where: { status: "active" } },
    },
  })

  if (!user) redirect("/login")

  const myBetslips = await prisma.betslip.findMany({
    where: { userId: user.id },
    include: { bets: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  })

  const mySubs = await prisma.subscription.findMany({
    where: { subscriberId: user.id, status: "active" },
    include: {
      tipster: { select: { username: true, name: true, image: true, winRate: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 4,
  })

  const hasAI = user.aiSubscription?.status === "active" && user.aiSubscription.expiresAt > new Date()
  const winRate = formatWinRate(user.totalWins, user.totalLosses)
  const totalBets = user.totalWins + user.totalLosses + user.totalPushes
  const pendingCount = await prisma.betslip.count({ where: { userId: user.id, status: "pending" } })

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">
            Welcome back, <span className="gradient-text">{user.name.split(" ")[0]}</span> 👋
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            @{user.username}
            {user.isPremium && (
              <span className="ml-2 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-xs px-2 py-0.5 rounded-full font-bold">
                PREMIUM TIPSTER
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {user.isPremium && (
            <Link href="/betslips/new" className="btn-primary text-sm py-2 px-4">
              + New Betslip
            </Link>
          )}
          {!user.isPremium && (
            <Link href="/premium" className="text-sm py-2 px-4 rounded-lg font-semibold border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 transition-colors">
              ✦ Go Premium
            </Link>
          )}
          {!hasAI && (
            <Link href="/ai-picks" className="btn-secondary text-sm py-2 px-4">
              🧠 AI Picks
            </Link>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-gray-500 text-xs mb-1 uppercase tracking-wide">Win Rate</div>
          <div className={`text-2xl font-black ${winRate === "N/A" ? "text-gray-400" : "text-emerald-400"}`}>
            {winRate}
          </div>
          <div className="text-gray-600 text-xs mt-1">{user.totalWins}W / {user.totalLosses}L</div>
        </div>
        <div className="card p-4">
          <div className="text-gray-500 text-xs mb-1 uppercase tracking-wide">Total Bets</div>
          <div className="text-2xl font-black text-white">{totalBets}</div>
          <div className="text-gray-600 text-xs mt-1">{pendingCount} pending</div>
        </div>
        <div className="card p-4">
          <div className="text-gray-500 text-xs mb-1 uppercase tracking-wide">ROI</div>
          <div className={`text-2xl font-black ${user.roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {user.roi >= 0 ? "+" : ""}{user.roi.toFixed(1)}%
          </div>
          <div className="text-gray-600 text-xs mt-1">All settled bets</div>
        </div>
        {user.isPremium ? (
          <div className="card p-4 border-yellow-500/20">
            <div className="text-gray-500 text-xs mb-1 uppercase tracking-wide">Subscribers</div>
            <div className="text-2xl font-black text-yellow-400">{user.subscriberCount}</div>
            <div className="text-gray-600 text-xs mt-1">
              ~{formatCurrency(user.subscriberCount * user.subscriptionPrice * 0.8)}/mo earned
            </div>
          </div>
        ) : (
          <div className="card p-4">
            <div className="text-gray-500 text-xs mb-1 uppercase tracking-wide">Subscriptions</div>
            <div className="text-2xl font-black text-purple-400">{mySubs.length}</div>
            <div className="text-gray-600 text-xs mt-1">Active tipsters</div>
          </div>
        )}
      </div>

      {/* Quick action cards */}
      {!user.isPremium && (
        <div className="card p-6 border-purple-500/20" style={{ background: "rgba(124,58,237,0.05)" }}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-purple-400 text-xl">✦</span>
                <h3 className="font-bold text-white">Upgrade to Premium Tipster</h3>
              </div>
              <p className="text-gray-400 text-sm">
                Create betslips, build your subscriber base, and earn real monthly income from your sports knowledge.
              </p>
            </div>
            <Link href="/premium" className="btn-primary text-sm py-2.5 px-6 whitespace-nowrap" style={{ borderRadius: "8px" }}>
              Upgrade — $19.99/mo
            </Link>
          </div>
        </div>
      )}

      {!hasAI && (
        <div className="card p-6 border-cyan-500/20" style={{ background: "rgba(6,182,212,0.03)" }}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-cyan-400 text-xl">🧠</span>
                <h3 className="font-bold text-white">Unlock AI Predictions</h3>
              </div>
              <p className="text-gray-400 text-sm">
                Get unlimited AI-generated betslips across all sports. Single bets, parlays, and SGPs — all analyzed by Claude.
              </p>
            </div>
            <Link href="/ai-picks" className="whitespace-nowrap text-sm py-2.5 px-6 rounded-lg font-semibold"
              style={{ background: "rgba(6,182,212,0.1)", color: "#06b6d4", border: "1px solid rgba(6,182,212,0.3)" }}>
              Subscribe — $9.99/mo
            </Link>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Recent betslips */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-white">Recent Betslips</h2>
            <Link href="/betslips" className="text-purple-400 text-sm hover:text-purple-300">
              View all →
            </Link>
          </div>

          {myBetslips.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-gray-400 mb-4">No betslips yet</p>
              {user.isPremium ? (
                <Link href="/betslips/new" className="btn-primary text-sm py-2 px-4">
                  Create Your First Betslip
                </Link>
              ) : (
                <Link href="/premium" className="btn-secondary text-sm py-2 px-4">
                  Go Premium to Create Betslips
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {myBetslips.map((slip) => (
                <Link key={slip.id} href={`/betslips/${slip.id}`}>
                  <div className="card card-hover p-4 cursor-pointer">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm">{SPORT_EMOJIS[slip.sport] ?? "🏆"}</span>
                          <span className="font-medium text-white text-sm truncate">{slip.title}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {slip.bets.length} bet{slip.bets.length !== 1 ? "s" : ""} · {timeAgo(slip.createdAt)}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${statusBg(slip.status)}`}>
                          {slip.status.toUpperCase()}
                        </span>
                        <div className="text-xs text-gray-500 mt-1">
                          {slip.totalOdds > 0 ? "+" : ""}{Math.round(slip.totalOdds)}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* My subscriptions / subscribers */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-white">
              {user.isPremium ? "My Subscribers" : "Following"}
            </h2>
            <Link href="/leaderboard" className="text-purple-400 text-sm hover:text-purple-300">
              Browse tipsters →
            </Link>
          </div>

          {mySubs.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="text-4xl mb-3">🔭</div>
              <p className="text-gray-400 mb-4">
                {user.isPremium
                  ? "No subscribers yet. Share your profile to attract followers."
                  : "Not following any tipsters yet."}
              </p>
              <Link href="/leaderboard" className="btn-secondary text-sm py-2 px-4">
                Browse Leaderboard
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {mySubs.map((sub) => (
                <Link key={sub.id} href={`/profile/${sub.tipster.username}`}>
                  <div className="card card-hover p-4 cursor-pointer flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sub.tipster.image ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${sub.tipster.username}`}
                      alt={sub.tipster.name}
                      className="w-10 h-10 rounded-full"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-white text-sm">{sub.tipster.name}</div>
                      <div className="text-xs text-gray-500">@{sub.tipster.username}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-emerald-400 font-bold text-sm">
                        {(sub.tipster.winRate * 100).toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500">win rate</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
