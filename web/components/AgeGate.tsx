"use client"

import { useState, useEffect } from "react"

const STORAGE_KEY = "intellabets_age_verified"

export default function AgeGate() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
    }
  }, [])

  const confirm = () => {
    localStorage.setItem(STORAGE_KEY, "1")
    setVisible(false)
  }

  const deny = () => {
    window.location.href = "https://www.google.com"
  }

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(8,11,20,0.97)", backdropFilter: "blur(8px)" }}
    >
      <div className="card max-w-sm w-full p-8 text-center" style={{ boxShadow: "0 0 60px rgba(124,58,237,0.2)" }}>
        <div className="text-5xl mb-4">🎰</div>
        <h2 className="text-2xl font-black text-white mb-2">Age Verification</h2>
        <p className="text-gray-400 text-sm mb-6 leading-relaxed">
          IntellaBets provides sports betting analysis and picks. You must be <strong className="text-white">18 years or older</strong> to access this site.
        </p>
        <p className="text-gray-500 text-xs mb-6">
          Are you 18 or older and agree to our{" "}
          <a href="/terms" className="text-purple-400 hover:underline">Terms of Service</a>?
        </p>

        <div className="space-y-3">
          <button
            onClick={confirm}
            className="btn-primary w-full py-3 font-bold"
            style={{ borderRadius: "10px" }}
          >
            Yes, I am 18 or older
          </button>
          <button
            onClick={deny}
            className="w-full py-3 font-medium text-gray-500 hover:text-gray-300 transition-colors text-sm"
          >
            No, I am under 18
          </button>
        </div>

        <p className="text-gray-700 text-xs mt-4">
          Please gamble responsibly. If you need help, visit{" "}
          <a href="https://www.ncpgambling.org" target="_blank" rel="noopener noreferrer" className="hover:text-gray-500 transition-colors">
            ncpgambling.org
          </a>
        </p>
      </div>
    </div>
  )
}
