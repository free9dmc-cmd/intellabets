import Link from "next/link"
import { PREMIUM_PRICE, AI_PRICE, SPORT_EMOJIS } from "@/lib/utils"
import { prisma } from "@/lib/prisma"

// Landing page reads REAL tipsters. It previously rendered a hardcoded
// MOCK_TIPSTERS array — invented names, win records and subscriber counts —
// as though they were live leaderboard results. Never ship fabricated
// performance data: it is deceptive to users and is exactly what payment
// processors terminate merchants for.
export const dynamic = "force-dynamic"

const FEATURES = [
  {
    icon: "🧠",
    title: "AI-Powered Picks",
    desc: "Our Claude-powered AI analyzes thousands of data points to generate sharp betslips across all major sports.",
  },
  {
    icon: "🏆",
    title: "Elite Tipster Network",
    desc: "Follow verified tipsters with proven track records. Real win rates, real ROI — no fake claims.",
  },
  {
    icon: "💸",
    title: "Monetize Your Picks",
    desc: "Turn your sports knowledge into a revenue stream. Build a subscriber base and earn monthly payouts.",
  },
  {
    icon: "📊",
    title: "Transparent Analytics",
    desc: "Every bet tracked. Win rates, ROI, and performance history visible to all. Accountability built in.",
  },
]

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Create Your Account",
    desc: "Sign up free in seconds. Browse the leaderboard and preview AI picks immediately.",
  },
  {
    step: "02",
    title: "Go Premium or Subscribe",
    desc: "Upgrade to publish your betslips and sell subscriptions, or subscribe to tipsters to access their picks.",
  },
  {
    step: "03",
    title: "Build Your Record",
    desc: "Every pick is tracked publicly. Grow a subscriber base on a verifiable record, and withdraw your 80% share.",
  },
]

