import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { check, clientKey, tooManyRequests } from "@/lib/rate-limit"
import { hashResetToken } from "@/lib/password-reset"

/**
 * Spend a reset token and set a new password.
 *
 * Unlike the request step, this one does report failure precisely: the caller
 * already holds a token, so "expired" vs "already used" vs "not a token" tells
 * them nothing they could not work out, and the difference is the whole
 * difference between "ask for a new link" and "you already did this".
 */

const MIN_PASSWORD = 8

export async function POST(req: Request) {
  // A token is 256 bits, so brute force is not the threat; this just stops a
  // broken client from hammering bcrypt.
  const rl = await check(`reset:${clientKey(req)}`, 10, 900)
  if (!rl.ok) {
    return tooManyRequests(rl.retryAfter, "Too many attempts. Please wait a few minutes.")
  }

  const body = await req.json().catch(() => null)
  const token = typeof body?.token === "string" ? body.token : ""
  const password = typeof body?.password === "string" ? body.password : ""

  if (!token || !password) {
    return NextResponse.json({ error: "Missing token or password" }, { status: 400 })
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD} characters` },
      { status: 400 }
    )
  }

  try {
    // Look up by hash: the raw token is never stored, so this is the only way
    // to find the row, and it is an indexed unique lookup.
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    })

    if (!record) {
      return NextResponse.json(
        { error: "This reset link is not valid. Request a new one." },
        { status: 400 }
      )
    }
    if (record.usedAt) {
      return NextResponse.json(
        { error: "This reset link has already been used. Request a new one." },
        { status: 400 }
      )
    }
    if (record.expiresAt <= new Date()) {
      return NextResponse.json(
        { error: "This reset link has expired. Request a new one." },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 12)

    // One transaction: set the password, spend this token, and clear the
    // user's other outstanding tokens. If any part fails none of it applies,
    // so a token can never be spent without the password actually changing.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { password: passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.deleteMany({
        where: { userId: record.userId, usedAt: null },
      }),
    ])

    return NextResponse.json({ message: "Password updated. You can sign in now." })
  } catch (err) {
    console.error("reset-password failed:", err)
    return NextResponse.json({ error: "Could not reset the password" }, { status: 500 })
  }
}
