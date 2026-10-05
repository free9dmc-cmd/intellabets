import { useCallback, useEffect, useState } from "react"
import type { AIBetslip } from "@/lib/ai-types"
import { NETWORK_ERROR_MESSAGE } from "@/lib/messages"

/** What the user chooses before generating picks. */
export interface AIPickOptions {
  sport: string
  betType: string
  riskLevel: string
}

/**
 * State for the AI picks screen: whether the user may use it, and generating
 * a betslip. `hasAccess` is null until the server has answered, so the page
 * can show a loading state instead of flashing the paywall.
 */
export function useAIPicks() {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AIBetslip | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/premium")
      .then((r) => r.json())
      .then((d) => setHasAccess(d.hasAI ?? false))
      .catch(() => setHasAccess(false))
  }, [])

  const generate = useCallback(async (options: AIPickOptions) => {
    setLoading(true)
    setError("")
    setResult(null)

    try {
      const res = await fetch("/api/ai-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      })

      // An error page from a proxy or the platform isn't JSON.
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        // The server is the authority on access; if it says no, show the paywall.
        if (data.code === "NO_AI_SUB") setHasAccess(false)
        else setError(data.error ?? "Generation failed")
      } else if (data.betslip) {
        setResult(data.betslip)
      } else {
        setError("Generation failed")
      }
    } catch {
      // The request never completed (offline, dropped connection...).
      setError(NETWORK_ERROR_MESSAGE)
    } finally {
      setLoading(false)
    }
  }, [])

  const grantAccess = useCallback(() => setHasAccess(true), [])

  return { hasAccess, loading, result, error, generate, grantAccess }
}
