import { requireAdminPage } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { formatCurrency } from "@/lib/utils"

export default async function AdminDashboard() {
  await requireAdminPage()

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalUsers, premiumUsers, aiSubs, activeSubs,
    payoutTotals, monthlyFees, totalBetslips, newUsers,
    recentUsers, pendingPayouts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isPremium: true } }),
    prisma.aISubscription.count({ where: { status: "active", expiresAt: { gt: now } } }),
    prisma.subscription.count({ where: { status: "active", expiresAt: { gt: now } } }),
    prisma.payout.aggregate({ _sum: { fee: true, netAmount: true }, where: { status: "paid" } }),
    prisma.payout.aggregate({ _sum: { fee: true }, where: { createdAt: { gte: startOfMonth } } }),
    prisma.betslip.count(),
    prisma.user.count({ where: { createdAt: { gte: last30 } } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, name: true, email: true, username: true, isPremium: true, createdAt: true },
    }),
    prisma.payout.findMany({
      where: { status: "pending" },
      include: { user: { select: { name: true, username: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ])

  const stats = [
    { label: "Total Users", value: totalUsers.toLocaleString(), color: "text-white", sub: `+${newUsers} this month` },
    { label: "Premium Tipsters", value: premiumUsers.toLocaleString(), color: "text-yellow-400", sub: `${((premiumUsers / totalUsers) * 100).toFixed(1)}% of users` },
    { label: "AI Subscribers", value: aiSubs.toLocaleString(), color: "text-cyan-400", sub: "Active subscriptions" },
    { label: "Active Tipster Subs", value: activeSubs.toLocaleString(), color: "text-purple-400", sub: "Paying right now" },
    { label: "Platform Revenue", value: formatCurrency(payoutTotals._sum.fee ?? 0), color: "text-emerald-400", sub: "All time fees" },
    { label: "This Month (Fees)", value: formatCurrency(monthlyFees._sum.fee ?? 0), color: "text-emerald-400", sub: new Date().toLocaleString("default", { month: "long" }) },
    { label: "Paid to Tipsters", value: formatCurrency(payoutTotals._sum.netAmount ?? 0), color: "text-white", sub: "Net payouts all time" },
    { label: "Total Betslips", value: totalBetslips.toLocaleString(), color: "text-white", sub: "Created on platform" },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-white">
          Admin <span className="gradient-text">Dashboard</span>
        </h1>
        <p className="text-gray-500 text-sm mt-1">Platform overview — {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-4">
            <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
            <div className="text-white text-xs font-medium mt-1">{stat.label}</div>
            <div className="text-gray-600 text-xs mt-0.5">{stat.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent signups */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-white">Recent Signups</h2>
            <Link href="/admin/users" className="text-purple-400 text-xs hover:text-purple-300">View all →</Link>
          </div>
          <div className="space-y-1">
            {recentUsers.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-2.5 border-b border-gray-800/50 last:border-0">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`}
                    alt={u.name}
                    className="w-8 h-8 rounded-full"
                  />
                  <div>
                    <div className="text-white text-sm font-medium">{u.name}</div>
                    <div className="text-gray-500 text-xs">@{u.username}</div>
                  </div>
                </div>
                <div className="text-right">
                  {u.isPremium && (
                    <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded font-bold">PRO</span>
                  )}
                  <div className="text-gray-600 text-xs mt-0.5">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending payouts */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-white">Pending Payouts</h2>
            <Link href="/admin/payouts" className="text-purple-400 text-xs hover:text-purple-300">Manage →</Link>
          </div>
          {pendingPayouts.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">No pending payouts ✓</div>
          ) : (
            <div className="space-y-1">
              {pendingPayouts.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-gray-800/50 last:border-0">
                  <div>
                    <div className="text-white text-sm font-medium">{p.user.name}</div>
                    <div className="text-gray-500 text-xs">Period: {p.period}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-emerald-400 font-bold text-sm">{formatCurrency(p.netAmount)}</div>
                    <div className="text-gray-600 text-xs">net</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
