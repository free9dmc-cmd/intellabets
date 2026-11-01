"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { formatCurrency } from "@/lib/utils"
import { isNativePlatform, purchaseNative, IAP_PRODUCTS } from "@/lib/native-iap"
import {
  AI_SPORTS,
  PROP_SPORTS,
  isPropSport,
  isTrackable,
  legCount,
  untrackablePropMessage,
  type BetType,
  type RiskLevel,
  type SlipKind,
} from "@/lib/ai-picks"
import { SPORTSBOOK_CHOICES, US_STATE_CODES } from "@/lib/sportsbooks"
import type { BetslipLeg, LegPrice } from "@/lib/engine"
import BookPicker from "../picks/BookPicker"

interface SlipLeg extends BetslipLeg {
  reasoning: string | null
}

interface AISlip {
  title: string
  description: string
  analysis: string
  writtenBy: "ai" | "engine"
  /** Absent from a response that predates player props (game lines). */
  kind?: SlipKind
  sport: string
  betType: BetType
  riskLevel: RiskLevel
  book: { key: string; name: string } | null
  state: string | null
  stake: number
  legs: SlipLeg[]
  combinedDecimal: number | null
  combinedAmerican: string | null
  payout: number | null
  winProbability: number
  parlayLink: { url: string } | null
  note: string
  sameGameWarning: string | null
  /** For player props: how old their prices can be, and what the win chance is not. */
  propsNote?: string | null
  pricesAsOf: string | null
  disclaimer: string
}

const KINDS: { value: SlipKind; label: string }[] = [
  { value: "lines", label: "Game lines" },
  { value: "props", label: "Player props" },
]

const BET_TYPES: { value: BetType; label: string }[] = [
  { value: "single", label: "Single Bet" },
  { value: "parlay", label: "Parlay" },
  { value: "same-game-parlay", label: "Same-Game Parlay" },
]

const RISK_LEVELS: { value: RiskLevel; label: string; desc: string }[] = [
  {
    value: "low",
    label: "🎯 Favorites",
    desc: "Bets the engine rates at least 60% likely to win. They hit more often and pay less; that is not the same as low risk.",
  },
  { value: "medium", label: "⚡ Balanced", desc: "Bets the engine rates 40-62% likely to win." },
  { value: "high", label: "🚀 Underdogs", desc: "Bets the engine rates 15-40% likely to win: bigger payouts, more misses." },
]

const PREFS_KEY = "intellabets_ai_picks_prefs"

/** Say what the link really does: only a betslip link adds the pick for the user. */
function legLinkLabel(p: LegPrice): string {
  if (p.linkKind === "event") return `Open game at ${p.bookName} →`
  if (p.linkKind === "home") return `Go to ${p.bookName} →`
  return `Add to ${p.bookName} betslip →`
}

function kickoff(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })
}

const pct = (p: number) => `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`

/** "+1.2% above fair" / "2.4% below fair": the expected return at the shown price. */
function vsFair(edge: number): string {
  if (Math.abs(edge) < 0.05) return "at fair"
  return edge > 0 ? `${edge.toFixed(1)}% above fair` : `${Math.abs(edge).toFixed(1)}% below fair`
}

/** "just now", "25 min ago", "2 h 10 min ago": prop prices can be hours old. */
function timeAgo(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  if (m < 1) return "just now"
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  return m % 60 === 0 ? `${h} h ago` : `${h} h ${m % 60} min ago`
}

