"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { SPORTS, SPORT_EMOJIS, formatOdds, americanToDecimal } from "@/lib/utils"

interface BetForm {
  game: string
  homeTeam: string
  awayTeam: string
  pick: string
  odds: string
  betType: string
  line: string
  sport: string
  gameDate: string
}

const defaultBet: BetForm = {
  game: "", homeTeam: "", awayTeam: "", pick: "", odds: "-110",
  betType: "spread", line: "", sport: "NFL", gameDate: "",
}

const BET_TYPES = ["moneyline", "spread", "total", "parlay", "prop"]

export default function NewBetslipPage() {
  const { data: session } = useSession()
  const router = useRouter()

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [sport, setSport] = useState("NFL")
  const [league, setLeague] = useState("")
  const [stake, setStake] = useState("100")
  const [isPublic, setIsPublic] = useState(false)
  const [bets, setBets] = useState<BetForm[]>([{ ...defaultBet }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  if (!session?.user?.isPremium) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-white mb-2">Premium Required</h1>
        <p className="text-gray-400 mb-6">Upgrade to Premium to create and sell betslips.</p>
        <Link href="/premium" className="btn-primary">Upgrade Now</Link>
      </div>
    )
  }

  const addBet = () => setBets((prev) => [...prev, { ...defaultBet, sport }])
  const removeBet = (i: number) => setBets((prev) => prev.filter((_, idx) => idx !== i))
  const updateBet = (i: number, field: keyof BetForm, val: string) => {
    setBets((prev) => prev.map((b, idx) => idx === i ? { ...b, [field]: val } : b))
  }

  const calcTotalOdds = () => {
    try {
      const decimal = bets.reduce((acc, bet) => {
        const odds = parseFloat(bet.odds)
        if (isNaN(odds)) return acc
        return acc * americanToDecimal(odds)
      }, 1)
      if (decimal <= 1) return 0
      const american = decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1))
      return american
    } catch { return 0 }
  }

  const totalOdds = calcTotalOdds()
  const stakeNum = parseFloat(stake) || 100
  const potentialReturn = stakeNum * americanToDecimal(totalOdds || -110)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError("Title is required"); return }
    if (bets.some((b) => !b.game || !b.pick || !b.odds)) {
      setError("Fill in all bet details (game, pick, odds)")
      return
    }
    setSaving(true)
    setError("")

    const res = await fetch("/api/betslips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        sport,
        league,
        stake: stakeNum,
        isPublic,
        bets: bets.map((b) => ({
          ...b,
          odds: parseFloat(b.odds),
        })),
      }),
    })

    if (res.ok) {
      const { betslip } = await res.json()
      router.push(`/betslips/${betslip.id}`)
    } else {
      const d = await res.json()
      setError(d.error ?? "Failed to save")
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/betslips" className="text-gray-400 hover:text-white">← Back</Link>
        <h1 className="text-xl font-black text-white">Create Betslip</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Betslip info */}
        <div className="card p-6 space-y-4">
          <h2 className="font-bold text-white text-sm uppercase tracking-wide">Betslip Details</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-dark"
              placeholder="e.g. NFL Thursday Value Pack"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-dark"
              style={{ minHeight: "80px", resize: "vertical" }}
              placeholder="Brief analysis or strategy note for subscribers..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Sport</label>
              <select value={sport} onChange={(e) => setSport(e.target.value)} className="input-dark text-sm">
                {SPORTS.map((s) => <option key={s}>{SPORT_EMOJIS[s]} {s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">League (optional)</label>
              <input
                type="text"
                value={league}
                onChange={(e) => setLeague(e.target.value)}
                className="input-dark"
                placeholder="e.g. NFL Week 14"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Stake ($)</label>
              <input
                type="number"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                className="input-dark"
                min="1"
                max="10000"
                step="0.01"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="w-4 h-4 rounded accent-purple-500"
                />
                <span className="text-sm text-gray-300">Make public (free preview)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Bets */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white text-sm uppercase tracking-wide">Bets ({bets.length})</h2>
            <button type="button" onClick={addBet} className="btn-secondary text-xs py-1.5 px-3">
              + Add Bet
            </button>
          </div>

          {bets.map((bet, i) => (
            <div key={i} className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-300">Bet #{i + 1}</span>
                {bets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeBet(i)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Game *</label>
                  <input
                    value={bet.game}
                    onChange={(e) => updateBet(i, "game", e.target.value)}
                    className="input-dark text-sm"
                    placeholder="e.g. Kansas City Chiefs @ Las Vegas Raiders"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Pick *</label>
                  <input
                    value={bet.pick}
                    onChange={(e) => updateBet(i, "pick", e.target.value)}
                    className="input-dark text-sm"
                    placeholder="e.g. Chiefs -4.5"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Odds (American) *</label>
                  <input
                    value={bet.odds}
                    onChange={(e) => updateBet(i, "odds", e.target.value)}
                    className="input-dark text-sm"
                    placeholder="-110"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Bet Type</label>
                  <select
                    value={bet.betType}
                    onChange={(e) => updateBet(i, "betType", e.target.value)}
                    className="input-dark text-sm"
                  >
                    {BET_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Line / Total</label>
                  <input
                    value={bet.line}
                    onChange={(e) => updateBet(i, "line", e.target.value)}
                    className="input-dark text-sm"
                    placeholder="e.g. -4.5 or O/U 47.5"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Game Date</label>
                  <input
                    type="date"
                    value={bet.gameDate}
                    onChange={(e) => updateBet(i, "gameDate", e.target.value)}
                    className="input-dark text-sm"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="card p-5 border-purple-500/20">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Summary</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-white font-bold">{formatOdds(totalOdds)}</div>
              <div className="text-gray-500 text-xs">Total Odds</div>
            </div>
            <div>
              <div className="text-white font-bold">${stakeNum}</div>
              <div className="text-gray-500 text-xs">Stake</div>
            </div>
            <div>
              <div className="text-emerald-400 font-bold">${potentialReturn.toFixed(2)}</div>
              <div className="text-gray-500 text-xs">Potential Return</div>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="btn-primary w-full py-3 font-semibold"
          style={{ borderRadius: "10px", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Publishing..." : "Publish Betslip"}
        </button>
      </form>
    </div>
  )
}
