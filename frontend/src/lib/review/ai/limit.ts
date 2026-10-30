// How many times one sender may ask an AI route in a window. Kept in the
// server instance's memory, so it's a brake, not a wall: the firewall's
// per-address rate limit is the wall.

import { REVIEWER_HEADER, reviewerOf } from "./reviewer"

/** Who's asking: the browser the page names (see reviewer.ts), or the address when it names none. */
export function senderOf(request: Request): string {
  const reviewer = reviewerOf(request.headers.get(REVIEWER_HEADER))
  return reviewer ? `reviewer ${reviewer}` : `address ${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"}`
}

/** A limit of `most` asks per sender in `windowMs`: the function says whether one more is allowed, and counts it if so. */
export function limiter(most: number, windowMs: number) {
  const asked = new Map<string, number[]>()
  return (sender: string, now = Date.now()): boolean => {
    const recent = (asked.get(sender) ?? []).filter((time) => now - time < windowMs)
    if (recent.length >= most) return false
    asked.set(sender, [...recent, now])
    // Forget senders that have gone quiet, so the map doesn't grow without end.
    if (asked.size > 10_000) for (const [key, times] of asked) if (times.every((time) => now - time >= windowMs)) asked.delete(key)
    return true
  }
}
