"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { SPORTS, formatOdds, formatCurrency } from "@/lib/utils"

interface AIBet {
  game: string
  homeTeam: string
  awayTeam: string
  pick: string
  odds: number
  betType: string
  line: string
  sport: string
  gameDate: string
  reasoning: string
}

interface AIBetslip {
  title: string
  description: string
  sport: string
  league: string
  bets: AIBet[]
  totalOdds: number
  stake: number
  potentialReturn: number
  confidence: number
  analysis: string
}

const BET_TYPES = [
  { value: "single", label: "Single Bet" },
  { value: "parlay", label: "Parlay" },
  { value: "same-game-parlay", label: "Same-Game Parlay" },
]

const RISK_LEVELS = [
  { value: "low", label: "🛡️ Safe", desc: "Strong favorites, -200 to -110" },
  { value: "medium", label: "⚡ Balanced", desc: "Mixed picks, -150 to +150" },
  { value: "high", label: "🚀 High Value", desc: "Upsets & parlays, +100 to +350" },
]

export default function AIPicksPage() {
  const [sport, setSport] = useState("NFL")
  const [betType, setBetType] = useState("single")
  const [riskLevel, setRiskLevel] = useState("medium")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AIBetslip | null>(null)
  const [error, setError] = useState("")
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)

  useEffect(() => {
    fetch("/api/premium")
      .then((r) => r.json())
      .then((d) => setHasAccess(d.hasAI ?? false))
      .catch(() => setHasAccess(false))
  }, [])

  const generate = async () => {
    setLoading(true)
    setError("")
    setResult(null)

    const res = await fetch("/api/ai-picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sport, betType, riskLevel }),
    })

    const data = await res.json()

    if (!res.ok) {
      if (data.code === "NO_AI_SUB") setHasAccess(false)
      else setError(data.error ?? "Generation failed")
    } else {
      setResult(data.betslip)
    }

    setLoading(false)
  }

  const confidenceColor = (c: number) =>
    c >= 75 ? "text-emerald-400" : c >= 55 ? "text-yellow-400" : "text-red-400"

  if (hasAccess === null) {
    return <div className="text-center py-20 text-gray-500">Loading...</div>
  }

  if (!hasAccess) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="text-6xl mb-6">🧠</div>
        <h1 className="text-3xl font-black text-white mb-4">
          Unlock <span className="gradient-text">AI Predictions</span>
        </h1>
        <p className="text-gray-400 mb-6 leading-relaxed">
          Our Claude-powered AI analyzes injury reports, team trends, historical matchups,
          line movement, and weather to generate sharp betslips across every major sport.
        </p>
        <div className="card p-6 mb-8 text-left space-y-3">
          {[
            "Unlimited betslip generation",
            "All major sports (NFL, NBA, MLB, NHL, Soccer, UFC...)",
            "Single bets, parlays, and same-game parlays",
            "Low / Medium / High risk configurations",
            "Per-pick reasoning and confidence scores",
            "AI market analysis and edge explanation",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm text-gray-300">
              <span className="text-cyan-400">✓</span> {item}
            </div>
          ))}
        </div>
        <div className="text-3xl font-black mb-1" style={{ color: "#06b6d4" }}>$9.99<span className="text-base font-normal text-gray-400">/month</span></div>
        <p className="text-gray-500 text-sm mb-6">Cancel anytime. Instant access.</p>
        <button
          onClick={async () => {
            const res = await fetch("/api/premium", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "ai" }),
            })
            if (res.ok) setHasAccess(true)
            else {
              const d = await res.json()
              setError(d.error ?? "Failed to activate")
            }
          }}
          className="text-lg py-3 px-10 rounded-xl font-bold transition-all"
          style={{ background: "rgba(6,182,212,0.15)", color: "#06b6d4", border: "2px solid rgba(6,182,212,0.4)" }}
        >
          Activate AI Picks — $9.99/mo
        </button>
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        <p className="text-gray-600 text-xs mt-4">Demo mode: Click to activate with simulated payment</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-white mb-1">
          🧠 AI <span className="gradient-text">Predictions</span>
        </h1>
        <p className="text-gray-400 text-sm">Powered by Claude. Select your options and generate sharp picks.</p>
      </div>

      {/* Generator card */}
      <div className="card p-6">
        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          {/* Sport */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">Sport</label>
            <select value={sport} onChange={(e) => setSport(e.target.value)} className="input-dark text-sm py-2.5">
              {SPORTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>

          {/* Bet type */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">Bet Type</label>
            <select value={betType} onChange={(e) => setBetType(e.target.value)} className="input-dark text-sm py-2.5">
              {BET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Risk */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">Risk Level</label>
            <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)} className="input-dark text-sm py-2.5">
              {RISK_LEVELS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Risk description */}
        <div className="mb-4 text-sm text-gray-400 p-3 rounded-lg bg-white/3 border border-gray-800">
          {RISK_LEVELS.find((r) => r.value === riskLevel)?.desc}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={generate}
          disabled={loading}
          className="btn-primary w-full py-3 font-semibold"
          style={{ borderRadius: "10px", opacity: loading ? 0.8 : 1 }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Analyzing matchups...
            </span>
          ) : "Generate AI Betslip ✨"}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="card p-6 space-y-5 animate-slide-up border-purple-500/20">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-black text-xl text-white">{result.title}</h2>
              <p className="text-gray-400 text-sm mt-1">{result.description}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-2xl font-black ${confidenceColor(result.confidence)}`}>
                {result.confidence}%
              </div>
              <div className="text-xs text-gray-500">confidence</div>
            </div>
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-white/3 border border-gray-800 text-center">
              <div className="text-white font-bold">{formatOdds(result.totalOdds)}</div>
              <div className="text-gray-500 text-xs mt-0.5">Total Odds</div>
            </div>
            <div className="p-3 rounded-lg bg-white/3 border border-gray-800 text-center">
              <div className="text-white font-bold">${result.stake}</div>
              <div className="text-gray-500 text-xs mt-0.5">Rec. Stake</div>
            </div>
            <div className="p-3 rounded-lg bg-emerald-500/8 border border-emerald-500/20 text-center">
              <div className="text-emerald-400 font-bold">{formatCurrency(result.potentialReturn)}</div>
              <div className="text-gray-500 text-xs mt-0.5">Potential Return</div>
            </div>
          </div>

          {/* Individual bets */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Picks</h3>
            {result.bets.map((bet, i) => (
              <div key={i} className="p-4 rounded-lg border border-gray-800" style={{ background: "rgba(255,255,255,0.02)" }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="font-medium text-white text-sm">{bet.game}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{bet.pick}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`font-bold ${bet.odds > 0 ? "text-emerald-400" : "text-white"}`}>
                      {formatOdds(bet.odds)}
                    </div>
                    <div className="text-xs text-gray-500 capitalize">{bet.betType}</div>
                  </div>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed border-t border-gray-800/50 pt-2 mt-2">
                  {bet.reasoning}
                </p>
              </div>
            ))}
          </div>

          {/* AI analysis */}
          <div className="p-4 rounded-lg bg-purple-500/5 border border-purple-500/20">
            <div className="text-xs text-purple-400 font-semibold uppercase tracking-wide mb-2">
              🧠 AI Analysis
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">{result.analysis}</p>
          </div>

          <p className="text-xs text-gray-600 text-center">
            AI predictions are for entertainment. Please gamble responsibly.
          </p>
        </div>
      )}
    </div>
  )
}
