import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const pathname = req.nextUrl.pathname

    // Redirect logged-in users away from auth pages
    if (token && (pathname === "/login" || pathname === "/register")) {
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }

    // Block non-admins from /admin
    if (pathname.startsWith("/admin") && !token?.isAdmin) {
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized({ token, req }) {
        const pathname = req.nextUrl.pathname
        // Public routes don't require auth
        const publicRoutes = ["/", "/login", "/register", "/leaderboard"]
        if (publicRoutes.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
          return true
        }
        return !!token
      },
    },
  }
)

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg).*)",
  ],
}
