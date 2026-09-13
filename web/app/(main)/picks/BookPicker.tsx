"use client"

import { useState } from "react"

interface BookOption {
  book: string
  bookName: string
  oddsAmerican: string
  oddsDecimal: number
  payout: number
  profit: number
  link: string | null
  isBest: boolean
  isPreferred: boolean
  lessThanBest: number
}

interface Comparison {
  selection: string
  matchup: string
  stake: number
  options: BookOption[]
  note: string
  disclaimer: string
  pricesAsOf: string | null
}

export default function BookPicker({
  predictionId,
  sport,
  marketType,
}: {
  predictionId: string
  sport: string
  marketType: string
}) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Comparison | null>(null)
  const [stake, setStake] = useState("100")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [loggedBook, setLoggedBook] = useState<string | null>(null)

  const load = async (amount: string) => {
    setLoading(true)
    setError("")
    const res = await fetch(
      `/api/engine/books/${predictionId}?stake=${encodeURIComponent(amount || "100")}`
    )
    const json = await res.json().catch(() => ({}))
    if (res.ok) setData(json)
    else setError(json.error ?? "Could not load prices.")
    setLoading(false)
  }

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && !data) await load(stake)
  }

  const logBet = async (o: BookOption) => {
    if (!data) return
    const res = await fetch("/api/bets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        predictionId,
        matchup: data.matchup,
        sport,
        marketType,
        book: o.book,
        selection: data.selection,
        oddsDecimal: o.oddsDecimal,
        stake: data.stake,
      }),
    })
    if (res.ok) setLoggedBook(o.book)
    else {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? "Could not log that bet.")
    }
  }

  return (
    <div className="mt-3 border-t border-gray-800 pt-3">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between text-left group"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-cyan-400 group-hover:text-cyan-300 transition-colors">
          💰 Compare sportsbooks
        </span>
        <span className="text-gray-500 text-xs">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {loading && <p className="text-gray-500 text-sm">Checking prices…</p>}
          {error && (
            <p className="text-red-400 text-sm p-2 rounded bg-red-500/10 border border-red-500/20">
              {error}
            </p>
          )}

          {data && (
            <>
              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-500 whitespace-nowrap">Stake $</label>
                <input
                  type="number"
                  min="1"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="input-dark text-sm py-1.5 flex-1"
                />
                <button
                  onClick={() => load(stake)}
                  className="btn-secondary text-xs py-1.5 px-3 whitespace-nowrap"
                  style={{ borderRadius: "6px" }}
                >
                  Update
                </button>
              </div>

              {data.options.length === 0 && (
                <p className="text-gray-500 text-sm">No current prices for this selection.</p>
              )}

              {data.options.map((o) => (
                <div
                  key={o.book}
                  className={`p-3 rounded-lg border ${
                    o.isBest
                      ? "bg-emerald-500/8 border-emerald-500/30"
                      : "bg-white/3 border-gray-800"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <span className="text-white font-semibold text-sm">{o.bookName}</span>
                      {o.isBest && (
                        <span className="ml-2 text-xs text-emerald-400 font-bold">BEST</span>
                      )}
                      {o.isPreferred && (
                        <span className="ml-2 text-xs text-purple-400">your book</span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-white font-bold text-sm">
                        ${o.payout.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {o.oddsAmerican}
                        {o.lessThanBest > 0 && (
                          <span className="text-yellow-500/80"> · −${o.lessThanBest.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-2">
                    {o.link && (
                      <a
                        href={o.link}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="btn-primary text-xs py-1.5 px-3 flex-1 text-center"
                        style={{ borderRadius: "6px" }}
                      >
                        Open betslip →
                      </a>
                    )}
                    <button
                      onClick={() => logBet(o)}
                      disabled={loggedBook === o.book}
                      className="btn-secondary text-xs py-1.5 px-3 flex-1"
                      style={{ borderRadius: "6px", opacity: loggedBook === o.book ? 0.6 : 1 }}
                    >
                      {loggedBook === o.book ? "✓ Tracked" : "I placed this"}
                    </button>
                  </div>
                </div>
              ))}

              <p className="text-xs text-gray-400">{data.note}</p>
              <p className="text-xs text-gray-600 leading-relaxed">⚠ {data.disclaimer}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
