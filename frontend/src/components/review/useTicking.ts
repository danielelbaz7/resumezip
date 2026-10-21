import { useEffect, useState } from "react"

/** Re-renders every 100 ms while `on`, for words that count. */
export function useTicking(on: boolean) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!on) return
    const timer = setInterval(() => setTick((tick) => tick + 1), 100)
    return () => clearInterval(timer)
  }, [on])
}
