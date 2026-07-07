"use client"

import { useEffect } from "react"
import { useSession } from "next-auth/react"
import { initRevenueCat } from "@/lib/native-iap"

export default function IAPProvider() {
  const { data: session } = useSession()

  useEffect(() => {
    if (session?.user?.id) {
      initRevenueCat(session.user.id)
    }
  }, [session?.user?.id])

  return null
}
