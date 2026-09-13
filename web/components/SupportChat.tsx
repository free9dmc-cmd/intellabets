"use client"

import { useState, useRef, useEffect } from "react"

interface Turn {
  role: "user" | "assistant"
  content: string
}

const GREETING =
  "Hi — I'm the IntellaBets support assistant. I can see your account, so I can tell you exactly what's going on with billing, access, or payouts. What's the problem?"

export default function SupportChat() {
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([{ role: "assistant", content: GREETING }])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [ticketId, setTicketId] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [turns, open])

  const send = async () => {
    const message = input.trim()
    if (!message || sending) return

    setInput("")
    setTurns((t) => [...t, { role: "user", content: message }])
    setSending(true)

    try {
      const res = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send prior turns for context, but not the canned greeting.
        body: JSON.stringify({ message, history: turns.slice(1) }),
      })
      const data = await res.json().catch(() => ({}))
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          content:
            data.reply ??
            data.error ??
            "Something went wrong. Please email support@intellabets.com.",
        },
      ])
      if (data.ticketId) setTicketId(data.ticketId)
    } catch {
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          content: "I couldn't reach the server. Please email support@intellabets.com.",
        },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close support chat" : "Open support chat"}
        className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl transition-transform hover:scale-105"
        style={{
          background: "linear-gradient(135deg, #7c3aed, #a855f7)",
          boxShadow: "0 8px 30px rgba(124,58,237,0.4)",
        }}
      >
        {open ? "✕" : "💬"}
      </button>

      {open && (
        <div
          className="fixed z-40 flex flex-col card overflow-hidden
                     bottom-24 right-5 w-[min(calc(100vw-2.5rem),22rem)] h-[min(70vh,32rem)]"
          style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
          role="dialog"
          aria-label="Support chat"
        >
          <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0">
            <div className="font-bold text-white text-sm">Support</div>
            <div className="text-xs text-gray-500">Usually replies instantly</div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {turns.map((t, i) => (
              <div
                key={i}
                className={`text-sm leading-relaxed rounded-lg px-3 py-2 max-w-[90%] whitespace-pre-wrap ${
                  t.role === "user"
                    ? "ml-auto bg-purple-500/15 border border-purple-500/25 text-white"
                    : "bg-white/4 border border-gray-800 text-gray-200"
                }`}
              >
                {t.content}
              </div>
            ))}

            {sending && <div className="text-gray-500 text-sm">Thinking…</div>}

            {ticketId && (
              <div className="text-xs text-emerald-400 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                Escalated to our team — reference{" "}
                <span className="font-mono">{ticketId.slice(-8)}</span>. We&apos;ll follow up by
                email.
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="p-3 border-t border-gray-800 flex-shrink-0">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                placeholder="Describe the problem…"
                maxLength={4000}
                disabled={sending}
                className="input-dark text-sm py-2 flex-1"
              />
              <button
                onClick={() => void send()}
                disabled={sending || !input.trim()}
                className="btn-primary text-sm py-2 px-4"
                style={{ borderRadius: "8px", opacity: sending || !input.trim() ? 0.5 : 1 }}
              >
                Send
              </button>
            </div>
            <p className="text-gray-600 text-xs mt-2 leading-relaxed">
              An AI assistant. It can read your account but cannot change billing — anything it
              can&apos;t fix gets escalated to a person.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
