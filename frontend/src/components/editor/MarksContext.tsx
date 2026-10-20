"use client"

// The pen marks on the editor's preview, in Check mode: the ATS checks' (red
// and yellow) or the AI's notes (red and blue), never both, as on the review
// page. Which note is showing is shared, so pointing at a mark on the page or
// at its row in the Check panel shows the same note on the page.

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useOpenResume } from "@/context/ResumeContext"
import type { Finding, PdfReading, Report } from "@/lib/check/engine"
import type { Place } from "@/lib/check/places"
import { notesNowOf } from "@/lib/review/ai/answer"
import type { AiReviewError } from "@/lib/review/ai/askForNotes"
import { findingOf, placeOfNote } from "@/lib/review/ai/place"
import { PROBLEMS } from "@/lib/review/ai/problems"
import { sentOf } from "@/lib/review/ai/request"
import { hashOf, saveNotes, savedByHash, savedForResume, tieToResume, type SavedNote } from "@/lib/review/ai/saved"
import { unitsToSend } from "@/lib/review/ai/units"
import { measurer, PageMarks, useEscapeCloses, usePlaced, type Note, type PageSize, type Placed } from "@/components/review/PageMarks"
import { aiNotesOf, checkKeyOf, checkNotesOf } from "@/components/review/notes"
import type { Mode } from "./CheckContext"
import { reducedMotion } from "./layout"

/** Which notes mark the preview. */
export type Shown = "checks" | "ai"

export type AiAsk = { step: "idle" } | { step: "asking" } | { step: "problem"; message: string }

interface MarksValue {
  shown: Shown
  show: (which: Shown) => void
  /** The key of the note that's showing on the preview. */
  open: string | null
  setOpen: (key: string | null) => void
  /** The shown notes' marks, by page, while in Check mode and once the preview has been read. */
  placed: Placed[]
  /** The PDF the marks were measured on: they're drawn over that one alone. */
  file: string | null
  pages: readonly PageSize[] | null
  /** The AI's notes for this resume, kept in this browser; null when it has none. */
  aiNotes: SavedNote[] | null
  /** The field each of aiNotes is about, by its place in aiNotes; null once its words have been rewritten. */
  aiPlaces: (Place | null)[]
  ai: AiAsk
  /** Whether the AI can be asked: the preview has been read, so there are lines to send. */
  canAsk: boolean
  askAi: () => void
  /** Opens the field a note is about, as choosing a finding does. */
  choose: (note: Note) => void
}

const MarksContext = createContext<MarksValue | null>(null)

