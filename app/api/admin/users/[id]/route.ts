import { NextResponse } from "next/server"
import { requireAdminApi } from "@/lib/admin"
import { prisma } from "@/lib/prisma"

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdminApi()
  if (error) return error

  const body = await req.json()
  const { isPremium, isVerified } = body

  const data: Record<string, unknown> = {}
  if (isPremium !== undefined) {
    data.isPremium = isPremium
    if (isPremium) {
      data.premiumSince = new Date()
      const until = new Date()
      until.setFullYear(until.getFullYear() + 1)
      data.premiumUntil = until
    } else {
      data.premiumUntil = null
    }
  }
  if (isVerified !== undefined) data.isVerified = isVerified

  const user = await prisma.user.update({
    where: { id: params.id },
    data,
    select: { id: true, isPremium: true, isVerified: true, name: true, email: true },
  })

  return NextResponse.json({ user })
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdminApi()
  if (error) return error

  await prisma.user.delete({ where: { id: params.id } })
  return NextResponse.json({ message: "User deleted" })
}
