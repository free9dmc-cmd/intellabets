import { prisma } from "@/lib/prisma"
import { requireAdminPage } from "@/lib/admin"
import { timeAgo } from "@/lib/utils"

export const dynamic = "force-dynamic"

const PRIORITY_STYLE: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-400 border-red-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  normal: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  low: "bg-gray-500/10 text-gray-500 border-gray-700",
}

export default async function AdminSupportPage() {
  await requireAdminPage()

  const tickets = await prisma.supportTicket.findMany({
    where: { status: "open" },
    include: {
      user: { select: { username: true, email: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
    // Urgent first, then oldest — an urgent ticket sitting for a day is the
    // worst outcome, so sort by severity before recency.
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    take: 50,
  })

  const order = ["urgent", "high", "normal", "low"]
  tickets.sort(
    (a, b) =>
      order.indexOf(a.priority) - order.indexOf(b.priority) ||
      a.createdAt.getTime() - b.createdAt.getTime()
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white mb-1">Support Queue</h1>
        <p className="text-gray-400 text-sm">
          Tickets the AI agent couldn&apos;t resolve. Each carries the account snapshot it saw at
          the moment it escalated.
        </p>
      </div>

      {tickets.length === 0 && (
        <div className="card p-8 text-center text-gray-400">
          <div className="text-3xl mb-3">✅</div>
          <p className="font-semibold text-white">No open tickets</p>
        </div>
      )}

      {tickets.map((t) => {
        const diag = (t.diagnostics ?? {}) as {
          agentSummary?: string
          account?: Record<string, unknown> | null
        }
        return (
          <div key={t.id} className="card p-5 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-bold text-white">{t.subject}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {t.user ? `${t.user.username} · ${t.user.email}` : "Not signed in"} ·{" "}
                  {timeAgo(t.createdAt)} · <span className="font-mono">{t.id.slice(-8)}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <span
                  className={`text-xs font-bold px-2 py-1 rounded border ${
                    PRIORITY_STYLE[t.priority] ?? PRIORITY_STYLE.normal
                  }`}
                >
                  {t.priority.toUpperCase()}
                </span>
                <span className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-400">
                  {t.category}
                </span>
              </div>
            </div>

            {diag.agentSummary && (
              <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                <div className="text-xs text-purple-400 font-semibold uppercase tracking-wide mb-1">
                  Agent diagnosis
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">{diag.agentSummary}</p>
              </div>
            )}

            <details className="group">
              <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-200">
                Conversation ({t.messages.length} messages)
              </summary>
              <div className="mt-3 space-y-2">
                {t.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`text-sm rounded-lg px-3 py-2 whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-white/4 border border-gray-800 text-gray-200"
                        : "bg-purple-500/5 border border-purple-500/15 text-gray-300"
                    }`}
                  >
                    <span className="text-xs text-gray-500 block mb-1">{m.role}</span>
                    {m.content}
                  </div>
                ))}
              </div>
            </details>

            {diag.account && (
              <details>
                <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-200">
                  Account snapshot at escalation
                </summary>
                <pre className="mt-2 text-xs text-gray-400 overflow-x-auto p-3 rounded-lg bg-black/30 border border-gray-800">
                  {JSON.stringify(diag.account, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )
      })}
    </div>
  )
}
