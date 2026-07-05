import { useEffect, useRef } from "react"
import Pusher, { Channel } from "pusher-js"

const PUSHER_KEY = process.env.EXPO_PUBLIC_PUSHER_KEY ?? ""
const PUSHER_CLUSTER = process.env.EXPO_PUBLIC_PUSHER_CLUSTER ?? "us2"

let singleton: Pusher | null = null

function getPusher(): Pusher | null {
  if (!PUSHER_KEY) return null
  if (!singleton) {
    singleton = new Pusher(PUSHER_KEY, { cluster: PUSHER_CLUSTER })
  }
  return singleton
}

/**
 * Subscribe to a channel/event and invoke `onEvent` on each message.
 * Automatically unsubscribes on unmount or when channel changes.
 *
 * Example:
 *   useRealtime(`predictions-nfl`, "prediction:new", (p) => addPick(p))
 */
export function useRealtime<T = unknown>(
  channelName: string | null,
  event: string,
  onEvent: (data: T) => void
) {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  useEffect(() => {
    if (!channelName) return
    const pusher = getPusher()
    if (!pusher) return

    const channel: Channel = pusher.subscribe(channelName)
    const cb = (data: T) => handlerRef.current(data)
    channel.bind(event, cb)

    return () => {
      channel.unbind(event, cb)
      pusher.unsubscribe(channelName)
    }
  }, [channelName, event])
}

/** Subscribe to live odds movement for a sport. */
export function useLiveOdds(sport: string, onUpdate: (payload: unknown) => void) {
  useRealtime(`odds-${sport.toLowerCase()}`, "odds:update", onUpdate)
}

/** Subscribe to new AI/house +EV predictions for a sport. */
export function useNewPredictions(sport: string, onPick: (payload: unknown) => void) {
  useRealtime(`predictions-${sport.toLowerCase()}`, "prediction:new", onPick)
}

/** Subscribe to a tipster's newly published betslips. */
export function useTipsterFeed(tipsterId: string, onBetslip: (payload: unknown) => void) {
  useRealtime(`tipster-${tipsterId}`, "betslip:published", onBetslip)
}
