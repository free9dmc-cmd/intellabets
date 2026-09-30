/**
 * legal.intellabets.com used to be a separate cPanel site with its own copies
 * of the Privacy Policy and Terms. Those copies drifted from the real ones, so
 * the subdomain now points at this app and forwards everything to the single
 * source of truth. Old links (including any given to app stores or payment
 * providers) keep working.
 *
 * Destinations MUST be absolute. A relative "/privacy" would keep the visitor
 * on legal.intellabets.com, where the catch-all rule below would match again
 * and redirect forever.
 *
 * `permanent: true` sends HTTP 308, the modern form of 301 ("moved for good")
 * that also preserves the request method. Browsers and crawlers cache it.
 */
// `value` is a regular expression, so the dots are escaped: unescaped, "."
// would also match hosts like "legal-intellabets.com".
const LEGAL_HOST = [{ type: "host", value: "legal\\.intellabets\\.com" }]
const LEGAL_SITE = "https://intellabets.com"

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // The old subdomain: one hop straight to the canonical page.
      { source: "/privacy-policy.html", has: LEGAL_HOST, destination: `${LEGAL_SITE}/privacy`, permanent: true },
      { source: "/terms.html", has: LEGAL_HOST, destination: `${LEGAL_SITE}/terms`, permanent: true },
      { source: "/terms", has: LEGAL_HOST, destination: `${LEGAL_SITE}/terms`, permanent: true },
      // Everything else on the old subdomain, including its home page.
      { source: "/:path*", has: LEGAL_HOST, destination: `${LEGAL_SITE}/privacy`, permanent: true },

      // Safety net on every other host: if the old filenames ever reach the
      // main site (e.g. the subdomain is set up as a Vercel "redirect domain"
      // instead of a normal domain), send them to the right page rather than
      // the sign-in wall. Relative is safe here: /privacy never matches these.
      { source: "/privacy-policy.html", destination: "/privacy", permanent: true },
      { source: "/terms.html", destination: "/terms", permanent: true },
    ]
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "api.dicebear.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "*.vercel.app",
        process.env.NEXT_PUBLIC_APP_URL?.replace("https://", "") ?? "",
      ].filter(Boolean),
    },
  },
}

module.exports = nextConfig