export default function AIPicksPage() {
  const [kind, setKind] = useState<SlipKind>("lines")
  const [sport, setSport] = useState<string>("NFL")
  const [betType, setBetType] = useState<BetType>("parlay")
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("medium")
  const [book, setBook] = useState("")
  const [state, setState] = useState("")
  const [stake, setStake] = useState("10")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AISlip | null>(null)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)

  useEffect(() => {
    // Remembered per browser; storage can be unavailable (private mode).
    let savedBook = ""
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}")
      if (typeof saved.book === "string") savedBook = saved.book
      if (typeof saved.state === "string") setState(saved.state)
      if (typeof saved.stake === "string") setStake(saved.stake)
      if (saved.kind === "lines" || saved.kind === "props") setKind(saved.kind)
    } catch {}
    if (savedBook) setBook(savedBook)
    fetch("/api/premium")
      .then((r) => r.json())
      .then((d) => {
        setHasAccess(d.hasAI ?? false)
        // A new browser starts from the book saved on the account.
        if (!savedBook && typeof d.preferredBook === "string") setBook(d.preferredBook)
      })
      .catch(() => setHasAccess(false))
  }, [])

  // Props cover fewer sports; keep the chosen sport when it has them.
  const chooseKind = (next: SlipKind) => {
    setKind(next)
    if (next === "props" && !isPropSport(sport)) setSport("NBA")
  }

  const generate = async () => {
    setLoading(true)
    setError("")
    setNotice("")
    setResult(null)
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ book, state, stake, kind }))
    } catch {}

    try {
      const res = await fetch("/api/ai-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, sport, betType, riskLevel, book: book || null, state: state || null, stake }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.code === "NO_AI_SUB") setHasAccess(false)
        else setError(data.error ?? "Could not build a betslip. Please try again.")
      } else if (!data.betslip) {
        setNotice(data.notice ?? "No picks are available right now.")
      } else {
        setResult(data.betslip)
      }
    } catch {
      setError("Could not reach IntellaBets. Check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  const chanceColor = (p: number) =>
    p >= 0.5 ? "text-emerald-400" : p >= 0.25 ? "text-yellow-400" : "text-orange-400"

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
          Claude builds betslips from live odds at licensed US sportsbooks, choosing among the
          best-priced bets for your risk level and explaining each pick. Each leg links to your
          sportsbook, straight onto the betslip where the book supports it.
        </p>
        <div className="card p-6 mb-8 text-left space-y-3">
          {[
            "Real upcoming games and live prices, never made-up matchups",
            "NFL, college football, NBA, NHL, MLB and more as the engine covers them",
            "Single bets, parlays and same-game parlays",
            "Player-prop betslips for NBA, NFL and NHL",
            "Favorites / Balanced / Underdogs risk levels",
            "Links that take each leg to your sportsbook",
            "The engine's win chance and how each price compares with fair",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm text-gray-300">
              <span className="text-cyan-400">✓</span> {item}
            </div>
          ))}
        </div>
        <div className="text-3xl font-black mb-1" style={{ color: "#06b6d4" }}>$9.99<span className="text-base font-normal text-gray-400">/month</span></div>
        <p className="text-gray-500 text-sm mb-2">Cancel anytime. Instant access.</p>
        <p className="text-gray-400 text-sm mb-6">
          Already included in{" "}
          <Link href="/premium" className="text-purple-400 hover:underline font-semibold">
            Premium Tipster
          </Link>{" "}
          — get AI Picks plus everything else.
        </p>
        <button
          onClick={async () => {
            setError("")
            if (await isNativePlatform()) {
              const result = await purchaseNative(IAP_PRODUCTS.ai)
              if (result.cancelled) return
              if (result.error) { setError(result.error); return }
              setHasAccess(true)
              return
            }
            const checkoutRes = await fetch("/api/checkout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "ai" }),
            })
            const checkoutData = await checkoutRes.json().catch(() => ({}))
            if (checkoutData.url) { window.location.href = checkoutData.url; return }
            // Only fall back to demo activation when the server says so.
            if (!checkoutData.demo) {
              setError(checkoutData.error ?? "Could not start checkout. Please try again.")
              return
            }
            // Demo fallback (local dev with DEMO_BILLING=true)
            const res = await fetch("/api/premium", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "ai" }),
            })
            if (res.ok) setHasAccess(true)
            else {
              const d = await res.json().catch(() => ({}))
              setError(d.error ?? "Failed to activate")
            }
          }}
          className="text-lg py-3 px-10 rounded-xl font-bold transition-all"
          style={{ background: "rgba(6,182,212,0.15)", color: "#06b6d4", border: "2px solid rgba(6,182,212,0.4)" }}
        >
          Activate AI Picks — $9.99/mo
        </button>
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      </div>
    )
  }

  const legs = legCount(kind, riskLevel, betType)
  const chosenBook = SPORTSBOOK_CHOICES.find((b) => b.key === book)
  // Player props cover NBA, NFL and NHL only (chooseKind moves the sport onto one).
  const sports: readonly string[] = kind === "props" ? PROP_SPORTS : AI_SPORTS

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-white mb-1">
          🧠 AI <span className="gradient-text">Predictions</span>
        </h1>
        <p className="text-gray-400 text-sm">
          Built from live odds on real upcoming games. Each pick links to your sportsbook (a filled betslip where
          the book supports it).
        </p>
      </div>

      {/* Generator card */}
      <div className="card p-6">
        <div className="flex gap-2 mb-4" role="group" aria-label="What to bet on">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => chooseKind(k.value)}
              aria-pressed={kind === k.value}
              className={`flex-1 text-sm px-3 py-2 rounded-lg border font-medium transition-all ${
                kind === k.value
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                  : "border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">Sport</label>
            <select value={sport} onChange={(e) => setSport(e.target.value)} className="input-dark text-sm py-2.5">
              {sports.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">Bet Type</label>
            <select value={betType} onChange={(e) => setBetType(e.target.value as BetType)} className="input-dark text-sm py-2.5">
              {BET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">Risk Level</label>
            <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as RiskLevel)} className="input-dark text-sm py-2.5">
              {RISK_LEVELS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">Your sportsbook</label>
            <select value={book} onChange={(e) => setBook(e.target.value)} className="input-dark text-sm py-2.5">
              <option value="">{betType === "single" ? "Best price anywhere" : "Choose your sportsbook"}</option>
              {SPORTSBOOK_CHOICES.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">Your state</label>
            <select value={state} onChange={(e) => setState(e.target.value)} className="input-dark text-sm py-2.5">
              <option value="">Not set</option>
              {US_STATE_CODES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">Stake ($)</label>
            <input
              type="number"
              min="1"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              className="input-dark text-sm py-2.5"
            />
          </div>
        </div>

        <div className="mb-4 text-sm text-gray-400 p-3 rounded-lg bg-white/3 border border-gray-800 space-y-1">
          <p>
            {RISK_LEVELS.find((r) => r.value === riskLevel)?.desc} {legs} leg{legs === 1 ? "" : "s"}.
            {kind === "props" && " Most player props are priced near 50/50, so Favorites and Underdogs have few."}
          </p>
          {!book && betType !== "single" && (
            <p className="text-yellow-400/80 text-xs">Choose your sportsbook: a parlay has to be placed at one book.</p>
          )}
          {chosenBook?.usesState && !state && (
            <p className="text-yellow-400/80 text-xs">
              {chosenBook.name} uses a separate site per state. Set your state so its links open your betslip.
            </p>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={generate}
          disabled={loading || (!book && betType !== "single")}
          className="btn-primary w-full py-3 font-semibold"
          style={{ borderRadius: "10px", opacity: loading || (!book && betType !== "single") ? 0.6 : 1 }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Choosing from live odds...
            </span>
          ) : "Generate AI Betslip ✨"}
        </button>
      </div>

      {notice && (
        <div className="card p-5 text-sm text-gray-300 border-yellow-500/20">
          <div className="font-semibold text-white mb-1">No betslip right now</div>
          {notice}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card p-6 space-y-5 animate-slide-up border-purple-500/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-black text-xl text-white">{result.title}</h2>
              <p className="text-gray-400 text-sm mt-1">{result.description}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-2xl font-black ${chanceColor(result.winProbability)}`}>
                {pct(result.winProbability)}
              </div>
              <div className="text-xs text-gray-500">engine win chance</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-white/3 border border-gray-800 text-center">
              <div className="text-white font-bold">{result.legs.length}</div>
              <div className="text-gray-500 text-xs mt-0.5">Leg{result.legs.length === 1 ? "" : "s"}</div>
            </div>
            <div className="p-3 rounded-lg bg-white/3 border border-gray-800 text-center">
              <div className="text-white font-bold">{result.combinedAmerican ?? "—"}</div>
              <div className="text-gray-500 text-xs mt-0.5">
                {result.book ? `Odds at ${result.book.name}` : "Odds"}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-emerald-500/8 border border-emerald-500/20 text-center">
              <div className="text-emerald-400 font-bold">
                {result.payout !== null ? formatCurrency(result.payout) : "—"}
              </div>
              <div className="text-gray-500 text-xs mt-0.5">Returns on ${result.stake}</div>
            </div>
          </div>

          {result.parlayLink && result.book && (
            <a
              href={result.parlayLink.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="btn-primary w-full py-3 font-semibold block text-center"
              style={{ borderRadius: "10px" }}
            >
              Open the whole {result.legs.length}-leg parlay at {result.book.name} →
            </a>
          )}
          <p className="text-xs text-gray-400">{result.note}</p>
          {result.legs.length > 1 && (
            <p className="text-xs text-gray-500">
              Parlay tracking isn&apos;t available yet; track single bets from Engine Picks.
            </p>
          )}
          {result.sameGameWarning && <p className="text-xs text-yellow-400/80">{result.sameGameWarning}</p>}
          {result.propsNote && <p className="text-xs text-yellow-400/80">{result.propsNote}</p>}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Picks</h3>
            {result.legs.map((leg) => {
              const price = leg.atBook ?? leg.best
              return (
                <div key={leg.predictionId} className="p-4 rounded-lg border border-gray-800" style={{ background: "rgba(255,255,255,0.02)" }}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="font-medium text-white text-sm">{leg.matchup}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {leg.selection} ·{" "}
                        {leg.marketType === "prop" ? "Player prop" : <span className="capitalize">{leg.marketType}</span>} ·{" "}
                        {kickoff(leg.commenceTime)}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-white">{price?.oddsAmerican ?? "—"}</div>
                      <div className="text-xs text-gray-500">
                        {leg.atBook ? leg.atBook.bookName : leg.best ? `best: ${leg.best.bookName}` : "no price"}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mb-2">
                    <span>Engine win chance <span className="text-gray-300">{pct(leg.fairProbability)}</span></span>
                    {price && (
                      <span>
                        Price{" "}
                        <span className={price.edgePercent > 0 ? "text-emerald-400" : "text-gray-300"}>
                          {vsFair(price.edgePercent)}
                        </span>
                      </span>
                    )}
                    {leg.pricesAsOf && (
                      <span>
                        Prices from <span className="text-gray-300">{timeAgo(leg.pricesAsOf)}</span>
                      </span>
                    )}
                  </div>

                  {leg.started && (
                    <p className="text-xs text-yellow-400/80 mb-2">This game has started; the pregame price no longer applies.</p>
                  )}
                  {result.book && !leg.atBook && (
                    <p className="text-xs text-yellow-400/80 mb-2">{result.book.name} has no current price for this leg.</p>
                  )}

                  {leg.reasoning && (
                    <p className="text-xs text-gray-400 leading-relaxed border-t border-gray-800/50 pt-2 mt-2">{leg.reasoning}</p>
                  )}

                  {price?.link && (
                    <a
                      href={price.link}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="btn-primary text-xs py-2 px-3 mt-3 block text-center"
                      style={{ borderRadius: "6px" }}
                    >
                      {legLinkLabel(price)}
                    </a>
                  )}

                  {result.legs.length === 1 && !isTrackable(leg, 1) && (
                    <p className="text-xs text-gray-500 mt-2">{untrackablePropMessage(leg.sport)}</p>
                  )}

                  <BookPicker
                    predictionId={leg.predictionId}
                    sport={leg.sport}
                    marketType={leg.marketType}
                    preferredBook={result.book?.key ?? null}
                    state={result.state}
                    // Logging one leg of a parlay as a single would record the wrong bet,
                    // and an ungraded prop would stay pending forever.
                    trackable={isTrackable(leg, result.legs.length)}
                    initialStake={String(result.stake)}
                  />
                </div>
              )
            })}
          </div>

          <div className="p-4 rounded-lg bg-purple-500/5 border border-purple-500/20">
            <div className="text-xs text-purple-400 font-semibold uppercase tracking-wide mb-2">
              {result.writtenBy === "ai" ? "🧠 AI Analysis" : "📊 Engine Analysis"}
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">{result.analysis}</p>
          </div>

          <p className="text-xs text-gray-600 leading-relaxed">
            ⚠ {result.disclaimer}
            {result.pricesAsOf && ` Prices from ${timeAgo(result.pricesAsOf)}.`} &ldquo;Below fair&rdquo; is the
            sportsbook&apos;s margin; most bets carry one. The win chance is the engine&apos;s estimate, not a guarantee.
            Only bet where it is legal in your state. 21+. Gambling problem? Call 1-800-GAMBLER.
          </p>
        </div>
      )}
    </div>
  )
}
