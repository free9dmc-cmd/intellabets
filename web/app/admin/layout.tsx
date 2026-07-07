import { requireAdminPage } from "@/lib/admin"
import AdminSidebar from "./AdminSidebar"

export const metadata = { title: "Admin — IntellaBets" }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminPage()

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-primary)" }}>
      <AdminSidebar adminEmail={session.user.email ?? ""} />
      <main className="ml-60 flex-1 p-8 min-h-screen">
        {children}
      </main>
    </div>
  )
}
