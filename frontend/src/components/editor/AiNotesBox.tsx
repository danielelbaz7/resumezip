"use client"

import { useEffect, useId, useState } from "react"
import { Sparkles } from "lucide-react"
import { useOpenResume } from "@/context/ResumeContext"
import { describePlace } from "@/lib/check/labels"
import type { ResumeView } from "@/lib/check/resume"
import { findingOf, placeOfQuote } from "@/lib/review/ai/place"
import { savedForResume, type SavedNote } from "@/lib/review/ai/saved"
import { useCheckActions } from "./CheckContext"

// The line down a note's left side: the review page's red and green pens.
const TONE_LINE = {
  red: "shadow-[inset_3px_0_0_var(--review-red)]",
  green: "shadow-[inset_3px_0_0_var(--review-green)]",
} as const

function Note({ note, index, view }: { note: SavedNote; index: number; view: ResumeView }) {
  const { open } = useCheckActions()
  const place = placeOfQuote(view, note.quote)
  const body = (
    <>
      <span className="w-full truncate font-mono text-[11px] text-ink-2">
        {place ? describePlace(view, place) : "Changed since the review"}
      </span>
      <span className={`text-sm leading-snug ${place ? "text-ink" : "text-ink-2"}`}>{note.title}</span>
      <span className="text-[13px] leading-snug text-ink-2">{note.why}</span>
      {note.suggestion && (
        <span className="mt-0.5 border-l-2 border-hairline pl-2 text-[13px] leading-snug text-ink">{note.suggestion}</span>
      )}
    </>
  )
  return (
    <li className={`flex flex-col border-t border-rule ${TONE_LINE[note.tone]}`}>
      {place ? (
        <button
          type="button"
          onClick={() => open(findingOf(note, place, index))}
          className="flex flex-col items-start gap-1 px-3.5 py-2.5 text-left transition-colors hover:bg-ink/[0.02] focus-visible:outline-offset-[-2px]"
        >
          {body}
        </button>
      ) : (
        <div className="flex flex-col items-start gap-1 px-3.5 py-2.5">{body}</div>
      )}
    </li>
  )
}

/**
 * The AI's notes from the review page, for a resume opened from it: kept in
 * this browser, so they're shown again without asking the AI. Each opens the
 * field its words are in; one whose words have been rewritten says so.
 */
export default function AiNotesBox({ view }: { view: ResumeView }) {
  const { id } = useOpenResume()
  const heading = useId()
  // Read once the page is in the browser, where they're kept.
  const [notes, setNotes] = useState<SavedNote[] | null>(null)
  useEffect(() => setNotes(savedForResume(id)?.notes ?? null), [id])
  if (!notes || notes.length === 0) return null

  const tones = [
    { tone: "red", title: "Red flags" },
    { tone: "green", title: "Green flags" },
  ] as const
  return (
    <section aria-labelledby={heading} className="check-box glass flex flex-col overflow-hidden rounded-panel">
      <div className="flex items-start gap-2.5 px-3.5 pb-3 pt-3.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/[0.05] text-ink" aria-hidden="true">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <span className="flex flex-col gap-0.5">
          <h2 id={heading} className="text-sm font-medium leading-snug text-ink">
            AI notes
          </h2>
          <span className="text-[12px] leading-snug text-ink-2">From your review, read like a recruiter would.</span>
        </span>
      </div>
      {tones.map(({ tone, title }) => {
        const some = notes.map((note, index) => ({ note, index })).filter(({ note }) => note.tone === tone)
        if (some.length === 0) return null
        return (
          <section key={tone} aria-label={`${title}, ${some.length}`} className="flex flex-col">
            <h3 className="label-mono flex items-center gap-2 border-t border-rule px-3.5 pb-1.5 pt-3 text-ink-2">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: `var(--review-${tone})` }} />
              {title} · {some.length}
            </h3>
            <ul className="flex flex-col">
              {some.map(({ note, index }) => (
                <Note key={index} note={note} index={index} view={view} />
              ))}
            </ul>
          </section>
        )
      })}
    </section>
  )
}
