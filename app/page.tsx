import Link from "next/link"
import { PREMIUM_PRICE, AI_PRICE, SPORT_EMOJIS } from "@/lib/utils"

const MOCK_TIPSTERS = [
  {
    name: "SharpBettor99",
    wins: 142, losses: 48,
    roi: 31.4,
    sport: "NFL",
    subscribers: 1240,
    price: 14.99,
  },
  {
    name: "CourtVision_K",
    wins: 218, losses: 91,
    roi: 22.8,
    sport: "NBA",
    subscribers: 980,
    price: 12.99,
  },
  {
    name: "DiamondPicks",
    wins: 97, losses: 38,
    roi: 18.5,
    sport: "MLB",
    subscribers: 645,
    price: 9.99,
  },
]

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
    title: "Earn Real Income",
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
    desc: "Upgrade to share your betslips and earn income, or subscribe to top tipsters to access their picks.",
  },
  {
    step: "03",
    title: "Win More. Earn More.",
    desc: "Build your record, grow your subscriber base, and receive monthly payouts directly to your account.",
  },
]

export default function LandingPage() {
  const winRate = (w: number, l: number) => ((w / (w + l)) * 100).toFixed(1)

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
            <span className="text-sm text-purple-300 font-medium">Live: 2,841 active tipsters earning this month</span>
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white leading-tight mb-6">
            Bet Smarter.{" "}
            <span className="gradient-text">Win More.</span>
            <br />
            <span className="gold-text">Earn Real Income.</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Join the fastest-growing sports betting community. Follow elite tipsters, harness AI predictions,
            or monetize your own expertise — all in one platform.
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

          {/* Hero stats */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { label: "Active Tipsters", value: "2,841" },
              { label: "Avg. Win Rate", value: "61.3%" },
              { label: "Paid Out This Month", value: "$184K" },
              { label: "AI Predictions", value: "50K+" },
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
          <div className="grid md:grid-cols-3 gap-6">
            {MOCK_TIPSTERS.map((t, i) => (
              <div key={t.name} className={`card card-hover p-6 ${i === 0 ? "premium-glow border-yellow-500/20" : ""}`}>
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
                    {t.name[0]}
                  </div>
                  <div>
                    <div className="font-bold text-white">{t.name}</div>
                    <div className="text-xs text-gray-500">
                      {SPORT_EMOJIS[t.sport]} {t.sport} Specialist
                    </div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-green-400 font-black text-xl">{winRate(t.wins, t.losses)}%</div>
                    <div className="text-xs text-gray-500">Win Rate</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="text-center">
                    <div className="text-green-400 font-bold">{t.wins}W</div>
                    <div className="text-xs text-gray-500">Wins</div>
                  </div>
                  <div className="text-center border-x border-gray-800">
                    <div className="text-red-400 font-bold">{t.losses}L</div>
                    <div className="text-xs text-gray-500">Losses</div>
                  </div>
                  <div className="text-center">
                    <div className="text-purple-400 font-bold">+{t.roi}%</div>
                    <div className="text-xs text-gray-500">ROI</div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                  <span className="text-gray-500 text-sm">{t.subscribers.toLocaleString()} subscribers</span>
                  <span className="text-white font-bold">${t.price}/mo</span>
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

          {/* Revenue share callout */}
          <div className="mt-12 card p-6 max-w-3xl mx-auto text-center border-yellow-500/20">
            <div className="text-yellow-400 font-bold text-lg mb-2">💰 Tipster Revenue Potential</div>
            <p className="text-gray-300 text-sm mb-4">
              Set your own subscription price. We only take a 20% platform fee — you keep 80%.
            </p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { subs: "50 subscribers", price: "$9.99/mo", earn: "~$400/mo" },
                { subs: "200 subscribers", price: "$14.99/mo", earn: "~$2,400/mo" },
                { subs: "500 subscribers", price: "$19.99/mo", earn: "~$8,000/mo" },
              ].map((row) => (
                <div key={row.subs} className="p-3 rounded-lg" style={{ background: "rgba(245,158,11,0.05)" }}>
                  <div className="text-yellow-400 font-black text-lg">{row.earn}</div>
                  <div className="text-gray-400 text-xs mt-1">{row.subs} @ {row.price}</div>
                </div>
              ))}
            </div>
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
            Join thousands of sports bettors already winning with IntellaBets. Free to start.
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
          <div className="flex gap-4 text-sm text-gray-500">
            <span>Terms</span>
            <span>Privacy</span>
            <span>Support</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
