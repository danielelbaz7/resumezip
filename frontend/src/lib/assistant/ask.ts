// The browser's side of /api/assist.

import { REVIEWER_HEADER, reviewerId } from "@/lib/review/ai/reviewer"
import type { AssistRequest } from "./request"

export interface Answer {
  reply: string
  /** The changes, unchecked: applyActions checks them. */
  actions: unknown[]
}

const PROBLEMS: Record<string, string> = {
  limit: "You’ve sent the AI a lot in a short time. Try again in a few minutes.",
  busy: "The AI is busy right now. Try again in a minute.",
  off: "The AI assistant isn’t switched on here.",
  lines: "This resume, or the conversation, is too long to send. Start a new conversation and try again.",
  other: "Something went wrong asking the AI. Try again in a minute.",
}

/** Why there's no answer, worded for the person. */
export class AssistError extends Error {}

export async function askAssistant(request: AssistRequest, signal?: AbortSignal): Promise<Answer> {
  const reviewer = reviewerId()
  let response: Response
  try {
    response = await fetch("/api/assist", {
      method: "POST",
      headers: { "content-type": "application/json", ...(reviewer && { [REVIEWER_HEADER]: reviewer }) },
      body: JSON.stringify(request),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new AssistError("The AI couldn’t be reached. Check your connection and try again.")
  }
  const body = (await response.json().catch(() => null)) as { reply?: unknown; actions?: unknown; error?: unknown } | null
  if (response.ok && typeof body?.reply === "string" && Array.isArray(body.actions)) return { reply: body.reply, actions: body.actions }
  // The firewall's rate limit turns a request away before the route runs, so its 429 has no { error }.
  const reason =
    response.status === 429 ? "limit" : typeof body?.error === "string" && Object.hasOwn(PROBLEMS, body.error) ? body.error : "other"
  throw new AssistError(PROBLEMS[reason])
}
