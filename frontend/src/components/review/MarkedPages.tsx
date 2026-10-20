"use client"

import { useLayoutEffect, useRef } from "react"
import type { DrawnPage } from "./drawPages"
import { LABEL_INK, PageMarks, useEscapeCloses, usePlaced, type Note } from "./PageMarks"

/** Where the first page was on the screen before the result, as the page being read: it flies from there into place. */
export interface Flight {
  left: number
  top: number
  width: number
  /** Its corners' radius there, in pixels. */
  radius: number
}

// As long as the marks wait to be drawn (--review-marks-wait on the board, in review.css).
const FLIGHT_MS = 900

/**
 * The resume's pages as its template prints them, scribbled on in pen where
 * each note is, as crackedresume does. Pointing at a scribble, or tabbing to
 * it, shows its note; the notes that aren't on a line are listed below, and
 * so is every note on a page that couldn't be drawn (all of them, with `pages` null).
 */
export default function MarkedPages({
  pages,
  drawing,
  notes,
  open,
  onOpen,
  from,
}: {
  pages: readonly DrawnPage[] | null
  /** Later pages are still being drawn: their notes wait for them, rather than being listed. */
  drawing: boolean
  notes: readonly Note[]
  /** The key of the note that's showing. */
  open: string | null
  onOpen: (key: string | null) => void
  from: Flight | null
}) {
  const placed = usePlaced(notes)
  const first = useRef<HTMLDivElement>(null)
  // Listed under the page: the notes that aren't on a line, and those on a page there's no picture of.
  const unshown = (note: Note) => !pages || (!drawing && note.drawn !== null && note.drawn.page > pages.length)
  const loose = notes.filter((note) => !note.drawn || unshown(note))

  useEscapeCloses(open, onOpen)

  // The first page flies from the page that was being read to its place here, losing the fog it stood in.
  // Before the first paint, so it's never seen in its place first; only once, as the result opens.
  const flight = useRef(from)
  useLayoutEffect(() => {
    const page = first.current
    const start = flight.current
    if (!page || !start || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const end = page.getBoundingClientRect()
    const scale = start.width / end.width
    const fog = "linear-gradient(180deg, #000 30%, transparent 64%)"
    page.style.setProperty("mask-image", fog)
    page.style.setProperty("-webkit-mask-image", fog)
    const animation = page.animate(
      [
        {
          transformOrigin: "0 0",
          transform: `translate(${start.left - end.left}px, ${start.top - end.top}px) scale(${scale})`,
          clipPath: `inset(0 round ${start.radius / scale}px)`,
          maskSize: "100% 100%",
          webkitMaskSize: "100% 100%",
        },
        // Stretched until its fade is below the page's foot, so the page is whole by the time it lands.
        { transformOrigin: "0 0", transform: "none", clipPath: "inset(0 round 12px)", maskSize: "100% 500%", webkitMaskSize: "100% 500%" },
      ],
      { duration: FLIGHT_MS, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    )
    const land = () => {
      page.style.removeProperty("mask-image")
      page.style.removeProperty("-webkit-mask-image")
    }
    animation.onfinish = land
    animation.oncancel = land
    return () => animation.cancel()
  }, [])

  return (
    <div className="flex flex-col gap-3">
      {pages?.map((page, index) => (
        <div key={page.url} ref={index === 0 ? first : undefined} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- a picture drawn in the browser, which next/image can't optimize */}
          <img
            src={page.url}
            alt={`Page ${index + 1} of your resume, with the notes marked`}
            className="block h-auto w-full rounded-[12px] bg-white shadow-[0_1px_2px_rgb(30_60_130/0.08)]"
          />
          <PageMarks page={index + 1} size={page} placed={placed} open={open} onOpen={onOpen} />
        </div>
      ))}
      {loose.length > 0 && (
        <div className="rounded-[12px] bg-white/75 px-4 py-3">
          <p className="text-[13px] font-medium text-accent">{loose.some(unshown) ? "Notes on your resume" : "About the whole resume"}</p>
          <ul className="mt-1.5 flex flex-col gap-1.5 text-[14px] leading-snug">
            {loose.map((note) => (
              <li key={note.key}>
                {note.label && <span className={`font-medium ${LABEL_INK[note.ink]}`}>{note.label}: </span>}
                <span className="font-medium text-ink">{note.title}</span>
                <span className="text-ink-3"> · {note.place}</span>
                {note.body && <span className="block text-ink-2">{note.body}</span>}
                {note.rewrite && <span className="mt-0.5 block border-l-2 border-hairline pl-2 text-ink">{note.rewrite}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
