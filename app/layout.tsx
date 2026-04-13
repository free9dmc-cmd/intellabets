import type { Metadata } from "next"
import "./globals.css"
import { Providers } from "./providers"

export const metadata: Metadata = {
  title: "IntellaBets — Bet Smarter. Win More.",
  description:
    "Join the #1 sports betting community. Follow elite tipsters, access AI-powered predictions, and turn your sports knowledge into income.",
  keywords: "sports betting, betslips, tipster, AI predictions, sports picks, parlays",
  openGraph: {
    title: "IntellaBets",
    description: "Bet Smarter. Win More.",
    type: "website",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
