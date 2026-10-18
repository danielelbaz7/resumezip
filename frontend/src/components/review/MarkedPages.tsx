"use client"

import { useEffect, useState } from "react"
import type { Level } from "@/lib/check/settings"
import type { Mark } from "@/lib/review/marks"
import { underline } from "./rough"

/** A note's mark, with its number in the list and how sure the checker is. */
export interface NumberedMark {
  number: number
  level: Level
  mark: Mark
}

interface Drawn {
  url: string
  /** The page's size, in PDF points, which the marks are measured in. */
  width: number
  height: number
}

// How wide each page is drawn, in pixels: about twice as wide as it's shown, for high-density screens.
const DRAWN_WIDTH = 1100

const INK: Record<Level, string> = { fix: "#b42318", look: "#2e5be6" }

// The numbers in the margin, one badge for each line a note starts on, with
// every note that starts there ("1, 4"): two notes on one bullet would
// otherwise hide one number under the other. Red if any of them is a must-fix.
function badges(marks: readonly NumberedMark[]) {
  // A line's box is the same object for every note on it, so it's the key.
  const starts = new Map<Mark["boxes"][number], NumberedMark[]>()
  for (const mark of marks) starts.set(mark.mark.boxes[0], [...(starts.get(mark.mark.boxes[0]) ?? []), mark])
  return [...starts].map(([[left, top, , bottom], here]) => {
    const label = here.map(({ number }) => number).join(", ")
    const width = 13 + (label.length - 1) * 4.4
    const right = left - 4.5
    const middle = (top + bottom) / 2
    return (
      <g key={label}>
        <rect
          x={right - width}
          y={middle - 6.5}
          width={width}
          height={13}
          rx={6.5}
          fill={INK[here.some(({ level }) => level === "fix") ? "fix" : "look"]}
        />
        <text
          x={right - width / 2}
          y={middle}
          dy="0.35em"
          textAnchor="middle"
          fill="#fff"
          style={{ fontFamily: "var(--font-sans)", fontSize: 8, fontWeight: 600 }}
        >
          {label}
        </text>
      </g>
    )
  })
}

/**
 * The resume's pages as its template prints them, with each note marked in
 * pen: its lines underlined, and its number in the margin beside where it starts.
 */
export default function MarkedPages({ pdf, marks }: { pdf: Uint8Array; marks: readonly NumberedMark[] }) {
  const [pages, setPages] = useState<Drawn[] | null>(null)

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
      // The notes are listed beside it either way.
      if (live) console.warn("The review couldn't draw the resume:", error)
    })
    return () => {
      live = false
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [pdf])

  if (!pages) return <div aria-hidden="true" className="aspect-[8.5/11] w-full animate-pulse rounded-[20px] bg-fill" />

  return (
    <div className="flex flex-col gap-5">
      {pages.map((page, index) => (
        <div
          key={page.url}
          className="relative overflow-hidden rounded-[20px] bg-white shadow-[0_0_0_1px_#eceef2,0_18px_40px_-24px_rgb(30_60_130/0.35)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a picture drawn in the browser, which next/image can't optimize */}
          <img src={page.url} alt={`Page ${index + 1} of your resume, with the notes marked`} className="block h-auto w-full" />
          <svg viewBox={`0 0 ${page.width} ${page.height}`} aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
            {marks
              .filter(({ mark }) => mark.page === index + 1)
              .flatMap(({ number, level, mark }) =>
                mark.boxes.map((box, line) => (
                  <path
                    key={`${number}.${line}`}
                    d={underline(box, number * 31 + line, 0.5)}
                    fill="none"
                    stroke={INK[level]}
                    strokeWidth={1.1}
                    strokeLinecap="round"
                    opacity={0.85}
                  />
                )),
              )}
            {badges(marks.filter(({ mark }) => mark.page === index + 1))}
          </svg>
        </div>
      ))}
    </div>
  )
}
