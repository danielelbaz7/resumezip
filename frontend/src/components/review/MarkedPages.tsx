"use client"

import { useEffect, useState } from "react"
import { LABEL_INK, PageMarks, useEscapeCloses, usePlaced, type Note } from "./PageMarks"

interface Drawn {
  url: string
  /** The page's size, in PDF points, which the marks are measured in. */
  width: number
  height: number
}

// How wide each page is drawn, in pixels: about twice as wide as it's shown, for high-density screens.
const DRAWN_WIDTH = 1400

/**
 * The resume's pages as its template prints them, scribbled on in pen where
 * each note is, as crackedresume does. Pointing at a scribble, or tabbing to
 * it, shows its note; the notes that aren't on a line are listed below, and
 * every note is, if the pages can't be drawn.
 */
export default function MarkedPages({
  pdf,
  notes,
  open,
  onOpen,
}: {
  pdf: Uint8Array
  notes: readonly Note[]
  /** The key of the note that's showing. */
  open: string | null
  onOpen: (key: string | null) => void
}) {
  const [pages, setPages] = useState<Drawn[] | null>(null)
  // The pages couldn't be drawn, so nothing can be scribbled on them.
  const [failed, setFailed] = useState(false)
  const placed = usePlaced(notes)
  // Listed under the page: the notes that aren't on a line, or every note when there's no page to scribble on.
  const loose = notes.filter(({ drawn }) => failed || !drawn)

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
      if (!live) return
      console.warn("The review couldn't draw the resume:", error)
      setFailed(true)
    })
    return () => {
      live = false
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [pdf])

  useEscapeCloses(open, onOpen)

  return (
    <div className="flex flex-col gap-3">
      {pages ? (
        pages.map((page, index) => (
          <div key={page.url} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- a picture drawn in the browser, which next/image can't optimize */}
            <img
              src={page.url}
              alt={`Page ${index + 1} of your resume, with the notes marked`}
              className="block h-auto w-full rounded-[12px] bg-white shadow-[0_1px_2px_rgb(30_60_130/0.08)]"
            />
            <PageMarks page={index + 1} size={page} placed={placed} open={open} onOpen={onOpen} />
          </div>
        ))
      ) : failed ? null : (
        <div aria-hidden="true" className="aspect-[8.5/11] w-full animate-pulse rounded-[12px] bg-white/70" />
      )}
      {loose.length > 0 && (
        <div className="rounded-[12px] bg-white/75 px-4 py-3">
          <p className="text-[13px] font-medium text-accent">{failed ? "Notes on your resume" : "About the whole resume"}</p>
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
