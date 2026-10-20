"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { keptNotesOf } from "@/lib/review/ai/answer"
import type { Problem } from "@/lib/review/ai/askForNotes"
import { aiPaused } from "@/lib/review/ai/paused"
import { sentOf } from "@/lib/review/ai/request"
import { hashOf, saveNotes, savedByHash, type SavedNote } from "@/lib/review/ai/saved"
import type { Unit } from "@/lib/review/ai/units"

/** The AI's notes on a review, as they come: asked for, back, or a reason there are none. */
export type AiAnswer = { step: "asking" } | { step: "done"; notes: SavedNote[] } | { step: "problem"; reason: Problem; message: string }

export interface AiSide {
  /** The lines asked about, which the notes point at; null when there are none to ask about. */
  units: Unit[] | null
  /** The lines' hash, which the notes are kept by in this browser; null until it's worked out, or if it can't be. */
  hash: string | null
  /** Null when the AI isn't asked. */
  answer: AiAnswer | null
  /** Asks about `units` (or finds the notes kept from before), settling once there's an answer or a reason there isn't. */
  start: (units: Unit[] | null) => Promise<void>
  /** Asks again, as Try again does. */
  retry: () => void
  /** Stops asking: the review it was for was left. */
  stop: () => void
}

/**
 * The AI's side of a review. The review page asks as soon as the resume is
 * printed, while its spelling is still being checked, and shows the result
 * once the notes are back; the result can ask again.
 */
export function useAiNotes(): AiSide {
  const [units, setUnits] = useState<Unit[] | null>(null)
  const [hash, setHash] = useState<string | null>(null)
  const [answer, setAnswer] = useState<AiAnswer | null>(null)
  const asking = useRef<AbortController | null>(null)
  const asked = useRef<{ units: Unit[]; hash: string | null } | null>(null)

  const request = useCallback(async (units: Unit[], hashed: string | null, current: AbortController) => {
    setAnswer({ step: "asking" })
    try {
      const { askForNotes, AiReviewError } = await import("@/lib/review/ai/askForNotes")
      try {
        const notes = keptNotesOf(await askForNotes(units, current.signal), units)
        if (asking.current !== current) return
        if (hashed) saveNotes(hashed, notes)
        setAnswer({ step: "done", notes })
      } catch (error) {
        if (current.signal.aborted) return
        if (!(error instanceof AiReviewError)) console.error("Couldn't get AI notes:", error)
        setAnswer(
          error instanceof AiReviewError
            ? { step: "problem", reason: error.reason, message: error.message }
            : { step: "problem", reason: "other", message: "Something went wrong getting AI notes. Try again in a minute." },
        )
      }
    } catch {
      if (!current.signal.aborted)
        setAnswer({ step: "problem", reason: "other", message: "The AI notes couldn’t load. Check your connection and try again." })
    }
  }, [])

  const begin = useCallback(() => {
    asking.current?.abort()
    const current = new AbortController()
    asking.current = current
    return current
  }, [])

  const start = useCallback(
    async (units: Unit[] | null) => {
      const current = begin()
      asked.current = null
      setUnits(units)
      setHash(null)
      setAnswer(units ? { step: "asking" } : null)
      if (!units) return
      // Without a hash (no crypto.subtle, on a page that isn't served securely) the notes are still asked for, just not kept.
      const hashed = await hashOf(sentOf(units)).catch(() => null)
      if (asking.current !== current) return
      asked.current = { units, hash: hashed }
      setHash(hashed)
      // A resume reviewed in this browser before shows the notes it got then, without asking again.
      const saved = hashed ? savedByHash(hashed) : null
      if (saved) setAnswer({ step: "done", notes: saved.notes })
      // Unless it turned this tab away moments ago: asking again would only be turned away.
      else if (aiPaused())
        setAnswer({
          step: "problem",
          reason: "limit",
          message: "You’ve asked for a lot of AI notes in a short time. Try again in a few minutes.",
        })
      else await request(units, hashed, current)
    },
    [begin, request],
  )

  const retry = useCallback(() => {
    if (asked.current) void request(asked.current.units, asked.current.hash, begin())
  }, [begin, request])

  const stop = useCallback(() => {
    asking.current?.abort()
    asking.current = null
  }, [])

  // Leaving the page stops the AI on its way, and anything still to come of it.
  useEffect(() => stop, [stop])

  return { units, hash, answer, start, retry, stop }
}
