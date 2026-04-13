"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { SPORTS, PREMIUM_PRICE } from "@/lib/utils"

interface UserSettings {
  name: string
  bio: string
  specialties: string
  subscriptionPrice: number
  isPremium: boolean
  winRate: number
  totalEarnings: number
  subscriberCount: number
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!session?.user?.username) return
    fetch(`/api/profile/${session.user.username}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          setSettings({
            name: d.user.name,
            bio: d.user.bio ?? "",
            specialties: d.user.specialties ?? "",
            subscriptionPrice: d.user.subscriptionPrice,
            isPremium: d.user.isPremium,
            winRate: d.user.winRate,
            totalEarnings: d.user.totalEarnings,
            subscriberCount: d.user.subscriberCount,
          })
        }
      })
  }, [session?.user?.username])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settings || !session?.user?.username) return

    setSaving(true)
    setError("")
    setSuccess("")

    const res = await fetch(`/api/profile/${session.user.username}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bio: settings.bio,
        specialties: settings.specialties,
        subscriptionPrice: settings.subscriptionPrice,
      }),
    })

    if (res.ok) {
      setSuccess("Settings saved successfully!")
      setTimeout(() => setSuccess(""), 3000)
    } else {
      const d = await res.json()
      setError(d.error ?? "Failed to save")
    }
    setSaving(false)
  }

  const toggleSport = (sport: string) => {
    if (!settings) return
    const current = settings.specialties ? settings.specialties.split(",").map((s) => s.trim()).filter(Boolean) : []
    const updated = current.includes(sport) ? current.filter((s) => s !== sport) : [...current, sport]
    setSettings({ ...settings, specialties: updated.join(",") })
  }

  if (!settings) return <div className="text-center py-20 text-gray-500">Loading...</div>

  const selectedSports = settings.specialties ? settings.specialties.split(",").map((s) => s.trim()).filter(Boolean) : []

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-2xl font-black text-white">Account <span className="gradient-text">Settings</span></h1>

      {/* Account status */}
      <div className="card p-5">
        <h2 className="font-bold text-white text-sm uppercase tracking-wide mb-4">Account Status</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center p-3 rounded-lg bg-white/3 border border-gray-800">
            <div className="text-white font-bold">{settings.isPremium ? "Premium" : "Free"}</div>
            <div className="text-gray-500 text-xs mt-0.5">Plan</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-white/3 border border-gray-800">
            <div className="text-emerald-400 font-bold">{(settings.winRate * 100).toFixed(1)}%</div>
            <div className="text-gray-500 text-xs mt-0.5">Win Rate</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-white/3 border border-gray-800">
            <div className="text-purple-400 font-bold">{settings.subscriberCount}</div>
            <div className="text-gray-500 text-xs mt-0.5">Subscribers</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-white/3 border border-gray-800">
            <div className="text-yellow-400 font-bold">${settings.totalEarnings.toFixed(0)}</div>
            <div className="text-gray-500 text-xs mt-0.5">Total Earned</div>
          </div>
        </div>

        {!settings.isPremium && (
          <div className="mt-4 pt-4 border-t border-gray-800 flex items-center justify-between">
            <p className="text-gray-400 text-sm">Upgrade to earn from your picks</p>
            <a href="/premium" className="btn-primary text-sm py-2 px-4" style={{ borderRadius: "8px" }}>
              Go Premium
            </a>
          </div>
        )}
      </div>

      {/* Profile settings */}
      <form onSubmit={handleSave} className="card p-6 space-y-5">
        <h2 className="font-bold text-white text-sm uppercase tracking-wide">Profile</h2>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Bio</label>
          <textarea
            value={settings.bio}
            onChange={(e) => setSettings({ ...settings, bio: e.target.value })}
            className="input-dark"
            style={{ minHeight: "90px", resize: "vertical" }}
            placeholder="Tell potential subscribers about your betting expertise, track record, and approach..."
            maxLength={300}
          />
          <div className="text-right text-xs text-gray-600 mt-1">{settings.bio.length}/300</div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Sport Specialties</label>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map((sport) => (
              <button
                key={sport}
                type="button"
                onClick={() => toggleSport(sport)}
                className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-all ${
                  selectedSports.includes(sport)
                    ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                    : "border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
                }`}
              >
                {sport}
              </button>
            ))}
          </div>
        </div>

        {settings.isPremium && (
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">
              Monthly Subscription Price ($)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="4.99"
                max="49.99"
                step="1"
                value={settings.subscriptionPrice}
                onChange={(e) => setSettings({ ...settings, subscriptionPrice: parseFloat(e.target.value) })}
                className="flex-1 accent-purple-500"
              />
              <span className="text-white font-bold text-lg w-20 text-right">
                ${settings.subscriptionPrice.toFixed(2)}
              </span>
            </div>
            <div className="text-gray-500 text-xs mt-1">
              You earn 80% · Platform keeps 20% · Min: $4.99 · Max: $49.99
            </div>
            <div className="mt-2 text-sm text-emerald-400">
              You earn: ${(settings.subscriptionPrice * 0.8).toFixed(2)}/subscriber/month
            </div>
          </div>
        )}

        {success && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
            {success}
          </div>
        )}
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="btn-primary py-2.5 px-6 font-semibold text-sm"
          style={{ borderRadius: "8px", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>

      {/* Account info */}
      <div className="card p-5">
        <h2 className="font-bold text-white text-sm uppercase tracking-wide mb-3">Account Info</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Username</span>
            <span className="text-white">@{session?.user?.username}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Email</span>
            <span className="text-white">{session?.user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Member since</span>
            <span className="text-white">2024</span>
          </div>
        </div>
      </div>
    </div>
  )
}
