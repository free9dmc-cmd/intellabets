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
        // Anything reachable without an account. Legal and marketing pages
        // MUST be here: Apple and Google both require a publicly loadable
        // privacy policy URL for store review, payment underwriters read the
        // terms and refund policy before approving a merchant, and a pricing
        // page behind a login wall cannot convert anyone.
        //
        // These pages call no session APIs of their own, so gating them bought
        // nothing. Prefix matching means /profile/<username> is covered too,
        // which the public leaderboard links straight into.
        const publicRoutes = [
          "/",
          "/login",
          "/register",
          "/leaderboard",
          "/premium",
          "/terms",
          "/privacy",
          "/contact",
          "/profile",
          "/how-it-works",
          "/sitemap.xml",
          "/robots.txt",
        ]
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
