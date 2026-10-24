"use client"

// What a tailored resume changed from the one it was tailored from (the Jobs
// tab's Auto-tailor), lit up in blue on the preview while the person points
// at "Changes from original" in the left bar, or has pressed it. The preview
// is read for where its words are (lib/check/preview.ts) only then, and the
// reading is kept for that preview, so pointing again costs nothing.

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useOpenResume, useResumeState } from "@/context/ResumeContext"
import type { PdfReading } from "@/lib/check/engine"
import { comparable } from "@/lib/check/pdf"
import type { Line } from "@/lib/import/lines"
import type { Resume, TailoredFrom } from "@/lib/resume"
import { resumeOf } from "@/lib/resumeStore"
import { wordBox, type Box, type MarkedLine } from "@/lib/review/marks"
import { changesOf, tailoredFromOf, type Change } from "@/lib/tailorDiff"
import { measurer, type PageSize } from "@/components/review/PageMarks"

/** A changed run of words, where it's printed on the preview. */
export interface Lit {
  page: number
  box: Box
}

interface ChangesValue {
  from: TailoredFrom | null
  /** The resume it was tailored from, while it's still here. */
  original: Resume | undefined
  changes: Change[]
  showing: boolean
  pinned: boolean
  point: (on: boolean) => void
  pin: () => void
  /** "reading" the preview, "ready" with the changes found on it, or "unreadable". */
  status: "idle" | "reading" | "ready" | "unreadable"
  lit: Lit[]
  /** How many changed runs of words couldn't be found on the preview. */
  unfound: number
  file: string | null
  pages: readonly PageSize[] | null
}

const ChangesContext = createContext<ChangesValue | null>(null)

/** Readings kept, by the preview's address: the newest few, as the checker keeps its own. */
const READINGS_KEPT = 3

// Each line's section, by the headings the reader found: a line belongs to the last heading above it, and lines above any to none.
function sectionsOfLines(reading: PdfReading): (string | null)[] {
  const headings = [...reading.parsed.occurrences].sort((a, b) => a.headingLine - b.headingLine)
  let at = 0
  let section: string | null = null
  return reading.lines.map((_, index) => {
    while (at < headings.length && headings[at].headingLine <= index) section = headings[at++].section
    return section
  })
}

const hasBox = (line: Line): line is MarkedLine & { page: number } => line.box !== undefined && line.page !== undefined

/**
 * Where each change's words are printed: searched for in their own section
 * (a section the reader doesn't know, as an added one, is searched where
 * it found none), first as a run of words on one line; a run that wraps
 * lights up its whole lines; and one it still can't place, word by word.
 */
export function litOf(reading: PdfReading, changes: readonly Change[], measure: (text: string) => number): { lit: Lit[]; unfound: number } {
  const sections = sectionsOfLines(reading)
  const lit: Lit[] = []
  let unfound = 0
  for (const change of changes) {
    const wanted = change.section && !change.section.startsWith("extra:") ? change.section : null
    const lines = reading.lines.filter((line, index) => hasBox(line) && sections[index] === wanted) as (MarkedLine & { page: number })[]
    for (const words of change.added) {
      const line = lines.find((one) => wordBox([one], words, measure))
      if (line) {
        lit.push({ page: line.page, box: wordBox([line], words, measure)! })
        continue
      }
      const run = comparable(words)
      const wrapped = lines.filter((one) => comparable(one.text).length >= 6 && run.includes(comparable(one.text)))
      if (wrapped.length) {
        lit.push(...wrapped.map((one) => ({ page: one.page, box: one.box })))
        continue
      }
      const each = words
        .split(/\s+/)
        .filter((word) => comparable(word).length >= 3)
        .flatMap((word) => {
          const found = lines.find((one) => wordBox([one], word, measure))
          return found ? [{ page: found.page, box: wordBox([found], word, measure)! }] : []
        })
      if (each.length) lit.push(...each)
      else unfound++
    }
  }
  return { lit, unfound }
}

