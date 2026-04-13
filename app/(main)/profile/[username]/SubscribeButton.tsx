"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

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
      // Subscribe (demo: no Stripe, direct activation)
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipsterId }),
      })
      if (res.ok) {
        setSubscribed(true)
        router.refresh()
      } else {
        const d = await res.json()
        setError(d.error ?? "Failed")
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
        <p className="text-gray-600 text-xs mt-1">Demo: no payment required</p>
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
