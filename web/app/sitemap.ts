import type { MetadataRoute } from "next"
import { privacyPolicy } from "@/lib/legal/privacy"
import { supportAndRefunds } from "@/lib/legal/support"
import { termsOfService } from "@/lib/legal/terms"

const BASE_URL = "https://intellabets.com"

// Only routes reachable signed-out (see middleware.ts publicRoutes) belong
// here — listing a page that redirects to /login for a crawler is pointless.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/how-it-works`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/premium`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/leaderboard`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/register`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    // Legal pages report when their wording last changed, not the build time.
    ...[supportAndRefunds, termsOfService, privacyPolicy].map((doc) => ({
      url: `${BASE_URL}${doc.path}`,
      lastModified: new Date(`${doc.lastUpdated}T00:00:00Z`),
      changeFrequency: "yearly" as const,
      priority: doc.path === "/contact" ? 0.3 : 0.2,
    })),
  ]
}