export function ChangesProvider({ previewUrl, children }: { previewUrl: string | null; children: React.ReactNode }) {
  const { id } = useOpenResume()
  const copy = useResumeState((state) => resumeOf(state, id))
  const from = useMemo(() => tailoredFromOf(copy), [copy])
  const original = useResumeState((state) => (from ? resumeOf(state, from.resumeId) : undefined))
  const changes = useMemo(() => (copy && original ? changesOf(copy, original) : []), [copy, original])

  const [pointing, setPointing] = useState(false)
  const [pinned, setPinned] = useState(false)
  const showing = (pointing || pinned) && changes.length > 0

  // The preview as read, for the address it was read at.
  const readings = useRef(new Map<string, PdfReading | null>())
  const [reading, setReading] = useState<{ url: string; pdf: PdfReading | null } | null>(null)
  useEffect(() => {
    if (!showing || !previewUrl) return
    const known = readings.current
    if (known.has(previewUrl)) {
      setReading({ url: previewUrl, pdf: known.get(previewUrl) ?? null })
      return
    }
    const run = new AbortController()
    import("@/lib/check/preview")
      .then(({ readPreview }) => readPreview(previewUrl, run.signal))
      .then((pdf) => {
        if (run.signal.aborted) return
        known.set(previewUrl, pdf)
        if (known.size > READINGS_KEPT) known.delete(known.keys().next().value!)
        setReading({ url: previewUrl, pdf })
      })
      .catch((error) => {
        if (run.signal.aborted) return
        console.warn("Couldn't read the preview for the changes:", error)
        setReading({ url: previewUrl, pdf: null })
      })
    return () => run.abort()
  }, [showing, previewUrl])

  const current = reading && reading.url === previewUrl ? reading : null
  const found = useMemo(() => (current?.pdf ? litOf(current.pdf, changes, measurer()) : { lit: [], unfound: 0 }), [current, changes])
  const status: ChangesValue["status"] = !showing ? "idle" : !current ? "reading" : current.pdf ? "ready" : "unreadable"

  const value: ChangesValue = {
    from,
    original,
    changes,
    showing,
    pinned,
    point: setPointing,
    pin: () => setPinned((on) => !on),
    status,
    lit: found.lit,
    unfound: found.unfound,
    file: current?.url ?? null,
    pages: current?.pdf?.pages ?? null,
  }
  return <ChangesContext.Provider value={value}>{children}</ChangesContext.Provider>
}

export function useChanges(): ChangesValue {
  const value = useContext(ChangesContext)
  if (!value) throw new Error("useChanges must be used inside ChangesProvider")
  return value
}

/** The changes on one page of the preview, in blue, over the PDF they were found on alone. */
export function PreviewChanges({ page, file }: { page: number; file: string }) {
  const { showing, lit, file: read, pages } = useChanges()
  const size = pages?.[page - 1]
  const here = lit.filter((one) => one.page === page)
  if (!showing || file !== read || !size || here.length === 0) return null
  return (
    <svg viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
      {here.map(({ box: [left, top, right, bottom] }, index) => (
        <rect
          key={index}
          x={left - 1.5}
          y={top - 1}
          width={right - left + 3}
          height={bottom - top + 2}
          rx={2}
          className="fill-[rgb(37_99_235/0.18)] stroke-[rgb(37_99_235/0.7)]"
          strokeWidth={0.75}
        />
      ))}
    </svg>
  )
}

/**
 * In the left bar, for a tailored resume: what it was tailored from, and
 * "Changes from original", which lights the changes up on the preview while
 * it's pointed at or focused, or stays on once pressed.
 */
export function TailoredFromCard() {
  const { from, original, changes, showing, pinned, point, pin, status, unfound } = useChanges()
  if (!from) return null
  const name = original?.resumeTitle?.trim() || from.title || "another resume"
  return (
    <div className="mb-5 flex flex-col gap-2 rounded-[14px] border border-[rgb(37_99_235/0.35)] bg-[rgb(37_99_235/0.05)] px-3.5 py-3 text-[13px]">
      <span className="label-mono text-[rgb(29_78_216)]">Tailored</span>
      <p className="leading-snug text-ink">
        From <span className="font-medium">{name}</span>
        {!original && <span className="text-ink-3">, which has been deleted, so there’s nothing to compare it with</span>}
      </p>
      {original && (
        <>
          <button
            type="button"
            onPointerEnter={() => point(true)}
            onPointerLeave={() => point(false)}
            onFocus={() => point(true)}
            onBlur={() => point(false)}
            onClick={pin}
            aria-pressed={pinned}
            disabled={changes.length === 0}
            className="inline-flex h-8 items-center justify-between gap-2 rounded-full bg-sheet px-3 text-left font-medium text-[rgb(29_78_216)] ring-1 ring-[rgb(37_99_235/0.35)] transition-shadow hover:ring-[rgb(37_99_235/0.7)] disabled:text-ink-3 disabled:ring-hairline aria-pressed:bg-[rgb(37_99_235/0.12)]"
          >
            <span>Changes from original</span>
            <span className="font-mono tabular-nums">{changes.length}</span>
          </button>
          <p role="status" className="min-h-[1lh] text-ink-2">
            {changes.length === 0
              ? "No changes from the original that the PDF prints."
              : status === "reading"
                ? "Finding the changes on the preview…"
                : status === "unreadable"
                  ? "The preview couldn’t be read to show them."
                  : status === "ready" && unfound > 0
                    ? `${unfound === 1 ? "One change isn’t" : `${unfound} changes aren’t`} on the preview.`
                    : pinned
                      ? "Showing the changes in blue. Press again to hide them."
                      : "Point at it, or press it, to see them in blue."}
          </p>
          {showing && (
            <ul className="flex flex-col gap-1.5">
              {changes.map((change) => (
                <li key={change.label} className="flex flex-col">
                  <span className="text-ink-2">{change.label}</span>
                  <span className="text-[rgb(29_78_216)]">{change.added.join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
