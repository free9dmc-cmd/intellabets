"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { formatCurrency, SPORTS, SPORT_EMOJIS } from "@/lib/utils"

interface Tipster {
  id: string
  username: string
  name: string
  image: string | null
  isPremium: boolean
  isVerified: boolean
  bio: string | null
  specialties: string | null
  subscriptionPrice: number
  totalWins: number
  totalLosses: number
  totalPushes: number
  winRate: number
  roi: number
  totalEarnings: number
  subscriberCount: number
}

const SORT_OPTIONS = [
  { value: "winRate", label: "Win Rate" },
  { value: "roi", label: "ROI" },
  { value: "subscribers", label: "Subscribers" },
  { value: "earnings", label: "Earnings" },
]

export default function LeaderboardPage() {
  const [tipsters, setTipsters] = useState<Tipster[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState("winRate")
  const [sport, setSport] = useState("")

  useEffect(() => {
    const params = new URLSearchParams({ sortBy, ...(sport && { sport }) })
    fetch(`/api/leaderboard?${params}`)
      .then((r) => r.json())
      .then((d) => setTipsters(d.tipsters ?? []))
      .finally(() => setLoading(false))
  }, [sortBy, sport])

  const winRate = (t: Tipster) => {
    const total = t.totalWins + t.totalLosses
    if (total === 0) return "N/A"
    return `${((t.totalWins / total) * 100).toFixed(1)}%`
  }

  const rankBadge = (i: number) => {
    if (i === 0) return "👑"
    if (i === 1) return "🥈"
    if (i === 2) return "🥉"
    return `#${i + 1}`
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white mb-1">
          🏆 Tipster <span className="gradient-text">Leaderboard</span>
        </h1>
        <p className="text-gray-400 text-sm">Ranked by verified win rates and ROI. No fake claims.</p>
      </div>

      {/* Top 3 cards */}
      {!loading && tipsters.length >= 3 && (
        <div className="grid md:grid-cols-3 gap-4 mb-2">
          {tipsters.slice(0, 3).map((t, i) => (
            <Link key={t.id} href={`/profile/${t.username}`}>
              <div className={`card card-hover p-5 cursor-pointer ${i === 0 ? "border-yellow-500/30 premium-glow" : ""}`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={t.image ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${t.username}`}
                      alt={t.name}
                      className="w-12 h-12 rounded-full"
                    />
                    <span className="absolute -top-1 -left-1 text-lg">{rankBadge(i)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white truncate">{t.name}</div>
                    <div className="text-xs text-gray-500">@{t.username}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 rounded-lg" style={{ background: "rgba(16,185,129,0.08)" }}>
                    <div className="text-emerald-400 font-black">{winRate(t)}</div>
                    <div className="text-gray-500 text-xs">Win Rate</div>
                  </div>
                  <div className="p-2 rounded-lg" style={{ background: "rgba(124,58,237,0.08)" }}>
                    <div className="text-purple-400 font-black">+{t.roi.toFixed(1)}%</div>
                    <div className="text-gray-500 text-xs">ROI</div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
                  <span className="text-xs text-gray-500">{t.subscriberCount} subscribers</span>
                  <span className="text-white font-bold text-sm">${t.subscriptionPrice}/mo</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-gray-900 rounded-lg p-1 border border-gray-800">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                sortBy === opt.value
                  ? "bg-purple-500/20 text-purple-300"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <select
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          className="input-dark text-sm py-2"
          style={{ width: "auto" }}
        >
          <option value="">All Sports</option>
          {SPORTS.map((s) => (
            <option key={s} value={s}>{SPORT_EMOJIS[s]} {s}</option>
          ))}
        </select>
      </div>

      {/* Full table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading leaderboard...</div>
        ) : tipsters.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">🏆</div>
            <p className="text-gray-400">No tipsters found. Be the first to join!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide">#</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wide">Tipster</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 uppercase tracking-wide">Record</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 uppercase tracking-wide">Win %</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 uppercase tracking-wide">ROI</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 uppercase tracking-wide hidden md:table-cell">Subscribers</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 uppercase tracking-wide">Price</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {tipsters.map((t, i) => (
                  <tr
                    key={t.id}
                    className="border-b border-gray-800/50 hover:bg-white/2 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className={`font-bold text-sm ${i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : "text-gray-500"}`}>
                        {rankBadge(i)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={t.image ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${t.username}`}
                          alt={t.name}
                          className="w-9 h-9 rounded-full flex-shrink-0"
                        />
                        <div>
                          <div className="font-medium text-white text-sm flex items-center gap-1">
                            {t.name}
                            {t.isVerified && <span className="text-blue-400 text-xs">✓</span>}
                          </div>
                          <div className="text-xs text-gray-500">
                            {t.specialties ? t.specialties.split(",").slice(0, 2).map(s => SPORT_EMOJIS[s.trim()] ?? "").join(" ") : ""} @{t.username}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-emerald-400 text-sm font-medium">{t.totalWins}W</span>
                      <span className="text-gray-600 text-sm"> - </span>
                      <span className="text-red-400 text-sm font-medium">{t.totalLosses}L</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${t.winRate >= 0.55 ? "text-emerald-400" : t.winRate >= 0.5 ? "text-yellow-400" : "text-red-400"}`}>
                        {winRate(t)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${t.roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {t.roi >= 0 ? "+" : ""}{t.roi.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      <span className="text-gray-300 text-sm">{t.subscriberCount.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-white font-bold text-sm">${t.subscriptionPrice}</span>
                      <span className="text-gray-500 text-xs">/mo</span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/profile/${t.username}`}
                        className="text-xs btn-secondary py-1.5 px-3"
                        style={{ borderRadius: "6px", display: "inline-block" }}
                      >
                        View
                      </Link>
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
