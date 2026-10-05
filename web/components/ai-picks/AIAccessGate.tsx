import { useState } from "react"
import Link from "next/link"
import { AI_PRICE } from "@/lib/utils"
import { runCheckout, subscriptionPlan } from "@/lib/checkout"

const AI_FEATURES = [
  "Unlimited betslip generation",
  "All major sports (NFL, NBA, MLB, NHL, Soccer, UFC...)",
  "Single bets, parlays, and same-game parlays",
  "Low / Medium / High risk configurations",
  "Per-pick reasoning and confidence scores",
  "AI market analysis and edge explanation",
]

interface Props {
  /** Called once the user has completed a purchase and may use AI Picks. */
  onAccessGranted: () => void
}

/** What a user without access sees: the pitch, the price, and a way to buy. */
export default function AIAccessGate({ onAccessGranted }: Props) {
  const [error, setError] = useState("")

  const activate = async () => {
    setError("")
    const outcome = await runCheckout(subscriptionPlan("ai", "Failed to activate"))
    switch (outcome.status) {
      case "purchased":
      case "demo-activated":
        onAccessGranted()
        break
      case "failed":
        setError(outcome.message)
        break
      // "cancelled": the user backed out, nothing to report.
      // "redirecting": the browser is already leaving for the payment page.
    }
  }

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
        {AI_FEATURES.map((item) => (
          <div key={item} className="flex items-center gap-2 text-sm text-gray-300">
            <span className="text-cyan-400">✓</span> {item}
          </div>
        ))}
      </div>
      <div className="text-3xl font-black mb-1" style={{ color: "#06b6d4" }}>${AI_PRICE}<span className="text-base font-normal text-gray-400">/month</span></div>
      <p className="text-gray-500 text-sm mb-2">Cancel anytime. Instant access.</p>
      <p className="text-gray-400 text-sm mb-6">
        Already included in{" "}
        <Link href="/premium" className="text-purple-400 hover:underline font-semibold">
          Premium Tipster
        </Link>{" "}
        — get AI Picks plus everything else.
      </p>
      <button
        onClick={activate}
        className="text-lg py-3 px-10 rounded-xl font-bold transition-all"
        style={{ background: "rgba(6,182,212,0.15)", color: "#06b6d4", border: "2px solid rgba(6,182,212,0.4)" }}
      >
        {`Activate AI Picks — $${AI_PRICE}/mo`}
      </button>
      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
    </div>
  )
}
