"use client"

import { useAIPicks } from "@/hooks/useAIPicks"
import AIAccessGate from "@/components/ai-picks/AIAccessGate"
import AIBetslipResult from "@/components/ai-picks/AIBetslipResult"
import AIPickGenerator from "@/components/ai-picks/AIPickGenerator"

export default function AIPicksPage() {
  const { hasAccess, loading, result, error, generate, grantAccess } = useAIPicks()

  // null means the server hasn't answered yet; don't flash the paywall at subscribers.
  if (hasAccess === null) {
    return <div className="text-center py-20 text-gray-500">Loading...</div>
  }

  if (!hasAccess) return <AIAccessGate onAccessGranted={grantAccess} />

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-white mb-1">
          🧠 AI <span className="gradient-text">Predictions</span>
        </h1>
        <p className="text-gray-400 text-sm">Powered by Claude. Select your options and generate sharp picks.</p>
      </div>

      <AIPickGenerator loading={loading} error={error} onGenerate={generate} />

      {result && <AIBetslipResult betslip={result} />}
    </div>
  )
}
