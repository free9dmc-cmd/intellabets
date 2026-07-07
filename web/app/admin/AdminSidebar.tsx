"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "⊞" },
  { href: "/admin/users", label: "Users", icon: "👥" },
  { href: "/admin/payouts", label: "Payouts", icon: "💰" },
  { href: "/dashboard", label: "← App", icon: "" },
]

export default function AdminSidebar({ adminEmail }: { adminEmail: string }) {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-0 h-full w-60 glass border-r border-gray-800 flex flex-col z-40"
      style={{ background: "#080b14" }}
    >
      <div className="p-5 border-b border-gray-800">
        <div className="text-xl font-black gradient-text">IntellaBets</div>
        <div className="inline-flex items-center gap-1 mt-1 bg-red-500/20 border border-red-500/30 px-2 py-0.5 rounded text-xs text-red-400 font-bold">
          ⚙ ADMIN
        </div>
        <div className="text-gray-600 text-xs mt-2 truncate">{adminEmail}</div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV.map((link) => {
          const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href + "/") || pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-purple-500/15 text-purple-300"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <span>{link.icon}</span>
              {link.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-gray-800">
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
        >
          ↩ Sign Out
        </button>
      </div>
    </aside>
  )
}
