import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hasAIAccess } from "@/lib/entitlements"
import { getPlacementGuide, isEngineConfigured } from "@/lib/engine"

/**
 * Placement guide for one engine prediction.
 *
 * Entitlement is checked HERE against this app's own user table, then the
 * engine is called server-to-server. The service key never reaches the browser.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      isPremium: true,
      premiumUntil: true,
      aiSubscription: { select: { status: true, expiresAt: true } },
    },
  })
  if (!hasAIAccess(user)) {
    return NextResponse.json(
      { error: "Premium membership or AI Picks subscription required", code: "NO_ACCESS" },
      { status: 403 }
    )
  }

  if (!isEngineConfigured()) {
    return NextResponse.json(
      { error: "Betting guidance is not available right now." },
      { status: 503 }
    )
  }

  const { searchParams } = new URL(req.url)
  const raw = Number(searchParams.get("bankroll"))
  const bankroll = Number.isFinite(raw) && raw > 0 ? raw : undefined

  const guide = await getPlacementGuide(params.id, bankroll)
  if (!guide) {
    return NextResponse.json({ error: "Could not load guidance for this pick." }, { status: 502 })
  }
  return NextResponse.json(guide)
}
