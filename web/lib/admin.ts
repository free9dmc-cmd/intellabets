import { getServerSession } from "next-auth"
import { authOptions } from "./auth"
import { redirect } from "next/navigation"
import { NextResponse } from "next/server"

export async function requireAdminPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) redirect("/dashboard")
  return session
}

export async function requireAdminApi() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return { session: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { session, error: null }
}
