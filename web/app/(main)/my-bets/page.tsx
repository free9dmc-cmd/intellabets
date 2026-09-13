import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import BetTracker from "./BetTracker"

export const dynamic = "force-dynamic"

export default async function MyBetsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/login")

  const count = await prisma.placedBet.count({ where: { userId: session.user.id } })

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-white mb-1">
          📒 My <span className="gradient-text">Bets</span>
        </h1>
        <p className="text-gray-400 text-sm">
          Your real results — what you staked, what came back, and which books you did best at.
        </p>
      </div>

      {count === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          <div className="text-3xl mb-3">📒</div>
          <p className="font-semibold text-white mb-1">Nothing tracked yet</p>
          <p className="text-sm mb-5">
            When you place a bet from a pick, tap &ldquo;I placed this&rdquo; and it shows up here.
            Results grade themselves once the game finishes.
          </p>
          <Link href="/picks" className="btn-primary py-2.5 px-6 text-sm font-semibold inline-block" style={{ borderRadius: "8px" }}>
            See today&apos;s picks
          </Link>
        </div>
      ) : (
        <BetTracker />
      )}

      <p className="text-gray-600 text-xs text-center leading-relaxed">
        These are bets you told us you placed at your own sportsbook. IntellaBets does not place
        bets or hold funds, and cannot verify amounts independently.
      </p>
    </div>
  )
}
