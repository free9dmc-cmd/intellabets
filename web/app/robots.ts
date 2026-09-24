import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Everything else requires an account per middleware.ts publicRoutes;
        // no point letting crawlers spend budget on redirect targets or API routes.
        disallow: ["/api/", "/admin", "/dashboard", "/picks", "/ai-picks", "/my-bets", "/betslips", "/settings", "/payouts"],
      },
    ],
    sitemap: "https://intellabets.com/sitemap.xml",
  }
}
