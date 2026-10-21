"use client"

import { useLayoutEffect, useRef } from "react"
import { reducedMotion } from "@/components/editor/layout"
import type { DrawnPage } from "./drawPages"
import { LABEL_INK, PageMarks, REWRITE, useEscapeCloses, usePlaced, type Note } from "./PageMarks"

/** Where the first page was on the screen before the result, as the page being read: it flies from there into place. */
export interface Flight {
  left: number
  top: number
  width: number
  /** Its corners' radius there, in pixels. */
  radius: number
}

// How long the first page takes to fly into place. The marks wait a little less (--review-marks-wait on
// the board, in review.css), as the flight eases out: by then the page has all but landed.
const FLIGHT_MS = 900

/**
 * The resume's pages, the PDF as it came or as its template prints it,
 * scribbled on in pen where each note is, as crackedresume does. Pointing at
 * a scribble, or tabbing to it, shows its note; the notes that aren't on a
 * line are listed below, and so is every note on a page that couldn't be
 * drawn (all of them, with `pages` null).
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
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const page = first.current
    const start = flight.current
    const scroller = box.current
    if (!page || !start || !scroller || reducedMotion()) return
    // The pages' box scrolls, which would clip the page flying in from above it.
    scroller.dataset.flying = ""
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
      delete scroller.dataset.flying
      page.style.removeProperty("mask-image")
      page.style.removeProperty("-webkit-mask-image")
    }
    animation.onfinish = land
    animation.oncancel = land
    // Should neither come (a tab in the background may hold its animations), the box clips and scrolls again all the same.
    const backstop = setTimeout(land, FLIGHT_MS + 500)
    return () => {
      clearTimeout(backstop)
      animation.cancel()
    }
  }, [])

  return (
    // Its own scroll box, one page tall, so a long resume doesn't run the page on and on.
    // Focusable, so it scrolls from the keyboard too.
    <div
      ref={box}
      role="region"
      aria-label="Your resume"
      tabIndex={0}
      className="review-pages"
      style={pages?.[0] ? ({ "--page-ratio": pages[0].height / pages[0].width } as React.CSSProperties) : undefined}
    >
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
                {note.rewrite && <span className={`mt-0.5 block ${REWRITE}`}>{note.rewrite}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
