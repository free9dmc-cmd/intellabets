import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { check, clientKey, tooManyRequests } from "@/lib/rate-limit"
import { sendEmail, passwordResetEmail } from "@/lib/email"
import { newResetToken, resetTokenExpiry, TOKEN_TTL_MINUTES } from "@/lib/password-reset"

/**
 * Start a password reset.
 *
 * The response is identical whether or not the address has an account. That is
 * the main security property of this endpoint: a different message, status or
 * timing for "no such user" turns it into a tool for discovering who has an
 * account here, which for a gambling-adjacent service is a real harm to the
 * customer, not just an information leak.
 */

// Said no matter what happened, including when email is unconfigured.
const GENERIC_REPLY = {
  message:
    "If an account exists for that email, a reset link is on its way. Check your inbox, including spam.",
}

export async function POST(req: Request) {
  // Two limits. Per-IP stops someone walking a list of addresses; per-address
  // stops using us to flood one person's inbox from many IPs.
  const ipLimit = await check(`forgot:${clientKey(req)}`, 5, 900)
  if (!ipLimit.ok) {
    return tooManyRequests(ipLimit.retryAfter, "Too many reset requests. Please wait a few minutes.")
  }

  const body = await req.json().catch(() => null)
  const rawEmail = typeof body?.email === "string" ? body.email : ""
  const email = rawEmail.trim().toLowerCase()

  // Shape check only. An invalid address cannot belong to an account, so the
  // generic reply is still the truthful answer.
  if (!email || email.length > 320 || !email.includes("@")) {
    return NextResponse.json(GENERIC_REPLY)
  }

  const emailLimit = await check(`forgot-addr:${email}`, 3, 900)
  if (!emailLimit.ok) {
    return NextResponse.json(GENERIC_REPLY)
  }

  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })

    if (user) {
      const { token, tokenHash } = newResetToken()

      // Drop this user's other outstanding tokens. Asking again should
      // invalidate the previous link rather than leaving several live.
      await prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      })
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt: resetTokenExpiry() },
      })

      const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://intellabets.com"
      const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`
      const { text, html } = passwordResetEmail(resetUrl, TOKEN_TTL_MINUTES)

      const sent = await sendEmail({
        to: email,
        subject: "Reset your IntellaBets password",
        text,
        html,
      })

      if (!sent.ok) {
        // Log loudly and still answer generically. A user who cannot tell
        // whether the mail failed is a support ticket; a user who learns from
        // the response that this address has an account is a security problem.
        // Never log the token -- it is the credential.
        console.error(`forgot-password: email not delivered (${sent.reason}): ${sent.detail}`)
      }
    }
  } catch (err) {
    // Same reply on an internal failure, for the same reason.
    console.error("forgot-password failed:", err)
  }

  return NextResponse.json(GENERIC_REPLY)
}
