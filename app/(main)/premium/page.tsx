"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { PREMIUM_PRICE, AI_PRICE } from "@/lib/utils"

const TIPSTER_PERKS = [
  { icon: "📋", title: "Create Unlimited Betslips", desc: "Post single bets, parlays, and multi-leg picks across any sport" },
  { icon: "🏆", title: "Appear on Leaderboard", desc: "Build your public profile ranked by win rate and ROI" },
  { icon: "💸", title: "Earn Monthly Income", desc: "Set your own subscription price ($4.99–$49.99/mo). Keep 80% of all revenue." },
  { icon: "✓", title: "Verified Badge", desc: "Stand out with a verified premium tipster badge" },
  { icon: "📊", title: "Analytics Dashboard", desc: "Full stats: win rate, ROI, subscriber growth, payout history" },
  { icon: "🔔", title: "Subscriber Notifications", desc: "Notify subscribers instantly when you post new picks" },
]

const REVENUE_EXAMPLES = [
  { subs: 50, price: 9.99, monthlyGross: 499.5, monthlyNet: 399.6 },
  { subs: 150, price: 14.99, monthlyGross: 2248.5, monthlyNet: 1798.8 },
  { subs: 300, price: 19.99, monthlyGross: 5997, monthlyNet: 4797.6 },
  { subs: 600, price: 24.99, monthlyGross: 14994, monthlyNet: 11995.2 },
]

