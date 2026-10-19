// When the AI notes were last turned away for being asked too often, kept for
// this tab: a review in that time skips a call that would only be turned away,
// and the review page can say so before a file is dropped.

const KEY = "resumezip.aiPausedUntil"
// The firewall counts in fixed 10-minute windows, so a pause is over by then at the latest.
const PAUSE_MS = 10 * 60_000

export function pauseAi(now = Date.now()) {
  try {
    sessionStorage.setItem(KEY, String(now + PAUSE_MS))
  } catch {
    // Storage blocked: the next review asks and is turned away again, which is all this saves.
  }
}

/** When the pause ends, in ms since the epoch; 0 with none kept. */
export function aiPausedUntil(): number {
  try {
    return Number(sessionStorage.getItem(KEY)) || 0
  } catch {
    return 0
  }
}

export function aiPaused(now = Date.now()): boolean {
  return aiPausedUntil() > now
}

/** The AI answered: whatever turned this tab away is over. */
export function resumeAi() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Storage blocked: there was nothing kept to forget.
  }
}
