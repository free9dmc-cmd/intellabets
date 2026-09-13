import type { Metadata } from "next"
import "./globals.css"
import { Providers } from "./providers"
import AgeGate from "@/components/AgeGate"
import IAPProvider from "@/components/IAPProvider"
import SupportChat from "@/components/SupportChat"

// No unsubstantiated claims here either — this text is what search engines and
// link previews show, and it is reviewed during payment underwriting.
export const metadata: Metadata = {
  title: "IntellaBets — Sports Analytics & Tipster Picks",
  description:
    "Sports betting analysis built on odds compared across every major sportsbook. Follow tipsters with publicly tracked records, or publish your own picks. 18+.",
  keywords: "sports analytics, betslips, tipster, sports picks, betting odds, expected value",
  openGraph: {
    title: "IntellaBets",
    description: "Sports analytics built on real odds from every major sportsbook. 18+.",
    type: "website",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <AgeGate />
          <IAPProvider />
          {children}
          <SupportChat />
        </Providers>
      </body>
    </html>
  )
}
