// The review page's side of /api/review.

import { pauseAi, resumeAi } from "./paused"
import { sentOf } from "./request"
import { savedNotesOf, type SavedNote } from "./saved"
import type { Unit } from "./units"

/** Why there are no notes: "off" when the site has no AI keys, "other" for anything unexpected. */
export type Problem = "limit" | "busy" | "off" | "lines" | "other"

/** Why there are no notes, worded for the person. */
export class AiReviewError extends Error {
  constructor(
    message: string,
    readonly reason: Problem = "other",
  ) {
    super(message)
  }
}

const PROBLEMS: Record<Exclude<Problem, "other">, string> = {
  limit: "You’ve asked for a lot of AI notes in a short time. Try again in a few minutes.",
  busy: "The AI is busy right now. Try again in a minute.",
  off: "AI notes aren’t switched on here.",
  lines: "This resume is too long for AI notes.",
}

export async function askForNotes(units: readonly Unit[], signal?: AbortSignal): Promise<SavedNote[]> {
  let response: Response
  try {
    response = await fetch("/api/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lines: sentOf(units) }),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new AiReviewError("The AI notes couldn’t load. Check your connection and try again.")
  }
  const body = (await response.json().catch(() => null)) as { notes?: unknown; error?: unknown } | null
  if (!response.ok || !body) {
    // The firewall's rate limit turns a review away before the route runs, so its 429 has no { error }.
    const reason: Problem =
      response.status === 429
        ? "limit"
        : typeof body?.error === "string" && Object.hasOwn(PROBLEMS, body.error)
          ? (body.error as Problem)
          : "other"
    if (reason === "limit") pauseAi()
    throw new AiReviewError(reason === "other" ? "Something went wrong getting AI notes. Try again in a minute." : PROBLEMS[reason], reason)
  }
  resumeAi()
  return savedNotesOf(body.notes)
}