export default function PremiumPage() {
  const { data: session, update: updateSession } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState<"premium" | "ai" | null>(null)
  const [error, setError] = useState("")
  const [status, setStatus] = useState<{ isPremium: boolean; hasAI: boolean } | null>(null)

  useEffect(() => {
    fetch("/api/premium").then((r) => r.json()).then(setStatus)
  }, [])

  const activate = async (type: "premium" | "ai") => {
    if (!session) { router.push("/login"); return }
    setLoading(type)
    setError("")

    const res = await fetch("/api/premium", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    })

    const data = await res.json()
    if (res.ok) {
      setStatus((prev) => prev ? { ...prev, isPremium: type === "premium" || prev.isPremium, hasAI: type === "ai" || prev.hasAI } : null)
      if (type === "premium") await updateSession({ isPremium: true })
      router.push(type === "premium" ? "/dashboard" : "/ai-picks")
    } else {
      setError(data.error ?? "Activation failed")
    }
    setLoading(null)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10 animate-fade-in">
      <div className="text-center">
        <h1 className="text-3xl font-black text-white mb-3">
          Choose Your <span className="gradient-text">Plan</span>
        </h1>
        <p className="text-gray-400">Upgrade to unlock premium features. Cancel anytime.</p>
      </div>

      {/* Plan cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Premium Tipster */}
        <div className={`card p-8 relative ${status?.isPremium ? "border-emerald-500/30" : "border-purple-500/30"}`}
          style={{ boxShadow: "0 0 40px rgba(124,58,237,0.1)" }}>
          {status?.isPremium && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-4 py-1 rounded-full">
              ✓ ACTIVE
            </div>
          )}
          <div className="mb-6">
            <div className="text-3xl mb-3">🏆</div>
            <h2 className="text-xl font-black text-white mb-1">Premium Tipster</h2>
            <div className="text-4xl font-black gradient-text mt-2">${PREMIUM_PRICE}<span className="text-base font-normal text-gray-400">/mo</span></div>
          </div>

          <ul className="space-y-3 mb-8">
            {[
              "Create & publish unlimited betslips",
              "Appear on leaderboard",
              "Earn from subscriptions (80% revenue)",
              "Set your sub price ($4.99–$49.99)",
              "Performance analytics",
              "Verified premium badge",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-gray-300">
                <span className="text-purple-400">✓</span> {item}
              </li>
            ))}
          </ul>

          {status?.isPremium ? (
            <div className="text-center p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold">
              Premium membership active ✓
            </div>
          ) : (
            <button
              onClick={() => activate("premium")}
              disabled={loading !== null}
              className="btn-primary w-full py-3 font-semibold"
              style={{ borderRadius: "10px", opacity: loading ? 0.8 : 1 }}
            >
              {loading === "premium" ? "Activating..." : `Activate Premium — $${PREMIUM_PRICE}/mo`}
            </button>
          )}
          <p className="text-gray-600 text-xs text-center mt-2">Demo mode: instant activation</p>
        </div>

        {/* AI Picks */}
        <div className={`card p-8 relative ${status?.hasAI ? "border-emerald-500/30" : "border-cyan-500/20"}`}
          style={{ boxShadow: "0 0 40px rgba(6,182,212,0.06)" }}>
          {status?.hasAI && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-4 py-1 rounded-full">
              ✓ ACTIVE
            </div>
          )}
          <div className="mb-6">
            <div className="text-3xl mb-3">🧠</div>
            <h2 className="text-xl font-black text-white mb-1">AI Picks</h2>
            <div className="text-4xl font-black mt-2" style={{ color: "#06b6d4" }}>${AI_PRICE}<span className="text-base font-normal text-gray-400">/mo</span></div>
          </div>

          <ul className="space-y-3 mb-8">
            {[
              "Unlimited AI betslip generation",
              "All major sports (NFL, NBA, MLB, NHL...)",
              "Single bets, parlays & SGPs",
              "Low / Medium / High risk levels",
              "Per-pick reasoning from Claude AI",
              "Confidence scores & market analysis",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-gray-300">
                <span style={{ color: "#06b6d4" }}>✓</span> {item}
              </li>
            ))}
          </ul>

          {status?.hasAI ? (
            <div className="text-center p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold">
              AI subscription active ✓
            </div>
          ) : (
            <button
              onClick={() => activate("ai")}
              disabled={loading !== null}
              className="w-full py-3 font-semibold rounded-xl transition-all"
              style={{
                background: "rgba(6,182,212,0.1)",
                color: "#06b6d4",
                border: "1px solid rgba(6,182,212,0.3)",
                opacity: loading ? 0.8 : 1,
              }}
            >
              {loading === "ai" ? "Activating..." : `Get AI Picks — $${AI_PRICE}/mo`}
            </button>
          )}
          <p className="text-gray-600 text-xs text-center mt-2">Demo mode: instant activation</p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      {/* Revenue potential table */}
      <div className="card p-6">
        <h2 className="font-black text-white text-xl mb-2 text-center">
          💰 Your Earning <span className="gold-text">Potential</span>
        </h2>
        <p className="text-gray-400 text-sm text-center mb-6">
          As a Premium Tipster, you keep 80% of every subscription. Here&apos;s what that looks like:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-2 px-3 text-xs text-gray-500 uppercase">Subscribers</th>
                <th className="text-right py-2 px-3 text-xs text-gray-500 uppercase">Your Price</th>
                <th className="text-right py-2 px-3 text-xs text-gray-500 uppercase">Monthly Gross</th>
                <th className="text-right py-2 px-3 text-xs text-gray-500 uppercase">Your Earnings (80%)</th>
              </tr>
            </thead>
            <tbody>
              {REVENUE_EXAMPLES.map((row) => (
                <tr key={row.subs} className="border-b border-gray-800/50">
                  <td className="py-3 px-3 text-white font-medium">{row.subs}</td>
                  <td className="py-3 px-3 text-right text-gray-300">${row.price}/mo</td>
                  <td className="py-3 px-3 text-right text-gray-300">${row.monthlyGross.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right font-black text-emerald-400">
                    ${row.monthlyNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-gray-600 text-xs text-center mt-4">
          IntellaBets takes a 20% service fee on subscriber revenue. No hidden charges.
        </p>
      </div>

      {/* Tipster perks */}
      <div>
        <h2 className="text-xl font-black text-white text-center mb-6">What You Get as a Premium Tipster</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TIPSTER_PERKS.map((p) => (
            <div key={p.title} className="card p-4">
              <div className="text-2xl mb-2">{p.icon}</div>
              <div className="font-bold text-white text-sm mb-1">{p.title}</div>
              <div className="text-gray-400 text-xs leading-relaxed">{p.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