export default async function LandingPage() {
  const winRate = (w: number, l: number) => (w + l === 0 ? "0.0" : ((w / (w + l)) * 100).toFixed(1))

  // Top tipsters by win rate, only those with a meaningful settled record.
  const topTipsters = await prisma.user.findMany({
    where: { isPremium: true, OR: [{ totalWins: { gt: 0 } }, { totalLosses: { gt: 0 } }] },
    orderBy: [{ winRate: "desc" }, { totalWins: "desc" }],
    take: 3,
    select: {
      username: true, name: true, specialties: true, subscriptionPrice: true,
      totalWins: true, totalLosses: true, roi: true, subscriberCount: true,
    },
  }).catch(() => [])

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-black gradient-text">IntellaBets</span>
            <span className="text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-full font-medium">BETA</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/leaderboard" className="text-gray-400 hover:text-white text-sm font-medium transition-colors">Leaderboard</Link>
            <Link href="/ai-picks" className="text-gray-400 hover:text-white text-sm font-medium transition-colors">AI Picks</Link>
            <Link href="/#pricing" className="text-gray-400 hover:text-white text-sm font-medium transition-colors">Pricing</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-gray-300 hover:text-white font-medium transition-colors">
              Sign In
            </Link>
            <Link
              href="/register"
              className="btn-primary text-sm py-2 px-4"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(124,58,237,0.4) 0%, transparent 70%)",
          }}
        />
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.3'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm text-purple-300 font-medium">Real odds from 10+ sportsbooks, updated continuously</span>
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white leading-tight mb-6">
            Bet Smarter.{" "}
            <span className="gradient-text">Track Every Pick.</span>
            <br />
            <span className="gold-text">Share Your Edge.</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Sports analytics built on de-vigged odds from every major sportsbook. Follow tipsters whose
            records are tracked publicly, get AI-assisted analysis, or publish your own picks.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="btn-primary text-base py-3 px-8 inline-flex items-center justify-center gap-2"
              style={{ borderRadius: "10px" }}
            >
              Start Free Today
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/leaderboard"
              className="btn-secondary text-base py-3 px-8 inline-flex items-center justify-center gap-2"
              style={{ borderRadius: "10px" }}
            >
              View Leaderboard
            </Link>
          </div>

          {/* What the platform actually does. These are verifiable facts about
              the product, not usage statistics — never publish invented metrics. */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { label: "Sports Covered", value: "8" },
              { label: "Sportsbooks Compared", value: "10+" },
              { label: "You Keep", value: "80%" },
              { label: "AI Analyst", value: "Claude" },
            ].map((stat) => (
              <div key={stat.label} className="card p-4 text-center">
                <div className="text-2xl font-black gradient-text">{stat.value}</div>
                <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
              Everything You Need to{" "}
              <span className="gradient-text">Dominate</span>
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              IntellaBets combines cutting-edge AI with a community of the sharpest sports minds.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="card card-hover p-6">
                <div className="text-4xl mb-4">{f.icon}</div>
                <h3 className="text-white font-bold text-lg mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20" style={{ background: "rgba(124,58,237,0.03)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
              How It <span className="gradient-text">Works</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-12 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.step} className="relative text-center">
                <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-purple-400 font-black text-lg">{step.step}</span>
                </div>
                <h3 className="text-white font-bold text-xl mb-3">{step.title}</h3>
                <p className="text-gray-400 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Top Tipsters Preview */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h2 className="text-3xl font-black text-white mb-2">
                Top Tipsters <span className="gold-text">This Month</span>
              </h2>
              <p className="text-gray-400">Real results, verified track records</p>
            </div>
            <Link href="/leaderboard" className="btn-secondary text-sm">
              Full Leaderboard →
            </Link>
          </div>
          {topTipsters.length === 0 && (
            <div className="card p-8 text-center text-gray-400">
              <div className="text-3xl mb-3">🏆</div>
              <p className="font-semibold text-white mb-1">No ranked tipsters yet</p>
              <p className="text-sm">
                The leaderboard fills in as tipsters publish picks and those picks settle.
                Every record shown here is computed from real settled results.
              </p>
            </div>
          )}
          <div className="grid md:grid-cols-3 gap-6">
            {topTipsters.map((t, i) => (
              <div key={t.username} className={`card card-hover p-6 ${i === 0 ? "premium-glow border-yellow-500/20" : ""}`}>
                {i === 0 && (
                  <div className="flex items-center gap-1 mb-3">
                    <span className="text-yellow-400 text-sm font-bold">👑 #1 This Week</span>
                  </div>
                )}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-lg"
                    style={{ background: `hsl(${(i * 120) % 360}, 60%, 40%)` }}
                  >
                    {(t.name || t.username)[0]}
                  </div>
                  <div>
                    <div className="font-bold text-white">{t.name || t.username}</div>
                    <div className="text-xs text-gray-500">
                      {SPORT_EMOJIS[(t.specialties || "").split(",")[0]] ?? "\u{1F3C6}"} {(t.specialties || "Multi-sport").split(",")[0]} Specialist
                    </div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-green-400 font-black text-xl">{winRate(t.totalWins, t.totalLosses)}%</div>
                    <div className="text-xs text-gray-500">Win Rate</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="text-center">
                    <div className="text-green-400 font-bold">{t.totalWins}W</div>
                    <div className="text-xs text-gray-500">Wins</div>
                  </div>
                  <div className="text-center border-x border-gray-800">
                    <div className="text-red-400 font-bold">{t.totalLosses}L</div>
                    <div className="text-xs text-gray-500">Losses</div>
                  </div>
                  <div className="text-center">
                    <div className="text-purple-400 font-bold">{t.roi >= 0 ? "+" : ""}{t.roi.toFixed(1)}%</div>
                    <div className="text-xs text-gray-500">ROI</div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                  <span className="text-gray-500 text-sm">{t.subscriberCount.toLocaleString()} subscribers</span>
                  <span className="text-white font-bold">${t.subscriptionPrice}/mo</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20" style={{ background: "rgba(124,58,237,0.03)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
              Simple, Transparent <span className="gradient-text">Pricing</span>
            </h2>
            <p className="text-gray-400 max-w-lg mx-auto">
              Start free. Upgrade when you&apos;re ready. Cancel anytime.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Free */}
            <div className="card p-8">
              <div className="text-lg font-bold text-white mb-1">Free</div>
              <div className="text-4xl font-black text-white mb-1">$0</div>
              <div className="text-gray-500 text-sm mb-6">forever</div>
              <ul className="space-y-3 mb-8">
                {[
                  "View leaderboard",
                  "Browse public betslips",
                  "Follow tipsters",
                  "Basic stats tracking",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="text-green-400">✓</span> {item}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block text-center btn-secondary text-sm py-2.5">
                Sign Up Free
              </Link>
            </div>

            {/* Premium Tipster - highlighted */}
            <div className="card p-8 relative border-purple-500/40" style={{ boxShadow: "0 0 40px rgba(124,58,237,0.15)" }}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-600 to-violet-600 text-white text-xs font-bold px-4 py-1 rounded-full">
                MOST POPULAR
              </div>
              <div className="text-lg font-bold text-white mb-1">Premium Tipster</div>
              <div className="text-4xl font-black gradient-text mb-1">${PREMIUM_PRICE}</div>
              <div className="text-gray-500 text-sm mb-6">per month</div>
              <ul className="space-y-3 mb-8">
                {[
                  "Everything in Free",
                  "Create & sell betslips",
                  "Appear on leaderboard",
                  "Set your own sub price ($4.99–$49.99)",
                  "80% revenue share",
                  "Verified badge",
                  "Analytics dashboard",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="text-purple-400">✓</span> {item}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block text-center btn-primary text-sm py-2.5" style={{ borderRadius: "8px" }}>
                Become a Tipster
              </Link>
            </div>

            {/* AI Picks */}
            <div className="card p-8 border-cyan-500/20" style={{ boxShadow: "0 0 40px rgba(6,182,212,0.08)" }}>
              <div className="text-lg font-bold text-white mb-1">AI Picks</div>
              <div className="text-4xl font-black mb-1" style={{ color: "#06b6d4" }}>${AI_PRICE}</div>
              <div className="text-gray-500 text-sm mb-6">per month</div>
              <ul className="space-y-3 mb-8">
                {[
                  "Everything in Free",
                  "Unlimited AI betslips",
                  "All sports covered",
                  "Single, parlay & SGP",
                  "Low / Medium / High risk",
                  "Confidence scores",
                  "AI analysis & reasoning",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-300">
                    <span style={{ color: "#06b6d4" }}>✓</span> {item}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block text-center text-sm py-2.5 rounded-lg font-semibold transition-all"
                style={{
                  background: "rgba(6,182,212,0.1)",
                  color: "#06b6d4",
                  border: "1px solid rgba(6,182,212,0.3)",
                }}>
                Get AI Picks
              </Link>
            </div>
          </div>

          {/* Revenue share explanation. States the fee split — a fact — without
              projecting income. Never imply a typical or expected earning. */}
          <div className="mt-12 card p-6 max-w-3xl mx-auto text-center border-yellow-500/20">
            <div className="text-yellow-400 font-bold text-lg mb-2">How the revenue split works</div>
            <p className="text-gray-300 text-sm mb-4">
              You set your own subscription price between $4.99 and $49.99/mo. IntellaBets takes a
              20% platform fee; you keep 80% of what your subscribers pay.
            </p>
            <div className="p-4 rounded-lg text-left" style={{ background: "rgba(245,158,11,0.05)" }}>
              <div className="text-gray-300 text-sm">
                <span className="text-yellow-400 font-semibold">Example:</span> one subscriber at
                $9.99/mo means $7.99 to you and $2.00 to the platform.
              </div>
            </div>
            <p className="text-gray-500 text-xs mt-4">
              This is an illustration of the fee split only. IntellaBets makes no representation
              about how many subscribers you will attract or what you will earn. Most tipsters earn
              little or nothing, and results depend entirely on your own performance and audience.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse 60% 80% at 50% 50%, rgba(124,58,237,0.15) 0%, transparent 70%)",
          }}
        />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-4xl sm:text-5xl font-black text-white mb-6">
            Ready to <span className="gradient-text">Level Up</span>?
          </h2>
          <p className="text-gray-400 text-lg mb-8">
            Create an account free. No card required to browse the leaderboard and public picks.
          </p>
          <Link href="/register" className="btn-primary text-lg py-4 px-10 inline-block" style={{ borderRadius: "12px" }}>
            Create Free Account →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-xl font-black gradient-text">IntellaBets</span>
          <p className="text-gray-500 text-sm text-center">
            For entertainment purposes. Please gamble responsibly. 18+ only.
          </p>
          {/* Must be real links: card networks and payment underwriters require
              terms, privacy, refund policy and contact details to be reachable. */}
          <div className="flex flex-wrap gap-4 text-sm text-gray-500 justify-center">
            <Link href="/terms" className="hover:text-gray-300 transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-gray-300 transition-colors">Privacy</Link>
            <Link href="/contact" className="hover:text-gray-300 transition-colors">Refunds &amp; Support</Link>
            <a
              href="https://www.ncpgambling.org"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-300 transition-colors"
            >
              Responsible Gambling
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
