"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface Props {
  betslipId: string
  bets: { id: string; pick: string }[]
}

type Result = "won" | "lost" | "push"

export default function SettleForm({ betslipId, bets }: Props) {
  const router = useRouter()
  const [result, setResult] = useState<Result>("won")
  const [betResults, setBetResults] = useState<Record<string, Result>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSettle = async () => {
    setLoading(true)
    setError("")

    const res = await fetch(`/api/betslips/${betslipId}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result, betResults }),
    })

    if (res.ok) {
      router.refresh()
    } else {
      const d = await res.json()
      setError(d.error ?? "Failed to settle")
      setLoading(false)
    }
  }

  return (
    <div className="card p-6 border-yellow-500/20" style={{ background: "rgba(245,158,11,0.03)" }}>
      <h2 className="font-bold text-white mb-4 flex items-center gap-2">
        <span>⚡</span> Settle Results
      </h2>

      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-2">Overall Betslip Result</label>
        <div className="flex gap-2">
          {(["won", "lost", "push"] as Result[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setResult(r)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold border transition-all capitalize ${
                result === r
                  ? r === "won"
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                    : r === "lost"
                    ? "bg-red-500/20 text-red-400 border-red-500/40"
                    : "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
                  : "border-gray-800 text-gray-500 hover:text-white hover:border-gray-700"
              }`}
            >
              {r === "won" ? "✅ Won" : r === "lost" ? "❌ Lost" : "↩ Push"}
            </button>
          ))}
        </div>
      </div>

      {bets.length > 1 && (
        <div className="mb-4 space-y-2">
          <label className="block text-sm text-gray-400">Individual Bet Results (optional)</label>
          {bets.map((bet) => (
            <div key={bet.id} className="flex items-center justify-between p-3 rounded-lg bg-white/3 border border-gray-800">
              <span className="text-sm text-gray-300 truncate mr-3">{bet.pick}</span>
              <div className="flex gap-1.5">
                {(["won", "lost", "push"] as Result[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setBetResults((prev) => ({ ...prev, [bet.id]: r }))}
                    className={`text-xs px-2 py-1 rounded font-medium border transition-all capitalize ${
                      betResults[bet.id] === r
                        ? r === "won"
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          : r === "lost"
                          ? "bg-red-500/20 text-red-400 border-red-500/30"
                          : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                        : "border-gray-800 text-gray-600 hover:text-gray-400"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleSettle}
        disabled={loading}
        className="btn-primary w-full py-2.5 font-semibold text-sm"
        style={{ borderRadius: "8px", opacity: loading ? 0.7 : 1 }}
      >
        {loading ? "Settling..." : `Settle as ${result.toUpperCase()}`}
      </button>
    </div>
  )
}
