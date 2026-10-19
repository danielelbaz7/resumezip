"use client"

import { RotateCcw, Sparkles } from "lucide-react"
import type { Note } from "./MarkedPages"

export type AiState =
  { step: "idle" } | { step: "asking" } | { step: "done"; notes: Note[]; model: string } | { step: "problem"; message: string }

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
 * The AI's notes, beside the page: asked for with a button, as they send the
 * resume's text away, then its red and green flags, each pointing at its mark.
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
    const green = state.notes.filter((note) => note.ink === "green")
    return (
      <div className="review-ai flex flex-col gap-3">
        <Flags title="Red flags" empty="None found. Nice." notes={red} open={open} onOpen={onOpen} onPick={onPick} />
        <Flags title="Green flags" empty="None stood out." notes={green} open={open} onOpen={onOpen} onPick={onPick} />
        <p className="text-[12px] text-ink-3">Written by {state.model}. It can be wrong, so check each note against what you did.</p>
      </div>
    )
  }
  if (state.step === "asking") {
    return (
      <div role="status" className="review-ai">
        <p className="flex items-center gap-2 font-medium text-ink">
          <Sparkles aria-hidden="true" className="h-4 w-4 animate-pulse text-accent" />
          Reading it like a recruiter…
        </p>
        <p className="mt-0.5 text-ink-2">This takes about 10 seconds.</p>
      </div>
    )
  }
  return (
    <div className="review-ai">
      <p className="font-medium text-ink">Want a second opinion?</p>
      <p className="mt-0.5 text-ink-2">An AI reads it like a recruiter and marks red flags and green flags on the page.</p>
      {state.step === "problem" && (
        <p role="alert" className="mt-2 text-alert">
          {state.message}
        </p>
      )}
      <button type="button" onClick={onAsk} className="review-dock-main mt-3 w-full justify-center bg-ink text-white">
        {state.step === "problem" ? (
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
        ) : (
          <Sparkles aria-hidden="true" className="h-4 w-4" />
        )}
        {state.step === "problem" ? "Try again" : "Get AI notes"}
      </button>
      <p className="mt-2 text-[12px] text-ink-3">
        This sends your resume’s text to GPT-5 mini, run by Microsoft Azure or OpenAI. resumezip doesn’t keep it.
      </p>
    </div>
  )
}
