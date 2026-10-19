// The review page's side of /api/review.

import { notesOf, type AiNote } from "./answer"
import { sentOf } from "./request"
import type { Unit } from "./units"

export interface AiReview {
  notes: AiNote[]
  /** The model that wrote them, as the page credits it. */
  model: string
}

/** Why there are no notes, worded for the person. */
export class AiReviewError extends Error {}

const PROBLEMS: Record<string, string> = {
  limit: "You’ve asked for a lot of AI notes in a short time. Try again in a few minutes.",
  busy: "The AI is busy right now. Try again in a minute.",
  off: "AI notes aren’t switched on here.",
  lines: "This resume is too long for AI notes.",
}

export async function askForNotes(units: readonly Unit[], signal?: AbortSignal): Promise<AiReview> {
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
  const body = (await response.json().catch(() => null)) as { notes?: unknown; model?: unknown; error?: unknown } | null
  if (!response.ok || !body) {
    const problem = typeof body?.error === "string" ? PROBLEMS[body.error] : undefined
    throw new AiReviewError(problem ?? "Something went wrong getting AI notes. Try again in a minute.")
  }
  return { notes: notesOf(body, units), model: typeof body.model === "string" ? body.model : "AI" }
}
