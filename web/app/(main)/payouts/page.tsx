import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { formatCurrency } from "@/lib/utils"

export default async function PayoutsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user?.isPremium) redirect("/premium")

  const payouts = await prisma.payout.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  })

  const totalPaid = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.netAmount, 0)
  const totalPending = payouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.netAmount, 0)

  // Monthly sub revenue estimate
  const activeSubCount = await prisma.subscription.count({
    where: { tipsterId: user.id, status: "active", expiresAt: { gt: new Date() } },
  })
  const monthlyGross = activeSubCount * user.subscriptionPrice
  const monthlyNet = monthlyGross * 0.8

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-2xl font-black text-white">
        💰 <span className="gradient-text">Payouts</span>
      </h1>

      {/* Revenue overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <div className="text-xl font-black text-emerald-400">{formatCurrency(totalPaid)}</div>
          <div className="text-gray-500 text-xs mt-0.5">Total Paid Out</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xl font-black text-yellow-400">{formatCurrency(totalPending)}</div>
          <div className="text-gray-500 text-xs mt-0.5">Pending</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xl font-black text-purple-400">{activeSubCount}</div>
          <div className="text-gray-500 text-xs mt-0.5">Active Subs</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xl font-black text-white">{formatCurrency(monthlyNet)}</div>
          <div className="text-gray-500 text-xs mt-0.5">Est. This Month</div>
        </div>
      </div>

      {/* Revenue breakdown */}
      <div className="card p-5">
        <h2 className="font-bold text-white mb-4">Revenue Breakdown</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b border-gray-800">
            <span className="text-gray-400">Active subscribers</span>
            <span className="text-white font-medium">{activeSubCount}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-800">
            <span className="text-gray-400">Your sub price</span>
            <span className="text-white font-medium">${user.subscriptionPrice}/mo</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-800">
            <span className="text-gray-400">Monthly gross</span>
            <span className="text-white font-medium">{formatCurrency(monthlyGross)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-800">
            <span className="text-gray-400">Platform fee (20%)</span>
            <span className="text-red-400 font-medium">-{formatCurrency(monthlyGross * 0.2)}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-gray-300 font-semibold">Your monthly earnings</span>
            <span className="text-emerald-400 font-black text-lg">{formatCurrency(monthlyNet)}</span>
          </div>
        </div>
      </div>

      {/* Request payout */}
      {monthlyNet >= 10 && (
        <form action="/api/payouts" method="POST">
          <button
            type="submit"
            className="btn-primary w-full py-3 font-semibold"
            style={{ borderRadius: "10px" }}
            formAction="/api/payouts"
          >
            Request Payout for This Month
          </button>
        </form>
      )}

      {/* Payout history */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-gray-800">
          <h2 className="font-bold text-white">Payout History</h2>
        </div>
        {payouts.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            No payouts yet. Build your subscriber base to start earning!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-5 py-3 text-xs text-gray-500 uppercase">Period</th>
                  <th className="text-right px-5 py-3 text-xs text-gray-500 uppercase">Gross</th>
                  <th className="text-right px-5 py-3 text-xs text-gray-500 uppercase">Fee</th>
                  <th className="text-right px-5 py-3 text-xs text-gray-500 uppercase">Net Payout</th>
                  <th className="text-right px-5 py-3 text-xs text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} className="border-b border-gray-800/50">
                    <td className="px-5 py-3 text-gray-300 font-medium">{p.period}</td>
                    <td className="px-5 py-3 text-right text-gray-300">{formatCurrency(p.amount)}</td>
                    <td className="px-5 py-3 text-right text-red-400">-{formatCurrency(p.fee)}</td>
                    <td className="px-5 py-3 text-right font-bold text-emerald-400">{formatCurrency(p.netAmount)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                        p.status === "paid" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                        p.status === "processing" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                        "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                      }`}>
                        {p.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
