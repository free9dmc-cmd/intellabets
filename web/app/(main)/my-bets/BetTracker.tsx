"use client"

import { useEffect, useState, useCallback } from "react"

interface Bet {
  id: string
  matchup: string
  sport: string
  book: string
  selection: string
  oddsAmerican: string
  stake: number
  potentialPayout: number
  status: string
  actualPayout: number | null
  profit: number | null
  placedAt: string
}

interface Stats {
  total: number
  pendingCount: number
  atRisk: number
  wins: number
  losses: number
  pushes: number
  winRate: number
  staked: number
  profit: number
  roi: number
  byBook: Record<string, { staked: number; profit: number; bets: number }>
}

const STATUS_STYLE: Record<string, string> = {
  won: "text-emerald-400",
  lost: "text-red-400",
  push: "text-gray-400",
  pending: "text-yellow-400",
  void: "text-gray-500",
}

export default function BetTracker() {
  const [bets, setBets] = useState<Bet[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState("")

  const load = useCallback(async () => {
    const res = await fetch("/api/bets")
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setBets(data.bets ?? [])
      setStats(data.stats ?? null)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const sync = async () => {
    setSyncing(true)
    setMessage("")
    const res = await fetch("/api/bets/sync", { method: "POST" })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setMessage(
        data.graded > 0
          ? `Graded ${data.graded} bet${data.graded === 1 ? "" : "s"}.`
          : "Nothing new to grade — those games haven't finished yet."
      )
      await load()
    } else {
      setMessage(data.error ?? "Could not refresh results.")
    }
    setSyncing(false)
  }

  const profitColor = (v: number) =>
    v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-gray-300"

  return (
    <div className="space-y-5">
      {stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-4 text-center">
              <div className={`text-xl font-black ${profitColor(stats.profit)}`}>
                {stats.profit >= 0 ? "+" : "−"}${Math.abs(stats.profit).toFixed(2)}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">Profit</div>
            </div>
            <div className="card p-4 text-center">
              <div className={`text-xl font-black ${profitColor(stats.roi)}`}>
                {stats.roi >= 0 ? "+" : ""}{stats.roi.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500 mt-0.5">ROI</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-xl font-black text-white">
                {stats.wins}-{stats.losses}
                {stats.pushes > 0 && <span className="text-gray-500">-{stats.pushes}</span>}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{stats.winRate.toFixed(1)}% win rate</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-xl font-black text-yellow-400">${stats.atRisk.toFixed(2)}</div>
              <div className="text-xs text-gray-500 mt-0.5">{stats.pendingCount} pending</div>
            </div>
          </div>

          {stats.staked > 0 && (
            <p className="text-xs text-gray-500 text-center">
              ROI is calculated on ${stats.staked.toFixed(2)} of settled stakes. Pending bets are
              excluded so the number isn&apos;t flattered by money still in play.
            </p>
          )}

          {Object.keys(stats.byBook).length > 1 && (
            <div className="card p-4">
              <div className="font-bold text-white text-sm mb-3">By sportsbook</div>
              <div className="space-y-2">
                {Object.entries(stats.byBook)
                  .sort((a, b) => b[1].profit - a[1].profit)
                  .map(([book, s]) => (
                    <div key={book} className="flex items-center justify-between text-sm">
                      <span className="text-gray-300 capitalize">{book}</span>
                      <span className="text-gray-500 text-xs">
                        {s.bets} bet{s.bets === 1 ? "" : "s"} · ${s.staked.toFixed(2)} staked
                      </span>
                      <span className={`font-bold ${profitColor(s.profit)}`}>
                        {s.profit >= 0 ? "+" : "−"}${Math.abs(s.profit).toFixed(2)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => void sync()}
          disabled={syncing}
          className="btn-secondary text-sm py-2 px-4"
          style={{ borderRadius: "8px", opacity: syncing ? 0.6 : 1 }}
        >
          {syncing ? "Checking…" : "Refresh results"}
        </button>
        {message && <span className="text-xs text-gray-400">{message}</span>}
      </div>

      <div className="space-y-3">
        {bets.map((b) => (
          <div key={b.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-gray-500">
                  {b.sport} · {b.book} · {new Date(b.placedAt).toLocaleDateString()}
                </div>
                <div className="font-semibold text-white text-sm mt-0.5">{b.selection}</div>
                <div className="text-xs text-gray-400">{b.matchup}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`font-bold text-sm uppercase ${STATUS_STYLE[b.status] ?? "text-gray-400"}`}>
                  {b.status}
                </div>
                <div className="text-xs text-gray-500">
                  ${b.stake.toFixed(2)} @ {b.oddsAmerican}
                </div>
                {b.profit != null && (
                  <div className={`text-sm font-bold mt-0.5 ${profitColor(b.profit)}`}>
                    {b.profit >= 0 ? "+" : "−"}${Math.abs(b.profit).toFixed(2)}
                  </div>
                )}
                {b.status === "pending" && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    to win ${(b.potentialPayout - b.stake).toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
