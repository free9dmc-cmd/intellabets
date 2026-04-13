"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: "", email: "", username: "", password: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? "Registration failed")
      setLoading(false)
      return
    }

    // Auto sign in after register
    const signInRes = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    })

    if (signInRes?.error) {
      setError("Account created but sign-in failed. Please log in manually.")
      router.push("/login")
    } else {
      router.push("/dashboard")
      router.refresh()
    }
  }

  return (
    <div className="card w-full max-w-md p-8">
      <div className="text-center mb-8">
        <Link href="/" className="text-2xl font-black gradient-text">
          IntellaBets
        </Link>
        <h1 className="text-xl font-bold text-white mt-4">Create your account</h1>
        <p className="text-gray-400 text-sm mt-1">Start free — no credit card required</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Full Name</label>
            <input
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              className="input-dark"
              placeholder="Your name"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Username</label>
            <input
              name="username"
              type="text"
              value={form.username}
              onChange={handleChange}
              className="input-dark"
              placeholder="coolbettor99"
              required
              pattern="[a-zA-Z0-9_]{3,20}"
              title="3-20 characters, letters/numbers/underscores"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
          <input
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            className="input-dark"
            placeholder="you@example.com"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
          <input
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            className="input-dark"
            placeholder="At least 8 characters"
            required
            minLength={8}
          />
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full py-3 text-sm font-semibold"
          style={{ borderRadius: "8px", opacity: loading ? 0.7 : 1 }}
        >
          {loading ? "Creating account..." : "Create Free Account"}
        </button>
      </form>

      <p className="text-center text-gray-500 text-xs mt-4 leading-relaxed">
        By signing up, you agree to our Terms of Service. You must be 18+ to use IntellaBets.
      </p>

      <p className="text-center text-gray-500 text-sm mt-4">
        Already have an account?{" "}
        <Link href="/login" className="text-purple-400 hover:text-purple-300 font-medium">
          Sign in
        </Link>
      </p>
    </div>
  )
}
