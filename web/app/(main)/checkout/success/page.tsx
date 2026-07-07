"use client"

import { useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import Link from "next/link"

const TYPE_CONFIG = {
  premium: {
    icon: "🏆",
    title: "You're a Premium Tipster!",
    message: "Your premium membership is now active. Start creating betslips and earning from subscribers.",
    cta: "Go to Dashboard",
    href: "/dashboard",
    color: "text-purple-400",
  },
  ai: {
    icon: "🧠",
    title: "AI Picks Unlocked!",
    message: "Your AI subscription is active. Generate unlimited Claude-powered betslips across every sport.",
    cta: "Generate AI Picks",
    href: "/ai-picks",
    color: "text-cyan-400",
  },
  tipster: {
    icon: "✓",
    title: "Subscription Active!",
    message: "You're now subscribed. New betslips from this tipster will appear in your feed.",
    cta: "View Feed",
    href: "/feed",
    color: "text-emerald-400",
  },
}

function SuccessContent() {
  const params = useSearchParams()
  const router = useRouter()
  const { update } = useSession()

  const type = (params.get("type") ?? "premium") as keyof typeof TYPE_CONFIG
  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.premium

  useEffect(() => {
    // Refresh session so isPremium flag is reflected client-side
    update()
  }, [update])

  return (
    <div className="max-w-lg mx-auto text-center py-20 animate-fade-in">
      <div className="text-7xl mb-6">{config.icon}</div>
      <h1 className={`text-3xl font-black mb-4 ${config.color}`}>{config.title}</h1>
      <p className="text-gray-400 mb-8 leading-relaxed">{config.message}</p>

      <div className="card p-6 mb-8 text-left space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <span className="text-emerald-400">✓</span> Payment confirmed
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <span className="text-emerald-400">✓</span> Account upgraded instantly
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <span className="text-emerald-400">✓</span> Subscription receipt sent to your email
        </div>
      </div>

      <Link href={config.href} className="btn-primary py-3 px-10 font-bold inline-block" style={{ borderRadius: "10px" }}>
        {config.cta}
      </Link>

      <p className="text-gray-600 text-xs mt-6">
        Questions? Contact support@intellabets.com
      </p>
    </div>
  )
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-gray-500">Loading...</div>}>
      <SuccessContent />
    </Suspense>
  )
}
