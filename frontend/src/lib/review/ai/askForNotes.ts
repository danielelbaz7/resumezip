// The browser's side of /api/review, which the review page and the editor ask for AI notes.

import { keptNotesOf } from "./answer"
import { pauseAi, resumeAi } from "./paused"
import { NO_CONNECTION, PROBLEMS, type Problem } from "./problems"
import { sentOf } from "./request"
import { REVIEWER_HEADER, reviewerId } from "./reviewer"
import { savedNotesOf, type SavedNote } from "./saved"
import type { Unit } from "./units"

/** Why there are no notes, worded for the person. */
export class AiReviewError extends Error {
  constructor(
    message: string,
    readonly reason: Problem = "other",
  ) {
    super(message)
  }
}

function reviewerHeader(): Record<string, string> {
  const reviewer = reviewerId()
  return reviewer ? { [REVIEWER_HEADER]: reviewer } : {}
}

export async function askForNotes(units: readonly Unit[], signal?: AbortSignal): Promise<SavedNote[]> {
  let response: Response
  try {
    response = await fetch("/api/review", {
      method: "POST",
      headers: { "content-type": "application/json", ...reviewerHeader() },
      body: JSON.stringify({ lines: sentOf(units) }),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new AiReviewError(NO_CONNECTION)
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
    throw new AiReviewError(PROBLEMS[reason], reason)
  }
  resumeAi()
  return savedNotesOf(body.notes)
}

/**
 * The AI's notes on `units`, as they're kept (keptNotesOf). It fails only with
 * an AiReviewError, logging first what wasn't expected; or, once `signal` is
 * aborted, with whatever stopped it.
 */
export async function askForKeptNotes(units: readonly Unit[], signal: AbortSignal): Promise<SavedNote[]> {
  try {
    return keptNotesOf(await askForNotes(units, signal), units)
  } catch (error) {
    if (signal.aborted || error instanceof AiReviewError) throw error
    console.error("Couldn't get AI notes:", error)
    throw new AiReviewError(PROBLEMS.other)
  }
}
