// A random name for this browser, sent with each AI review so /api/review can
// count reviews per browser rather than per address: a campus, an office or a
// phone carrier puts many people behind one address. Anyone can clear it and
// get a new one, so it only shares the limit out fairly; the firewall's
// per-address limit is what holds against someone who does. The route keeps it
// in memory for the limit's window and never logs it.

export const REVIEWER_HEADER = "x-reviewer"

const KEY = "resumezip.reviewer"
// crypto.randomUUID's shape, so the route can't be handed something long or odd to keep in memory.
const REVIEWER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** The route's side: the reviewer a request names, or null when it names none the page would send. */
export const reviewerOf = (header: string | null): string | null => (header && REVIEWER.test(header) ? header : null)

/** This browser's reviewer, made the first time; null when storage or randomUUID is refused. */
export function reviewerId(): string | null {
  try {
    const kept = reviewerOf(localStorage.getItem(KEY))
    if (kept) return kept
    const made = crypto.randomUUID()
    localStorage.setItem(KEY, made)
    return made
  } catch {
    // Storage blocked, or a page that isn't https: the route counts by address instead.
    return null
  }
}
