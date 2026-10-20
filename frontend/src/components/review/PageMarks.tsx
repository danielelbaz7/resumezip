"use client"

import { useEffect, useId, useMemo } from "react"
import type { Box, Scribble } from "@/lib/review/marks"
import { bracket, circle, rectangle, strike, underline } from "./rough"

/** The pen a note is drawn in: the checker's three tiers, and the AI's red flags and what's done well. */
export type Ink = "fix" | "look" | "optional" | "red" | "good"

/** A note on the resume, the checker's or the AI's, and where it's drawn. */
export interface Note {
  key: string
  ink: Ink
  /** Above the title: "Must fix", "Red flag", "Done well". */
  label: string | null
  title: string
  body: string | null
  /** A rewrite to try, set apart under the body. */
  rewrite: string | null
  /** Where it is, as a list of the notes names it. */
  place: string
  /** Where it's drawn; null when it isn't on a line of its own. */
  drawn: { page: number; scribble: Scribble } | null
}

/** A drawn note, with what pointing at it covers: the scribble and what it's drawn round. */
export interface Placed {
  note: Note
  page: number
  scribble: Scribble
  area: Box
}

// How wide text is, to find a word on its printed line (wordBox). Measured in
// a serif, as most templates print in one; the line's own width scales it.
export function measurer(): (text: string) => number {
  const context = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d")
  if (!context) return (text) => text.length
  context.font = "100px Georgia, 'Times New Roman', serif"
  return (text) => context.measureText(text).width
}

function pathOf({ kind, boxes }: Scribble, seed: number): string {
  if (kind === "circle") return circle(boxes[0], seed, 2)
  if (kind === "box") return rectangle(boxes[0], seed)
  if (kind === "strike") return strike(boxes[0], seed)
  if (kind === "bracket") return bracket(boxes, seed)
  return boxes.map((box, line) => underline(box, seed + line, 0.5)).join(" ")
}

function areaOf({ kind, boxes }: Scribble): Box {
  const left = Math.min(...boxes.map((box) => box[0])) - (kind === "bracket" ? 9 : 4)
  return [
    left,
    Math.min(...boxes.map((box) => box[1])) - 3,
    Math.max(...boxes.map((box) => box[2])) + 4,
    Math.max(...boxes.map((box) => box[3])) + 3,
  ]
}

/** The notes that are drawn, in reading order, so the pen goes down the page and Tab follows it. */
export function usePlaced(notes: readonly Note[]): Placed[] {
  return useMemo(
    () =>
      notes
        .flatMap((note): Placed[] =>
          note.drawn ? [{ note, page: note.drawn.page, scribble: note.drawn.scribble, area: areaOf(note.drawn.scribble) }] : [],
        )
        .sort((a, b) => a.page - b.page || a.area[1] - b.area[1] || a.area[0] - b.area[0]),
    [notes],
  )
}

