"use client"

import { useState, useEffect, useCallback } from "react"
import { formatCurrency } from "@/lib/utils"

interface AdminPayout {
  id: string
  amount: number
  fee: number
  netAmount: number
  period: string
  status: string
  createdAt: string
  paidAt: string | null
  user: { id: string; name: string; username: string; email: string; image: string | null }
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "paid", label: "Paid" },
]

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<AdminPayout[]>([])
  const [pendingTotal, setPendingTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("pending")
  const [updating, setUpdating] = useState<string | null>(null)

  const fetchPayouts = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/payouts?status=${statusFilter}`)
    const data = await res.json()
    setPayouts(data.payouts ?? [])
    setPendingTotal(data.pendingTotal ?? 0)
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { fetchPayouts() }, [fetchPayouts])

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id)
    await fetch(`/api/admin/payouts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    await fetchPayouts()
    setUpdating(null)
  }

  const statusStyle = (s: string) => {
    if (s === "paid") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    if (s === "processing") return "bg-blue-500/10 text-blue-400 border-blue-500/20"
    return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">
            Payout <span className="gradient-text">Management</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Total pending: <span className="text-yellow-400 font-bold">{formatCurrency(pendingTotal)}</span>
          </p>
        </div>
        {/* Bulk mark all pending as processing */}
        {statusFilter === "pending" && payouts.length > 0 && (
          <button
            onClick={async () => {
              setLoading(true)
              await Promise.all(payouts.map((p) => updateStatus(p.id, "processing")))
              fetchPayouts()
            }}
            className="btn-secondary text-sm py-2 px-4"
          >
            Mark All as Processing
          </button>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 border border-gray-800 w-fit">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              statusFilter === f.value ? "bg-purple-500/20 text-purple-300" : "text-gray-400 hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading payouts...</div>
        ) : payouts.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No {statusFilter !== "all" ? statusFilter : ""} payouts
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {["Tipster", "Period", "Gross", "Fee (20%)", "Net Payout", "Status", "Requested", "Actions"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} className="border-b border-gray-800/50 hover:bg-white/2 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.user.image ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.user.username}`}
                          alt={p.user.name}
                          className="w-7 h-7 rounded-full flex-shrink-0"
                        />
                        <div>
                          <div className="text-white text-sm font-medium">{p.user.name}</div>
                          <div className="text-gray-500 text-xs">@{p.user.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-sm font-medium">{p.period}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3 text-red-400 text-sm">-{formatCurrency(p.fee)}</td>
                    <td className="px-4 py-3 text-emerald-400 font-bold text-sm">{formatCurrency(p.netAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${statusStyle(p.status)}`}>
                        {p.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {p.status === "pending" && (
                          <button
                            onClick={() => updateStatus(p.id, "processing")}
                            disabled={updating === p.id}
                            className="text-xs px-2 py-1 rounded border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-all font-medium"
                          >
                            Processing
                          </button>
                        )}
                        {(p.status === "pending" || p.status === "processing") && (
                          <button
                            onClick={() => updateStatus(p.id, "paid")}
                            disabled={updating === p.id}
                            className="text-xs px-2 py-1 rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-all font-medium"
                          >
                            ✓ Mark Paid
                          </button>
                        )}
                        {p.status === "paid" && (
                          <span className="text-gray-600 text-xs">
                            Paid {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : ""}
                          </span>
                        )}
                      </div>
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
