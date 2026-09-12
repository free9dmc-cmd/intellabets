"use client"

import { useState } from "react"

interface Guide {
  bookName: string
  bookUrl: string
  matchup: string
  selection: string
  marketLabel: string
  oddsAmerican: string
  steps: { n: number; instruction: string; detail?: string }[]
  stake: { percentOfBankroll: number; exampleBankroll: number; exampleStake: number }
  warnings: string[]
}

export default function HowToBet({ predictionId }: { predictionId: string }) {
  const [open, setOpen] = useState(false)
  const [guide, setGuide] = useState<Guide | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [bankroll, setBankroll] = useState("1000")

  const load = async (bank?: string) => {
    setLoading(true)
    setError("")
    const qs = bank ? `?bankroll=${encodeURIComponent(bank)}` : ""
    const res = await fetch(`/api/engine/how-to-bet/${predictionId}${qs}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) setGuide(data)
    else setError(data.error ?? "Could not load guidance.")
    setLoading(false)
  }

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && !guide) await load(bankroll)
  }

  return (
    <div className="mt-4 border-t border-gray-800 pt-4">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between text-left group"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-purple-400 group-hover:text-purple-300 transition-colors">
          📍 How to place this bet
        </span>
        <span className="text-gray-500 text-xs">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {loading && <p className="text-gray-500 text-sm">Loading guidance…</p>}
          {error && (
            <p className="text-red-400 text-sm p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              {error}
            </p>
          )}

          {guide && (
            <>
              <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                  Best price found at
                </div>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-white font-bold">{guide.bookName}</span>
                  <span className="text-emerald-400 font-black">{guide.oddsAmerican}</span>
                </div>
                <div className="text-gray-400 text-sm mt-1">
                  {guide.selection} &middot; {guide.marketLabel}
                </div>
              </div>

              <ol className="space-y-3">
                {guide.steps.map((s) => (
                  <li key={s.n} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-bold flex items-center justify-center">
                      {s.n}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm text-white font-medium">{s.instruction}</div>
                      {s.detail && (
                        <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">{s.detail}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>

              {/* Recalculate the dollar stake for the user's own bankroll. */}
              <div className="p-3 rounded-lg bg-white/3 border border-gray-800">
                <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
                  Your bankroll
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    value={bankroll}
                    onChange={(e) => setBankroll(e.target.value)}
                    className="input-dark text-sm py-2 flex-1"
                    placeholder="1000"
                  />
                  <button
                    onClick={() => load(bankroll)}
                    disabled={loading}
                    className="btn-secondary text-sm py-2 px-4 whitespace-nowrap"
                    style={{ borderRadius: "8px" }}
                  >
                    Recalculate
                  </button>
                </div>
                <p className="text-sm text-gray-300 mt-2">
                  Suggested stake:{" "}
                  <strong className="text-white">
                    ${guide.stake.exampleStake.toFixed(2)}
                  </strong>{" "}
                  <span className="text-gray-500">
                    ({guide.stake.percentOfBankroll}% of bankroll)
                  </span>
                </p>
              </div>

              {guide.bookUrl && (
                <a
                  href={guide.bookUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="btn-primary w-full py-2.5 text-sm font-semibold text-center block"
                  style={{ borderRadius: "8px" }}
                >
                  Open {guide.bookName} →
                </a>
              )}

              <ul className="space-y-1.5">
                {guide.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-gray-500 leading-relaxed flex gap-2">
                    <span className="text-yellow-500/70 flex-shrink-0">⚠</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
