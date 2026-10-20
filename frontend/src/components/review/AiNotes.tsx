"use client"

import { Clock, RotateCcw } from "lucide-react"
import { Squares } from "@/components/site/Loader"
import type { Problem } from "@/lib/review/ai/askForNotes"
import type { Note } from "./PageMarks"

export type AiState = { step: "asking" } | { step: "done"; notes: Note[] } | { step: "problem"; reason: Problem; message: string }

// The problem's headline, its last words set in italic; the line under it, when the message would only repeat it.
// prettier-ignore
const PROBLEM_WORDS: Record<Problem, { lead: string; stress: string; body?: string }> = {
  limit: { lead: "Give it", stress: "a few minutes.", body: "You’ve asked for a lot of AI notes in a short time." },
  busy: { lead: "Give it", stress: "a minute.", body: "The AI is busy right now." },
  lines: { lead: "Too long for", stress: "AI notes." },
  off: { lead: "AI notes are", stress: "off here." },
  other: { lead: "AI notes", stress: "didn’t load." },
}

/** What the pill over the dock says when the AI notes couldn't be had. */
export const PILL_WORDS: Record<Problem, string> = {
  limit: "AI notes are paused for a few minutes",
  busy: "The AI is busy, so here are the ATS checks",
  lines: "This resume is too long for AI notes",
  off: "AI notes are off here",
  other: "AI notes didn’t load, so here are the ATS checks",
}

/** A short note in a dark pill, over the dock or under the drop zone, that the person can put away. */
export function Pill({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div role="status" className="review-pill">
      <Clock aria-hidden="true" />
      <span>{children}</span>
      <button type="button" onClick={onClose}>
        OK
      </button>
    </div>
  )
}

function Flags({
  title,
  empty,
  notes,
  open,
  onOpen,
  onPick,
}: {
  title: string
  empty: string
  notes: Note[]
  open: string | null
  onOpen: (key: string | null) => void
  onPick: (note: Note) => void
}) {
  return (
    <section>
      <h2 className="flex items-baseline gap-1.5 text-[13px] font-medium text-ink-2">
        {title} <span className="text-ink-3">{notes.length}</span>
      </h2>
      {notes.length === 0 ? (
        <p className="mt-1 text-ink-2">{empty}</p>
      ) : (
        <ul className="mt-1 flex flex-col">
          {notes.map((note) => (
            <li key={note.key}>
              <button
                type="button"
                className="review-flag"
                data-ink={note.ink}
                data-open={open === note.key ? "" : undefined}
                onMouseEnter={() => note.drawn && onOpen(note.key)}
                onMouseLeave={() => open === note.key && onOpen(null)}
                onClick={() => onPick(note)}
              >
                {note.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * The AI's notes, beside the page: its red flags and what's done well, each
 * pointing at its mark. They're asked for as soon as the resume is printed, and the page
 * opens with them; "asking" shows only when they were long coming, or asked again.
 */
export default function AiNotes({
  state,
  onAsk,
  open,
  onOpen,
  onPick,
}: {
  state: AiState
  onAsk: () => void
  open: string | null
  onOpen: (key: string | null) => void
  onPick: (note: Note) => void
}) {
  if (state.step === "done") {
    const red = state.notes.filter((note) => note.ink === "red")
    const good = state.notes.filter((note) => note.ink === "good")
    return (
      <div className="review-ai flex flex-col gap-3">
        <Flags title="Red flags" empty="None found. Nice." notes={red} open={open} onOpen={onOpen} onPick={onPick} />
        <Flags title="Done well" empty="None stood out." notes={good} open={open} onOpen={onOpen} onPick={onPick} />
      </div>
    )
  }
  if (state.step === "asking") {
    return (
      <div role="status" className="review-ai">
        <p className="flex items-center gap-2.5 font-medium text-ink">
          <Squares />
          Getting notes from AI
        </p>
        <p className="mt-0.5 text-ink-2">They’ll show here when they come.</p>
      </div>
    )
  }
  const words = PROBLEM_WORDS[state.reason]
  return (
    <div className="review-ai">
      <p className="label-mono text-ink-2">AI notes</p>
      <p className="mt-1.5 text-balance font-serif text-[28px] leading-[1.05] tracking-[-0.03em] text-ink">
        {words.lead} <em className="text-accent">{words.stress}</em>
      </p>
      <p className="mt-2 text-[13px] text-ink-2">{words.body ?? state.message}</p>
      {state.reason !== "lines" && state.reason !== "off" && (
        <button type="button" onClick={onAsk} className="review-try mt-3">
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Try again
        </button>
      )}
    </div>
  )
}
