"use client"

import { useId, useState } from "react"
import { RotateCcw } from "lucide-react"
import type { Place } from "@/lib/check/places"
import { findingOf } from "@/lib/review/ai/place"
import type { SavedNote } from "@/lib/review/ai/saved"
import { aiKeyOf, TONE_NAMES } from "@/components/review/notes"
import { REWRITE } from "@/components/review/PageMarks"
import { STORM, SUN, type Picture } from "@/components/review/weather/pictures"
import TextPicture from "@/components/review/weather/TextPicture"
import { useCheckActions } from "./CheckContext"
import { useMarks, usePointAt } from "./MarksContext"

type Tone = SavedNote["tone"]

// A note's dot, the colors of the review page's pens: red for a red flag and blue for done well.
const TONE_DOT: Record<Tone, string> = { red: "var(--review-red)", green: "var(--color-accent)" }
// The review page's pictures for each kind: a storm over the red flags, the sun over what's done well.
const TONE_PICTURE: Record<Tone, Picture> = { red: STORM, green: SUN }
const TONES = ["red", "green"] as const

const button =
  "inline-flex h-9 items-center justify-center gap-2 rounded-full bg-ink px-4 text-[13px] font-medium text-white transition-colors hover:bg-ink/85 disabled:opacity-60"

function Dot({ tone }: { tone: Tone }) {
  return <span aria-hidden="true" className="block h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: TONE_DOT[tone] }} />
}

/** How many notes there are of one kind, under its picture. */
function Tally({ tone, count }: { tone: Tone; count: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 py-3.5 first:border-r first:border-rule first:pr-3 last:pl-3">
      <TextPicture picture={TONE_PICTURE[tone]} className="ai-tally-picture" />
      <p className="flex items-baseline gap-2">
        <span className="font-serif text-[36px] leading-[0.9] tracking-[-0.04em] text-ink">{count}</span>
        <span className="label-mono flex items-center gap-1.5 whitespace-nowrap text-ink">
          <Dot tone={tone} />
          {TONE_NAMES[tone].many}
        </span>
      </p>
    </div>
  )
}

function Note({
  note,
  index,
  place,
  opened,
  onOpen,
}: {
  note: SavedNote
  index: number
  place: Place | null
  opened: boolean
  onOpen: () => void
}) {
  const { open } = useCheckActions()
  const point = usePointAt(aiKeyOf(index))
  const details = useId()
  return (
    <li className="flex flex-col border-t border-rule first:border-t-0" {...(place ? point : {})}>
      <button
        type="button"
        aria-expanded={opened}
        aria-controls={opened ? details : undefined}
        onClick={() => {
          onOpen()
          if (place) open(findingOf(note, place, index))
        }}
        onFocus={place ? point.onMouseEnter : undefined}
        onBlur={place ? point.onMouseLeave : undefined}
        className="flex items-start gap-2.5 px-0.5 py-3 text-left transition-colors hover:bg-ink/[0.02] focus-visible:outline-offset-[-2px]"
      >
        <span className="mt-[7px]">
          <Dot tone={note.tone} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={`text-sm leading-snug ${place ? "text-ink" : "text-ink-2"}`}>{note.title}</span>
          {/* One that was never on a line (text: null) hasn't changed: it's about the whole resume. */}
          {!place && (
            <span className="text-[12px] leading-snug text-ink-3">{note.text === null ? "On your resume" : "Changed since the notes"}</span>
          )}
        </span>
      </button>
      {opened && (
        <div id={details} className="flex flex-col gap-2.5 pb-3.5 pl-[19px] pr-0.5">
          <p className="text-[13px] leading-snug text-ink-2">{note.why}</p>
          {note.suggestion && <p className={`${REWRITE} text-[13px] leading-snug`}>{note.suggestion}</p>}
        </div>
      )}
    </li>
  )
}

/**
 * The AI's notes in the Check panel: the ones from the review, or asked for
 * here, kept in this browser so they're shown again without asking. A count
 * of each kind under its picture, then the notes, red flags first, one open
 * at a time to say why and what to write instead. Choosing one opens the
 * field its words are in, and pointing at it shows its mark on the preview.
 */
export default function AiNotesBox() {
  const { aiNotes, aiPlaces, ai, canAsk, askAi } = useMarks()
  const heading = useId()
  const [chosen, setChosen] = useState<number | null>(null)
  const asking = ai.step === "asking"
  const problem = ai.step === "problem" && (
    <p role="alert" className="text-[13px] leading-snug text-alert">
      {ai.message}
    </p>
  )

  if (!aiNotes || aiNotes.length === 0) {
    return (
      <section aria-labelledby={heading} className="check-box glass flex flex-col gap-2.5 rounded-panel px-3.5 py-3.5">
        <h2 id={heading} className="text-sm font-medium text-ink">
          AI notes
        </h2>
        <p className="text-[13px] leading-snug text-ink-2">
          An AI reads it like a recruiter and marks red flags and what’s done well on the page.
        </p>
        {problem}
        <button type="button" onClick={askAi} disabled={!canAsk || asking} className={`${button} self-start`}>
          {asking ? "Reading it like a recruiter…" : ai.step === "problem" ? "Try again" : "Get AI notes"}
        </button>
        {!canAsk && <p className="text-[12px] leading-snug text-ink-3">Waiting for the preview…</p>}
      </section>
    )
  }

  const byTone = TONES.map((tone) => ({
    tone,
    notes: aiNotes.map((note, index) => ({ note, index })).filter(({ note }) => note.tone === tone),
  }))
  // The first listed is open until another is chosen: the top red flag, or what's done well if nothing was flagged.
  const listed = byTone.flatMap(({ notes }) => notes.map(({ index }) => index))
  const opened = chosen !== null && listed.includes(chosen) ? chosen : listed[0]

  return (
    <section aria-labelledby={heading} className="flex flex-col">
      {/* The switch above says "AI notes"; the heading names the region for a screen reader. */}
      <h2 id={heading} className="sr-only">
        AI notes
      </h2>
      <div className="grid grid-cols-2 border-y border-b-rule border-t-ink">
        {byTone.map(({ tone, notes }) => (
          <Tally key={tone} tone={tone} count={notes.length} />
        ))}
      </div>
      {byTone.map(({ tone, notes }) =>
        notes.length === 0 ? null : (
          <section key={tone} aria-label={`${TONE_NAMES[tone].many}, ${notes.length}`} className="border-b border-rule">
            <ul className="flex flex-col">
              {notes.map(({ note, index }) => (
                <Note
                  key={index}
                  note={note}
                  index={index}
                  place={aiPlaces[index] ?? null}
                  opened={index === opened}
                  onOpen={() => setChosen(index)}
                />
              ))}
            </ul>
          </section>
        ),
      )}
      <div className="flex flex-col gap-2 py-3.5">
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
