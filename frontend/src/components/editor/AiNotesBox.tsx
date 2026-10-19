"use client"

import { useId } from "react"
import { RotateCcw, Sparkles } from "lucide-react"
import { describePlace } from "@/lib/check/labels"
import type { ResumeView } from "@/lib/check/resume"
import { findingOf, placeOfQuote } from "@/lib/review/ai/place"
import type { SavedNote } from "@/lib/review/ai/saved"
import { useCheckActions } from "./CheckContext"
import { aiKeyOf, useMarks, usePointAt } from "./MarksContext"

// The line down a note's left side: the review page's red and green pens.
const TONE_LINE = {
  red: "shadow-[inset_3px_0_0_var(--review-red)]",
  green: "shadow-[inset_3px_0_0_var(--review-green)]",
} as const

const button =
  "inline-flex h-9 items-center justify-center gap-2 rounded-full bg-ink px-4 text-[13px] font-medium text-white transition-colors hover:bg-ink/85 disabled:opacity-60"

function Note({ note, index, view }: { note: SavedNote; index: number; view: ResumeView }) {
  const { open } = useCheckActions()
  const point = usePointAt(aiKeyOf(index))
  const place = placeOfQuote(view, note.quote)
  const body = (
    <>
      <span className="w-full truncate font-mono text-[11px] text-ink-2">
        {place ? describePlace(view, place) : "Changed since the notes"}
      </span>
      <span className={`text-sm leading-snug ${place ? "text-ink" : "text-ink-2"}`}>{note.title}</span>
      <span className="text-[13px] leading-snug text-ink-2">{note.why}</span>
      {note.suggestion && (
        <span className="mt-0.5 border-l-2 border-hairline pl-2 text-[13px] leading-snug text-ink">{note.suggestion}</span>
      )}
    </>
  )
  return (
    <li className={`flex flex-col border-t border-rule ${TONE_LINE[note.tone]}`} {...(place ? point : {})}>
      {place ? (
        <button
          type="button"
          onClick={() => open(findingOf(note, place, index))}
          onFocus={point.onMouseEnter}
          onBlur={point.onMouseLeave}
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

const PRIVACY = "This sends your resume’s text to GPT-5.4 mini, run by Microsoft Azure or OpenAI. resumezip doesn’t keep it."

/**
 * The AI's notes in the Check panel: the ones from the review, or asked for
 * here, kept in this browser so they're shown again without asking. Each
 * opens the field its words are in, and pointing at it shows its mark on the
 * preview; one whose words have been rewritten says so.
 */
export default function AiNotesBox({ view }: { view: ResumeView }) {
  const { aiNotes, ai, canAsk, askAi } = useMarks()
  const heading = useId()
  const asking = ai.step === "asking"
  const problem = ai.step === "problem" && (
    <p role="alert" className="text-[13px] leading-snug text-alert">
      {ai.message}
    </p>
  )

  if (!aiNotes || aiNotes.length === 0) {
    return (
      <section aria-labelledby={heading} className="check-box glass flex flex-col gap-2.5 rounded-panel px-3.5 py-3.5">
        <h2 id={heading} className="flex items-center gap-2 text-sm font-medium text-ink">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          AI notes
        </h2>
        <p className="text-[13px] leading-snug text-ink-2">
          An AI reads it like a recruiter and marks red flags and green flags on the page.
        </p>
        {problem}
        <button type="button" onClick={askAi} disabled={!canAsk || asking} className={`${button} self-start`}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {asking ? "Reading it like a recruiter…" : ai.step === "problem" ? "Try again" : "Get AI notes"}
        </button>
        {!canAsk && <p className="text-[12px] leading-snug text-ink-3">Waiting for the preview…</p>}
        <p className="text-[12px] leading-snug text-ink-3">{PRIVACY}</p>
      </section>
    )
  }

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
          <span className="text-[12px] leading-snug text-ink-2">Read like a recruiter would. Point at one to see it on the page.</span>
        </span>
      </div>
      {tones.map(({ tone, title }) => {
        const some = aiNotes.map((note, index) => ({ note, index })).filter(({ note }) => note.tone === tone)
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
      <div className="flex flex-col gap-2 border-t border-rule px-3.5 py-3">
        {problem}
        {/* The notes are of the resume as it was: for what's been rewritten since, the AI can be asked again. */}
        <button
          type="button"
          onClick={askAi}
          disabled={!canAsk || asking}
          className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-accent hover:underline disabled:opacity-60"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {asking ? "Reading it like a recruiter…" : "Get new notes for this version"}
        </button>
      </div>
    </section>
  )
}
