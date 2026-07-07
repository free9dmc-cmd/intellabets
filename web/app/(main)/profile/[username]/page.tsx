import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { formatOdds, statusBg, timeAgo, SPORT_EMOJIS, formatCurrency } from "@/lib/utils"
import SubscribeButton from "./SubscribeButton"

export default async function ProfilePage({ params }: { params: { username: string } }) {
  const session = await getServerSession(authOptions)

  const user = await prisma.user.findUnique({
    where: { username: params.username.toLowerCase() },
    select: {
      id: true, username: true, name: true, image: true, bio: true,
      specialties: true, subscriptionPrice: true, isPremium: true,
      isVerified: true, totalWins: true, totalLosses: true, totalPushes: true,
      winRate: true, roi: true, subscriberCount: true, totalEarnings: true, createdAt: true,
    },
  })

  if (!user) notFound()

  const isOwner = session?.user?.id === user.id
  let isSubscribed = false

  if (!isOwner && session?.user) {
    const sub = await prisma.subscription.findUnique({
      where: { subscriberId_tipsterId: { subscriberId: session.user.id, tipsterId: user.id } },
    })
    isSubscribed = sub?.status === "active" && (sub.expiresAt > new Date())
  }

  const betslipWhere = {
    userId: user.id,
    ...(isOwner || isSubscribed ? {} : { isPublic: true }),
  }

  const betslips = await prisma.betslip.findMany({
    where: betslipWhere,
    include: { bets: true },
    orderBy: { createdAt: "desc" },
    take: 12,
  })

  const total = user.totalWins + user.totalLosses
  const winRatePct = total > 0 ? ((user.totalWins / total) * 100).toFixed(1) : "N/A"
  const sports = user.specialties?.split(",").map((s) => s.trim()).filter(Boolean) ?? []

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Profile header */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row items-start gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={user.image ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}
            alt={user.name}
            className="w-20 h-20 rounded-full flex-shrink-0"
          />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-black text-white">{user.name}</h1>
              {user.isVerified && (
                <span className="text-blue-400 bg-blue-500/10 border border-blue-500/20 text-xs px-2 py-0.5 rounded-full font-medium">
                  ✓ Verified
                </span>
              )}
              {user.isPremium && (
                <span className="text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 text-xs px-2 py-0.5 rounded-full font-bold">
                  PREMIUM
                </span>
              )}
            </div>
            <p className="text-gray-500 text-sm mb-3">@{user.username}</p>
            {user.bio && <p className="text-gray-300 text-sm mb-3 leading-relaxed">{user.bio}</p>}
            {sports.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {sports.map((s) => (
                  <span key={s} className="text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full">
                    {SPORT_EMOJIS[s] ?? ""} {s}
                  </span>
                ))}
              </div>
            )}
          </div>
          {!isOwner && user.isPremium && (
            <SubscribeButton
              tipsterId={user.id}
              tipsterName={user.name}
              tipsterUsername={user.username}
              price={user.subscriptionPrice}
              initialSubscribed={isSubscribed}
              isLoggedIn={!!session}
            />
          )}
          {isOwner && (
            <Link href="/settings" className="btn-secondary text-sm py-2 px-4">
              Edit Profile
            </Link>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-gray-800">
          <div className="text-center">
            <div className={`text-2xl font-black ${winRatePct !== "N/A" && parseFloat(winRatePct) >= 55 ? "text-emerald-400" : "text-white"}`}>
              {winRatePct === "N/A" ? "N/A" : `${winRatePct}%`}
            </div>
            <div className="text-gray-500 text-xs mt-0.5">Win Rate</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-black ${user.roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {user.roi >= 0 ? "+" : ""}{user.roi.toFixed(1)}%
            </div>
            <div className="text-gray-500 text-xs mt-0.5">ROI</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-white">
              {user.totalWins}W/{user.totalLosses}L
            </div>
            <div className="text-gray-500 text-xs mt-0.5">Record</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black text-purple-400">{user.subscriberCount}</div>
            <div className="text-gray-500 text-xs mt-0.5">Subscribers</div>
          </div>
        </div>
      </div>

      {/* Subscription CTA */}
      {!isOwner && user.isPremium && !isSubscribed && (
        <div className="card p-5 border-purple-500/20" style={{ background: "rgba(124,58,237,0.05)" }}>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="font-bold text-white mb-1">🔒 Access Premium Betslips</p>
              <p className="text-gray-400 text-sm">
                Subscribe to unlock {user.name}&apos;s private picks and receive notifications for new betslips.
              </p>
            </div>
            <SubscribeButton
              tipsterId={user.id}
              tipsterName={user.name}
              tipsterUsername={user.username}
              price={user.subscriptionPrice}
              initialSubscribed={false}
              isLoggedIn={!!session}
              variant="large"
            />
          </div>
        </div>
      )}

      {/* Betslips */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white">
            {isOwner || isSubscribed ? "All Betslips" : "Public Betslips"}
            <span className="text-gray-500 font-normal text-sm ml-2">({betslips.length})</span>
          </h2>
          {isOwner && (
            <Link href="/betslips/new" className="btn-primary text-sm py-1.5 px-4">
              + New
            </Link>
          )}
        </div>

        {betslips.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-400">
              {isSubscribed ? "No betslips yet." : "Subscribe to see private picks."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {betslips.map((slip) => (
              <Link key={slip.id} href={`/betslips/${slip.id}`}>
                <div className="card card-hover p-4 cursor-pointer">
                  <div className="flex items-start gap-3">
                    <span className="text-xl">{SPORT_EMOJIS[slip.sport] ?? "🏆"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-white text-sm">{slip.title}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium border ${statusBg(slip.status)}`}>
                          {slip.status.toUpperCase()}
                        </span>
                        {slip.isAI && <span className="text-xs text-purple-400">🧠 AI</span>}
                      </div>
                      <div className="text-xs text-gray-500">
                        {slip.bets.length} bet{slip.bets.length !== 1 ? "s" : ""} · {timeAgo(slip.createdAt)}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-white text-sm">{formatOdds(Math.round(slip.totalOdds))}</div>
                      {slip.status !== "pending" && (
                        <div className={`text-xs ${slip.profitLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}>
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
    </div>
  )
}
