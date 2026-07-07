import { NextResponse } from "next/server"
import { requireAdminApi } from "@/lib/admin"
import { prisma } from "@/lib/prisma"

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdminApi()
  if (error) return error

  const { status } = await req.json()
  if (!["pending", "processing", "paid"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

  const payout = await prisma.payout.update({
    where: { id: params.id },
    data: {
      status,
      ...(status === "paid" && { paidAt: new Date() }),
    },
  })

  return NextResponse.json({ payout })
}
