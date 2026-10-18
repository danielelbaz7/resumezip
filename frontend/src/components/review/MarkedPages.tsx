"use client"

import { useEffect, useId, useMemo, useState } from "react"
import type { Finding } from "@/lib/check/engine"
import { describePlace } from "@/lib/check/labels"
import type { ResumeView } from "@/lib/check/resume"
import { scribbleOf, type Box, type Mark, type Scribble } from "@/lib/review/marks"
import { bracket, circle, rectangle, strike, underline } from "./rough"

/** A finding, and where it's printed, if it's on a line of its own. */
export interface Note {
  finding: Finding
  mark: Mark | null
}

interface Drawn {
  url: string
  /** The page's size, in PDF points, which the marks are measured in. */
  width: number
  height: number
}

interface Placed {
  /** The note's index. */
  note: number
  page: number
  scribble: Scribble
  /** What hovering it covers: the scribble and what it's drawn round. */
  area: Box
}

// How wide each page is drawn, in pixels: about twice as wide as it's shown, for high-density screens.
const DRAWN_WIDTH = 1400

const isFix = (finding: Finding) => finding.level === "fix" && !finding.advisory

// How wide text is, to find a word on its printed line (wordBox). Measured in
// a serif, as most templates print in one; the line's own width scales it.
function measurer(): (text: string) => number {
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

const percent = (part: number, whole: number) => `${(part / whole) * 100}%`

/** The note for the scribble that's pointed at: what's wrong, and what to write instead. */
function Tip({ finding, area, page, describe }: { finding: Finding; area: Box; page: Drawn; describe: string }) {
  const [left, top, right, bottom] = area
  // Below the scribble, unless that would hang off the page's foot.
  const below = bottom / page.height < 0.8
  return (
    <div
      role="tooltip"
      className="review-tip"
      style={{
        left: `clamp(124px, ${percent((left + right) / 2, page.width)}, calc(100% - 124px))`,
        ...(below
          ? { top: `calc(${percent(bottom, page.height)} + 6px)` }
          : { bottom: `calc(${percent(page.height - top, page.height)} + 6px)` }),
      }}
    >
      {isFix(finding) && <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-alert">Must fix</p>}
      <p className="font-medium text-ink">{finding.message}</p>
      {finding.suggestion && (
        <p id={describe} className="mt-0.5 text-ink-2">
          {finding.suggestion}
        </p>
      )}
    </div>
  )
}

/**
 * The resume's pages as its template prints them, scribbled on in pen where
 * each note is, as crackedresume does. Pointing at a scribble, or tabbing to
 * it, shows its note; the notes that aren't on a line are listed below.
 */
export default function MarkedPages({ pdf, view, notes }: { pdf: Uint8Array; view: ResumeView; notes: readonly Note[] }) {
  const [pages, setPages] = useState<Drawn[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const describe = useId()

  // In reading order, so the pen goes down the page and Tab follows it.
  const placed = useMemo(() => {
    const measure = measurer()
    return notes
      .flatMap(({ finding, mark }, note): Placed[] => {
        if (!mark) return []
        const scribble = scribbleOf(finding, mark, measure)
        return [{ note, page: mark.page, scribble, area: areaOf(scribble) }]
      })
      .sort((a, b) => a.page - b.page || a.area[1] - b.area[1] || a.area[0] - b.area[0])
  }, [notes])
  const loose = notes.filter(({ mark }) => !mark).map(({ finding }) => finding)

  useEffect(() => {
    let live = true
    const urls: string[] = []
    void (async () => {
      const { loadPdfjs } = await import("@/lib/import/open")
      const { getDocument } = await loadPdfjs()
      // A copy, as pdf.js takes the bytes it's given over to its worker.
      const task = getDocument({ data: pdf.slice(), isEvalSupported: false })
      try {
        const doc = await task.promise
        const drawn: Drawn[] = []
        for (let number = 1; number <= doc.numPages && live; number++) {
          const page = await doc.getPage(number)
          const size = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: DRAWN_WIDTH / size.width })
          const canvas = document.createElement("canvas")
          canvas.width = Math.round(viewport.width)
          canvas.height = Math.round(viewport.height)
          const context = canvas.getContext("2d")
          if (!context) throw new Error("No canvas to draw on")
          await page.render({ canvasContext: context, viewport }).promise
          const picture = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9))
          if (!picture) throw new Error("The page couldn't be drawn")
          const url = URL.createObjectURL(picture)
          urls.push(url)
          // Drawn after the pages were let go of, as when the review was left: freed at once.
          if (!live) URL.revokeObjectURL(url)
          drawn.push({ url, width: size.width, height: size.height })
        }
        if (live) setPages(drawn)
      } finally {
        void task.destroy()
      }
    })().catch((error) => {
      if (live) console.warn("The review couldn't draw the resume:", error)
    })
    return () => {
      live = false
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [pdf])

  // Esc puts away the note that's showing, wherever focus is.
  useEffect(() => {
    if (open === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const leave = (note: number) => setOpen((current) => (current === note ? null : current))
  // The smallest on top, so a word's circle can be pointed at inside its line's underline.
  const size = ([left, top, right, bottom]: Box) => (right - left) * (bottom - top)
  const layer = new Map([...placed].sort((a, b) => size(b.area) - size(a.area)).map(({ note }, index) => [note, index + 1]))

  return (
    <div className="flex flex-col gap-3">
      {pages ? (
        pages.map((page, index) => {
          const here = placed.filter((scribble) => scribble.page === index + 1)
          const showing = here.find(({ note }) => note === open)
          return (
            <div key={page.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- a picture drawn in the browser, which next/image can't optimize */}
              <img
                src={page.url}
                alt={`Page ${index + 1} of your resume, with the notes marked`}
                className="block h-auto w-full rounded-[12px] bg-white shadow-[0_1px_2px_rgb(30_60_130/0.08)]"
              />
              <svg
                viewBox={`0 0 ${page.width} ${page.height}`}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
              >
                {here.map(({ note, scribble }) => (
                  <g
                    key={note}
                    className="review-scribble"
                    data-level={isFix(notes[note].finding) ? "fix" : "look"}
                    data-quiet={open !== null && open !== note ? "" : undefined}
                    style={{ "--delay": `${placed.findIndex((other) => other.note === note) * 90}ms` } as React.CSSProperties}
                  >
                    {/* Each pass on its own, so each draws from its start. */}
                    {pathOf(scribble, note * 31 + 7)
                      .split(/ (?=M)/)
                      .map((d, pass) => (
                        <path key={pass} d={d} pathLength={1} />
                      ))}
                  </g>
                ))}
              </svg>
              {here.map(({ note, area: [left, top, right, bottom] }) => {
                const { finding } = notes[note]
                return (
                  <button
                    key={note}
                    type="button"
                    className="review-hit"
                    aria-label={isFix(finding) ? `Must fix: ${finding.message}` : finding.message}
                    aria-describedby={open === note && finding.suggestion ? describe : undefined}
                    style={{
                      left: percent(left, page.width),
                      top: percent(top, page.height),
                      width: percent(right - left, page.width),
                      height: percent(bottom - top, page.height),
                      zIndex: layer.get(note),
                    }}
                    onMouseEnter={() => setOpen(note)}
                    onMouseLeave={() => leave(note)}
                    onFocus={() => setOpen(note)}
                    onBlur={() => leave(note)}
                    onClick={() => setOpen(note)}
                  />
                )
              })}
              {showing && <Tip finding={notes[showing.note].finding} area={showing.area} page={page} describe={describe} />}
            </div>
          )
        })
      ) : (
        <div aria-hidden="true" className="aspect-[8.5/11] w-full animate-pulse rounded-[12px] bg-white/70" />
      )}
      {loose.length > 0 && (
        <div className="rounded-[12px] bg-white/75 px-4 py-3">
          <p className="text-[13px] font-medium text-accent">About the whole resume</p>
          <ul className="mt-1.5 flex flex-col gap-1.5 text-[14px] leading-snug">
            {loose.map((finding) => (
              <li key={finding.key}>
                {isFix(finding) && <span className="font-medium text-alert">Must fix: </span>}
                <span className="font-medium text-ink">{finding.message}</span>
                <span className="text-ink-3"> · {describePlace(view, finding.place)}</span>
                {finding.suggestion && <span className="block text-ink-2">{finding.suggestion}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
