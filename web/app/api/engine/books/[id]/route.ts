import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hasAIAccess } from "@/lib/entitlements"
import { getBookComparison, isEngineConfigured } from "@/lib/engine"

/** Every book's price for a pick, defaulting the comparison to the user's own book. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      isPremium: true,
      premiumUntil: true,
      preferredBook: true,
      aiSubscription: { select: { status: true, expiresAt: true } },
    },
  })
  if (!hasAIAccess(user)) {
    return NextResponse.json({ error: "Premium membership required" }, { status: 403 })
  }
  if (!isEngineConfigured()) {
    return NextResponse.json({ error: "Odds comparison is unavailable right now." }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const raw = Number(searchParams.get("stake"))
  const stake = Number.isFinite(raw) && raw > 0 ? raw : 100

  const comparison = await getBookComparison(params.id, {
    stake,
    preferred: searchParams.get("preferred") ?? user?.preferredBook ?? null,
  })
  if (!comparison) {
    return NextResponse.json({ error: "Could not load prices." }, { status: 502 })
  }
  return NextResponse.json(comparison)
}
