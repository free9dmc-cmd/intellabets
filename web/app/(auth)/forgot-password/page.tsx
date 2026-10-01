"use client"

import { useState } from "react"
import Link from "next/link"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    // The endpoint answers the same way whether or not the account exists, so
    // there is nothing to branch on here: a submit that completes is a success.
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {})
    setLoading(false)
    setSent(true)
  }

  if (sent) {
    return (
      <div className="card w-full max-w-md p-8 text-center">
        <div className="text-4xl mb-4">📬</div>
        <h1 className="text-xl font-bold text-white mb-3">Check your email</h1>
        <p className="text-gray-400 text-sm leading-relaxed mb-6">
          If an account exists for <span className="text-gray-200">{email}</span>, a reset link is
          on its way. It expires in an hour and works once. Check your spam folder if it
          hasn&apos;t arrived in a few minutes.
        </p>
        <Link href="/login" className="text-purple-400 hover:text-purple-300 text-sm font-medium">
          ← Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="card w-full max-w-md p-8">
      <div className="text-center mb-8">
        <Link href="/" className="text-2xl font-black gradient-text">
          IntellaBets
        </Link>
        <h1 className="text-xl font-bold text-white mt-6 mb-2">Reset your password</h1>
        <p className="text-gray-400 text-sm">
          Enter the email on your account and we&apos;ll send you a link.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm text-gray-300 mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            placeholder="you@example.com"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full py-2.5 font-bold disabled:opacity-50"
          style={{ borderRadius: "10px" }}
        >
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        <Link href="/login" className="text-purple-400 hover:text-purple-300">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
