"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { formatCurrency } from "@/lib/utils"

interface AdminUser {
  id: string
  name: string
  email: string
  username: string
  image: string | null
  isPremium: boolean
  isVerified: boolean
  subscriberCount: number
  totalEarnings: number
  totalWins: number
  totalLosses: number
  createdAt: string
  _count: { betslips: number; subscriptionsAsTipster: number }
}

const FILTERS = [
  { value: "all", label: "All Users" },
  { value: "premium", label: "Premium" },
  { value: "free", label: "Free" },
  { value: "verified", label: "Verified" },
]

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [updating, setUpdating] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ filter, page: String(page), ...(search && { search }) })
    const res = await fetch(`/api/admin/users?${params}`)
    const data = await res.json()
    setUsers(data.users ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [search, filter, page])

  useEffect(() => {
    const t = setTimeout(fetchUsers, search ? 400 : 0)
    return () => clearTimeout(t)
  }, [fetchUsers, search])

  const patch = async (userId: string, body: object) => {
    setUpdating(userId)
    await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    await fetchUsers()
    setUpdating(null)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-white">
          User <span className="gradient-text">Management</span>
        </h1>
        <p className="text-gray-500 text-sm mt-1">{total.toLocaleString()} total users</p>
      </div>

      {/* Filters & search */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search name, email, username..."
          className="input-dark text-sm py-2 max-w-xs"
        />
        <div className="flex gap-1 bg-gray-900 rounded-lg p-1 border border-gray-800">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setFilter(f.value); setPage(1) }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filter === f.value ? "bg-purple-500/20 text-purple-300" : "text-gray-400 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No users found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {["User", "Email", "Plan", "Subscribers", "Earnings", "Record", "Joined", "Actions"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-800/50 hover:bg-white/2 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={u.image ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`}
                          alt={u.name}
                          className="w-8 h-8 rounded-full flex-shrink-0"
                        />
                        <div>
                          <Link href={`/profile/${u.username}`} className="text-white text-sm font-medium hover:text-purple-300">
                            {u.name}
                          </Link>
                          <div className="text-gray-500 text-xs flex items-center gap-1">
                            @{u.username}
                            {u.isVerified && <span className="text-blue-400">✓</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${
                        u.isPremium
                          ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                          : "bg-gray-500/10 text-gray-500 border-gray-700"
                      }`}>
                        {u.isPremium ? "PRO" : "FREE"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{u.subscriberCount}</td>
                    <td className="px-4 py-3 text-emerald-400 text-sm font-medium">{formatCurrency(u.totalEarnings)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="text-emerald-400">{u.totalWins}W</span>
                      <span className="text-gray-600"> / </span>
                      <span className="text-red-400">{u.totalLosses}L</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => patch(u.id, { isPremium: !u.isPremium })}
                          disabled={updating === u.id}
                          className={`text-xs px-2 py-1 rounded border font-medium transition-all ${
                            u.isPremium
                              ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                              : "border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                          }`}
                        >
                          {u.isPremium ? "Remove PRO" : "Add PRO"}
                        </button>
                        <button
                          onClick={() => patch(u.id, { isVerified: !u.isVerified })}
                          disabled={updating === u.id}
                          className={`text-xs px-2 py-1 rounded border font-medium transition-all ${
                            u.isVerified
                              ? "border-gray-700 text-gray-500 hover:bg-gray-500/10"
                              : "border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                          }`}
                        >
                          {u.isVerified ? "Unverify" : "Verify ✓"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > 25 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <span className="text-gray-500 text-sm">
              Showing {((page - 1) * 25) + 1}–{Math.min(page * 25, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary text-xs py-1.5 px-3"
                style={{ borderRadius: "6px", opacity: page === 1 ? 0.4 : 1 }}
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * 25 >= total}
                className="btn-secondary text-xs py-1.5 px-3"
                style={{ borderRadius: "6px", opacity: page * 25 >= total ? 0.4 : 1 }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
