"use client"

import { Suspense, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"

function ResetPasswordForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get("token") ?? ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    // Checked here so a typo costs no round trip and, more importantly, does
    // not spend the token.
    if (password !== confirm) {
      setError("The two passwords don't match")
      return
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }

    setLoading(true)
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    }).catch(() => null)

    setLoading(false)
    if (!res) {
      setError("Network problem. Please try again.")
      return
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? "Could not reset the password")
      return
    }
    setDone(true)
    setTimeout(() => router.push("/login"), 2500)
  }

  if (!token) {
    return (
      <div className="card w-full max-w-md p-8 text-center">
        <div className="text-4xl mb-4">🔗</div>
        <h1 className="text-xl font-bold text-white mb-3">Link incomplete</h1>
        <p className="text-gray-400 text-sm leading-relaxed mb-6">
          This page needs the token from your reset email. Open the link in that email directly,
          or request a new one.
        </p>
        <Link href="/forgot-password" className="btn-primary inline-block py-2.5 px-6 font-bold" style={{ borderRadius: "10px" }}>
          Request a new link
        </Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="card w-full max-w-md p-8 text-center">
        <div className="text-4xl mb-4">✅</div>
        <h1 className="text-xl font-bold text-white mb-3">Password updated</h1>
        <p className="text-gray-400 text-sm mb-6">Taking you to the sign-in page…</p>
        <Link href="/login" className="text-purple-400 hover:text-purple-300 text-sm font-medium">
          Sign in now →
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
        <h1 className="text-xl font-bold text-white mt-6 mb-2">Choose a new password</h1>
        <p className="text-gray-400 text-sm">At least 8 characters.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm text-gray-300 mb-1.5">
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            placeholder="••••••••"
          />
        </div>
        <div>
          <label htmlFor="confirm" className="block text-sm text-gray-300 mb-1.5">
            Confirm new password
          </label>
          <input
            id="confirm"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full py-2.5 font-bold disabled:opacity-50"
          style={{ borderRadius: "10px" }}
        >
          {loading ? "Updating…" : "Update password"}
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

/**
 * useSearchParams() suspends, so the component that reads the token has to sit
 * under a Suspense boundary -- without one the static prerender of this route
 * fails at build time.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="card w-full max-w-md p-8 text-center text-gray-400 text-sm">
          Loading…
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