/** Esc puts away the note that's showing, wherever focus is. */
export function useEscapeCloses(open: string | null, onOpen: (key: string | null) => void) {
  useEffect(() => {
    if (open === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpen(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpen])
}

// The same wobble for a note on every render: its key, hashed.
const seedOf = (key: string) => [...key].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 7)

const percent = (part: number, whole: number) => `${(part / whole) * 100}%`

export const LABEL_INK: Record<Ink, string> = {
  fix: "text-alert",
  look: "text-accent",
  optional: "text-accent",
  red: "text-alert",
  good: "text-accent",
}

/** How a note's rewrite is set apart under it: a line down its left. */
export const REWRITE = "border-l-2 border-hairline pl-2 text-ink"

/** The note for the scribble that's pointed at: what's wrong or what works, and what to write instead. */
function Tip({ note, area, size, describe }: { note: Note; area: Box; size: PageSize; describe: string }) {
  const [left, top, right, bottom] = area
  // Below the scribble, unless that would hang off the page's foot.
  const below = bottom / size.height < 0.8
  return (
    <div
      role="tooltip"
      className="review-tip"
      style={{
        left: `clamp(124px, ${percent((left + right) / 2, size.width)}, calc(100% - 124px))`,
        ...(below
          ? { top: `calc(${percent(bottom, size.height)} + 6px)` }
          : { bottom: `calc(${percent(size.height - top, size.height)} + 6px)` }),
      }}
    >
      {note.label && <p className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${LABEL_INK[note.ink]}`}>{note.label}</p>}
      <p className="font-medium text-ink">{note.title}</p>
      {(note.body || note.rewrite) && (
        <div id={describe}>
          {note.body && <p className="mt-0.5 text-ink-2">{note.body}</p>}
          {note.rewrite && <p className={`mt-1.5 ${REWRITE}`}>{note.rewrite}</p>}
        </div>
      )}
    </div>
  )
}

/** A page's size, in PDF points, which the marks are measured in. */
export interface PageSize {
  width: number
  height: number
}

/**
 * One page's pen marks, laid over the page (in a `relative` box its size):
 * pointing at a mark, or tabbing to it, shows its note; choosing it calls
 * `onChoose`, or shows its note when there's nothing more to do.
 */
export function PageMarks({
  page,
  size,
  placed,
  open,
  onOpen,
  onChoose,
}: {
  /** From 1. */
  page: number
  size: PageSize
  /** Every page's drawn notes, in reading order (usePlaced): each is drawn in its turn. */
  placed: readonly Placed[]
  open: string | null
  onOpen: (key: string | null) => void
  onChoose?: (note: Note) => void
}) {
  const describe = useId()
  const here = placed.filter((scribble) => scribble.page === page)
  const showing = here.find(({ note }) => note.key === open)
  // The others fade behind the open note's mark, on any page; a note with no
  // mark (a row pointed at in the Check panel whose finding isn't drawn) fades nothing.
  const fading = open !== null && placed.some(({ note }) => note.key === open)
  const leave = (key: string) => {
    if (open === key) onOpen(null)
  }
  // The smallest on top, so a word's circle can be pointed at inside its line's underline.
  const area = ([left, top, right, bottom]: Box) => (right - left) * (bottom - top)
  const layer = new Map([...here].sort((a, b) => area(b.area) - area(a.area)).map(({ note }, index) => [note.key, index + 1]))
  return (
    <>
      <svg
        viewBox={`0 0 ${size.width} ${size.height}`}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      >
        {here.map(({ note, scribble }) => (
          <g
            key={note.key}
            className="review-scribble"
            data-ink={note.ink}
            data-scribble={note.key}
            data-quiet={fading && open !== note.key ? "" : undefined}
            style={{ "--delay": `${placed.findIndex((other) => other.note === note) * 90}ms` } as React.CSSProperties}
          >
            {/* Each pass on its own, so each draws from its start. */}
            {pathOf(scribble, seedOf(note.key))
              .split(/ (?=M)/)
              .map((d, pass) => (
                <path key={pass} d={d} pathLength={1} />
              ))}
          </g>
        ))}
      </svg>
      {here.map(({ note, area: [left, top, right, bottom] }) => (
        <button
          key={note.key}
          type="button"
          className="review-hit"
          data-note={note.key}
          aria-label={note.label ? `${note.label}: ${note.title}` : note.title}
          aria-describedby={open === note.key && (note.body || note.rewrite) ? describe : undefined}
          style={{
            left: percent(left, size.width),
            top: percent(top, size.height),
            width: percent(right - left, size.width),
            height: percent(bottom - top, size.height),
            zIndex: layer.get(note.key),
          }}
          onMouseEnter={() => onOpen(note.key)}
          onMouseLeave={() => leave(note.key)}
          onFocus={() => onOpen(note.key)}
          onBlur={() => leave(note.key)}
          onClick={() => (onChoose ? onChoose(note) : onOpen(note.key))}
        />
      ))}
      {showing && <Tip note={showing.note} area={showing.area} size={size} describe={describe} />}
    </>
  )
}
