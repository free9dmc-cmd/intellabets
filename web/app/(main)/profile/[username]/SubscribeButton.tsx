"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { runCheckout, tipsterPlan } from "@/lib/checkout"

interface Props {
  tipsterId: string
  tipsterName: string
  tipsterUsername: string
  price: number
  initialSubscribed: boolean
  isLoggedIn: boolean
  variant?: "default" | "large"
}

export default function SubscribeButton({
  tipsterId, price, initialSubscribed, isLoggedIn, variant = "default",
}: Props) {
  const router = useRouter()
  const [subscribed, setSubscribed] = useState(initialSubscribed)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubscribe = async () => {
    if (!isLoggedIn) {
      router.push("/login")
      return
    }

    setLoading(true)
    setError("")

    if (subscribed) {
      // Unsubscribe
      const res = await fetch(`/api/subscriptions?tipsterId=${tipsterId}`, { method: "DELETE" })
      if (res.ok) {
        setSubscribed(false)
        router.refresh()
      } else {
        const d = await res.json()
        setError(d.error ?? "Failed")
      }
    } else {
      const outcome = await runCheckout(tipsterPlan(tipsterId, price))
      switch (outcome.status) {
        case "redirecting":
          // The browser is leaving for the payment page; keep the button disabled.
          return
        case "purchased":
        case "demo-activated":
          // After a native purchase the subscription row is created
          // authoritatively by the RevenueCat webhook (INITIAL_PURCHASE), which
          // also records the tipster payout. Don't write it from the client —
          // that path is unauthenticated intent. This only updates the UI.
          // ("demo-activated" is local dev with DEMO_BILLING=true.)
          setSubscribed(true)
          router.refresh()
          break
        case "failed":
          setError(outcome.message)
          break
        // "cancelled": the user backed out, nothing to report.
      }
    }

    setLoading(false)
  }

  if (variant === "large") {
    return (
      <div className="text-center">
        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="btn-primary py-3 px-8 font-bold"
          style={{ borderRadius: "10px", minWidth: "180px", opacity: loading ? 0.7 : 1 }}
        >
          {loading ? "..." : subscribed ? "✓ Subscribed" : `Subscribe — $${price}/mo`}
        </button>
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={handleSubscribe}
        disabled={loading}
        className={subscribed ? "btn-secondary text-sm py-2 px-4" : "btn-primary text-sm py-2 px-4"}
        style={{ borderRadius: "8px", opacity: loading ? 0.7 : 1 }}
      >
        {loading ? "..." : subscribed ? "✓ Following" : `$${price}/mo`}
      </button>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}