export function MarksProvider({
  report,
  reading,
  file,
  mode,
  open: openFinding,
  children,
}: {
  report: Report | null
  /** The preview as read, when it's of the resume as it is now. */
  reading: PdfReading | null
  /** The preview's PDF that `reading` is of. */
  file: string | null
  mode: Mode
  open: (finding: Finding) => void
  children: React.ReactNode
}) {
  const { id } = useOpenResume()
  const [aiNotes, setAiNotes] = useState<SavedNote[] | null>(null)
  const [shown, setShown] = useState<Shown>("checks")
  const [open, setOpen] = useState<string | null>(null)
  const [ai, setAi] = useState<AiAsk>({ step: "idle" })

  // A resume opened from the review, or asked about here before, brings its AI notes, kept in this browser, and opens on them.
  useEffect(() => {
    const saved = savedForResume(id)?.notes ?? null
    setAiNotes(saved)
    if (saved?.length) setShown("ai")
  }, [id])

  const show = useCallback((which: Shown) => {
    setShown(which)
    setOpen(null)
  }, [])

  const measure = useMemo(() => measurer(), [])
  const view = report?.view
  const units = useMemo(() => (view ? unitsToSend(view, reading) : null), [view, reading])
  const aiPlaces = useMemo(() => (view && aiNotes ? aiNotes.map((note) => placeOfNote(view, note)) : []), [view, aiNotes])
  const notes = useMemo(() => {
    if (mode !== "check" || !report) return []
    if (shown === "checks") return checkNotesOf(report.view, report.findings, reading, measure)
    if (!aiNotes || !units) return []
    // Drawn only where the Check panel can open it, so a mark is never left on a line the panel says has changed.
    const now = notesNowOf(aiNotes, units).map((note) => (aiPlaces[note.index] ? note : { ...note, unit: null }))
    return aiNotesOf(now, measure)
  }, [mode, report, reading, shown, aiNotes, aiPlaces, units, measure])
  const placed = usePlaced(notes)
  useEscapeCloses(open, setOpen)

  // Opening another resume, or leaving the editor, stops the AI on its way:
  // its notes would be saved and tied to a resume that isn't open, or is gone.
  const asking = useRef<AbortController | null>(null)
  useEffect(() => () => asking.current?.abort(), [id])

  const askAi = useCallback(() => {
    if (!units) return
    asking.current?.abort()
    const current = new AbortController()
    asking.current = current
    setAi({ step: "asking" })
    void (async () => {
      const hash = await hashOf(sentOf(units))
      // This version of the resume was reviewed before, on the review page or here: no need to ask again,
      // unless that review found nothing, which would only show this prompt again.
      const before = savedByHash(hash)?.notes
      let saved = before?.length ? before : null
      if (!saved) {
        const { askForKeptNotes } = await import("@/lib/review/ai/askForNotes")
        try {
          saved = await askForKeptNotes(units, current.signal)
        } catch (error) {
          if (current.signal.aborted) return
          setAi({ step: "problem", message: (error as AiReviewError).message })
          return
        }
        if (current.signal.aborted) return
        saveNotes(hash, saved)
      }
      if (current.signal.aborted) return
      tieToResume(hash, id)
      setAiNotes(saved)
      setAi({ step: "idle" })
      show("ai")
    })().catch((error) => {
      if (current.signal.aborted) return
      console.error("Couldn't get AI notes:", error)
      setAi({ step: "problem", message: PROBLEMS.other })
    })
  }, [units, id, show])

  const choose = useCallback(
    (note: Note) => {
      if (!report) return
      if (note.key.startsWith("ai:")) {
        const index = Number(note.key.slice(3))
        const saved = aiNotes?.[index]
        const place = aiPlaces[index]
        if (saved && place) openFinding(findingOf(saved, place, index))
        return
      }
      const finding = report.findings.find((each) => checkKeyOf(each) === note.key)
      if (finding) openFinding(finding)
    },
    [report, aiNotes, aiPlaces, openFinding],
  )

  const value = useMemo<MarksValue>(
    () => ({
      shown,
      show,
      open,
      setOpen,
      placed,
      file,
      pages: reading?.pages ?? null,
      aiNotes,
      aiPlaces,
      ai,
      canAsk: units !== null,
      askAi,
      choose,
    }),
    [shown, show, open, placed, file, reading, aiNotes, aiPlaces, ai, units, askAi, choose],
  )
  return <MarksContext.Provider value={value}>{children}</MarksContext.Provider>
}

export function useMarks(): MarksValue {
  const marks = useContext(MarksContext)
  if (!marks) throw new Error("useMarks must be used inside MarksProvider")
  return marks
}

/**
 * Pointing at a note's row in the Check panel: shows its note on the
 * preview, brought into view if it's scrolled out of it. Leaving puts it away.
 */
export function usePointAt(key: string) {
  const { open, setOpen } = useMarks()
  return {
    onMouseEnter: () => {
      setOpen(key)
      const mark = document.querySelector<HTMLElement>(`.preview-canvas [data-note="${CSS.escape(key)}"]`)
      const scroller = mark?.closest<HTMLElement>(".preview-canvas")
      // Not when the preview is hidden, as on small screens while the form shows.
      if (!mark || !scroller || mark.offsetParent === null) return
      const seen = scroller.getBoundingClientRect()
      const box = mark.getBoundingClientRect()
      if (box.top < seen.top || box.bottom > seen.bottom) {
        scroller.scrollBy({
          top: box.top - seen.top - seen.height / 3,
          behavior: reducedMotion() ? "auto" : "smooth",
        })
      }
    },
    onMouseLeave: () => {
      if (open === key) setOpen(null)
    },
  }
}

/**
 * One preview page's marks, over the page (in a `relative` box its size).
 * The preview keeps an older PDF on screen while a newer one draws, and the
 * newer one can be read first: marks are drawn only over the PDF they're of.
 */
export function PreviewMarks({ page, file }: { page: number; file: string }) {
  const { placed, file: measured, pages, open, setOpen, choose } = useMarks()
  const size = pages?.[page - 1]
  if (file !== measured) return null
  if (!size || !placed.some((each) => each.page === page)) return null
  return <PageMarks page={page} size={size} placed={placed} open={open} onOpen={setOpen} onChoose={choose} />
}
