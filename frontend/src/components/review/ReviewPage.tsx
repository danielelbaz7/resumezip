"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PenLine, RotateCcw, Upload } from "lucide-react"
import { reducedMotion } from "@/components/editor/layout"
import { Squares } from "@/components/site/Loader"
import SiteFooter from "@/components/site/SiteFooter"
import SiteHeader from "@/components/site/SiteHeader"
import { headlineFont } from "@/components/site/headlineFont"
import { ago } from "@/lib/ago"
import { notesNowOf, notesOf } from "@/lib/review/ai/answer"
import { aiPaused, aiPausedUntil } from "@/lib/review/ai/paused"
import { tieToResume, type SavedNote } from "@/lib/review/ai/saved"
import { unitsToSend } from "@/lib/review/ai/units"
import { deleteAllPastReviews, deletePastReview, idOf, keepPastReview, pastReview, pastReviews, type PastReview } from "@/lib/review/past"
import { reviewedAsIs, type Review, type ReviewStep } from "@/lib/review/review"
import { countsLabel, countsOf, verdictOf, VERDICT_WORDS, type Verdict } from "@/lib/review/verdict"
import AiNotes, { Pill, PILL_WORDS, type AiState } from "./AiNotes"
import Backdrop, { GAZE_DELAY, SHEET_RADIUS } from "./Backdrop"
import CloudWord from "./CloudWord"
import { drawPages, freePages, type DrawnPage } from "./drawPages"
import { GAZE_MS, gazeOf, type Stop } from "./gaze"
import MarkedPages, { type Flight } from "./MarkedPages"
import { aiNotesOf, checkNotesOf } from "./notes"
import { measurer, type Note } from "./PageMarks"
import PastReviews from "./PastReviews"
import { useAiNotes, type AiSide } from "./useAiNotes"
import { useTicking } from "./useTicking"

const ACCEPTED_FILES =
  ".pdf,.docx,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/json"

type State =
  | { step: "idle" }
  | {
      step: "working"
      done: ReadonlySet<ReviewStep>
      /** Its own pages are read (a PDF), rather than printed first, unless it turns them (reviewedAsIs). */
      asIs: boolean
      /** Page 1 of the resume, once it's drawn, which takes the sample's place. */
      page: DrawnPage | null
      gaze: readonly Stop[] | null
      /** When the eyes start on the page (performance.now()), or null when there are none to show. */
      eyesFrom: number | null
      /** The eyes are done: the rest of the wait is the AI's. */
      rest: boolean
    }
  | {
      step: "done"
      review: Review
      pages: readonly DrawnPage[] | null
      /** Later pages are still being drawn. */
      drawing: boolean
      from: Flight | null
      /** The past review it's kept as (lib/review/past.ts), once it is; null until then, or if it can't be. */
      pastId: string | null
      /** When it was first reviewed, if it's a past review opened again. */
      reviewedAt: number | null
    }
  | { step: "problem"; message: string }

// The result waits this long for the AI's notes, from when it's asked. Past that, it opens on them all the same,
// saying they're on their way, with nothing marked until they come.
// The AI usually answers in 4 to 12 seconds; the route gives up after 55.
const AI_PATIENCE_MS = 25_000

// How each verdict breaks on a phone.
const NARROW_LINES: Record<Verdict, string[]> = { ready: ["Ready"], almost: ["Almost", "there"], drafts: ["Needs", "work"] }

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)))

/**
 * The words while a resume is read: what's going on, and once its page is up,
 * the seven seconds a recruiter gives it, counted while the eyes move over it.
 * A screen reader hears the headline once and each step as it starts, not the count.
 */
function ReadingWords({
  done,
  asIs,
  asking,
  eyesFrom,
  rest,
}: {
  done: ReadonlySet<ReviewStep>
  asIs: boolean
  asking: boolean
  eyesFrom: number | null
  rest: boolean
}) {
  const phase = eyesFrom === null ? "start" : rest ? "rest" : "eyes"
  useTicking(phase === "eyes")
  const seconds = eyesFrom === null ? 0 : Math.min(GAZE_MS, Math.max(0, performance.now() - eyesFrom)) / 1000
  const step = !done.has("open")
    ? "Opening your file"
    : !done.has("read")
      ? asIs
        ? "Reading it the way hiring software does"
        : "Printing it the way hiring software reads it"
      : asking
        ? "Getting notes from AI"
        : !done.has("spell")
          ? "Checking spelling and grammar"
          : "Almost there"
  return (
    <div role="status" className="flex flex-col items-center">
      <h1 className={`${headlineFont.className} text-[clamp(40px,5.8vw,66px)] leading-none tracking-[-0.02em] text-[#3a3e46]`}>
        <span className="sr-only">Reading it like a recruiter…</span>
        <span aria-hidden="true">
          {phase === "eyes" ? (
            <>
              <span className="inline-block min-w-[1.2em] text-right">{seconds.toFixed(1)}</span> seconds
            </>
          ) : phase === "rest" ? (
            asking ? (
              "The AI reads the rest…"
            ) : (
              "Checking the rest…"
            )
          ) : (
            "Reading it like a recruiter…"
          )}
        </span>
      </h1>
      <p aria-hidden="true" className="mt-4 text-[17px] text-ink-2">
        {phase === "eyes"
          ? "Where a recruiter’s eyes go first."
          : phase === "rest"
            ? "Every line, not just the first seven seconds."
            : "Recruiters take 7 seconds. Watch."}
      </p>
      <p className="mt-7 inline-flex items-center gap-2.5 text-[15px] text-ink-2">
        <Squares />
        {step}
      </p>
    </div>
  )
}

/** Which notes the page is marked with: the AI's, or the checks'. */
type Shown = "ai" | "checks"

/**
 * What the review found, as crackedresume shows it: the verdict in cloud on
 * the sky, then the resume itself in a frosted frame, scribbled on where each
 * note is, with the note beside the pen when it's pointed at. It opens once
 * the AI's notes are back, unless they were too long coming; then they join it.
 */
function Result({
  review,
  pages,
  drawing,
  ai,
  from,
  reviewedAt,
  onFix,
  onAnother,
}: {
  review: Review
  pages: readonly DrawnPage[] | null
  drawing: boolean
  ai: AiSide
  /** Where page 1 was as it was read, which it flies from. */
  from: Flight | null
  /** When it was first reviewed, if it's a past review opened again. */
  reviewedAt: number | null
  onFix: () => void
  onAnother: () => void
}) {
  const { report, score, reading } = review
  const { units, answer, retry } = ai
  const verdict = verdictOf(score.total)
  const counts = countsOf(report)
  const measure = useMemo(() => measurer(), [])
  const checked = useMemo(() => checkNotesOf(report.view, report.findings, reading, measure), [report, reading, measure])
  // Null when the page has no AI side: the AI isn't asked, or is off on this site.
  const state = useMemo<AiState | null>(() => {
    if (!answer || answer.step === "asking") return answer
    if (answer.step === "done") {
      // A past review's notes are found by their lines' words: a file printed again (a Word file) may number its lines differently.
      const placed = units ? (reviewedAt === null ? notesOf({ notes: answer.notes }, units) : notesNowOf(answer.notes, units)) : []
      return { step: "done", notes: aiNotesOf(placed, measure) }
    }
    return answer.reason === "off" ? null : { step: "problem", reason: answer.reason, message: answer.message }
  }, [answer, units, measure, reviewedAt])
  // The page opens on the AI's notes, or on the checks when there are none to be had.
  const [shown, setShown] = useState<Shown>(answer && answer.step !== "problem" ? "ai" : "checks")
  const [open, setOpen] = useState<string | null>(null)
  // Why the AI notes couldn't be had, said over the dock while the page shows the checks instead.
  const [pill, setPill] = useState<string | null>(() =>
    answer?.step === "problem" && answer.reason !== "off" ? PILL_WORDS[answer.reason] : null,
  )
  const notes = shown === "checks" ? checked : state?.step === "done" ? state.notes : []
  // Whether the person has chosen a view with the switch: an answer that arrives later doesn't take them off it.
  const chose = useRef(false)
  // Whether they asked again (Try again): its answer is shown whichever view they're on.
  const retried = useRef(false)

  const show = useCallback((which: Shown) => {
    setShown(which)
    setOpen(null)
  }, [])

  // An answer that comes once the page is open: notes that took long, or Try again's.
  const seen = useRef(answer)
  useEffect(() => {
    if (seen.current === answer) return
    seen.current = answer
    if (!answer) return
    if (answer.step === "asking") setPill(null)
    else if (answer.step === "done") {
      if (retried.current || !chose.current) show("ai")
    } else {
      show("checks")
      if (answer.reason !== "off") setPill(PILL_WORDS[answer.reason])
    }
  }, [answer, show])

  // A flag picked in the list: its mark, brought into view and focused, which shows its note.
  const pick = (note: Note) => {
    const mark = document.querySelector<HTMLElement>(`[data-note="${CSS.escape(note.key)}"]`)
    if (!mark) return
    mark.focus({ preventScroll: true })
    mark.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" })
  }
  const withAi = state
  const caveats = [
    !reading && "The printed copy couldn’t be read back, so how hiring software reads it isn’t scored.",
    !review.spelled && "Spelling wasn’t checked: the spelling checker couldn’t load.",
    review.setIn &&
      (review.setIn.because === "word"
        ? `A Word file has no pages of its own, so this is how it prints in ${review.setIn.template}.`
        : `This PDF turns its pages, which can’t be marked, so this is how it prints in ${review.setIn.template}.`),
  ].filter(Boolean)

  return (
    // Arriving with the page that was read flying into it, the board stays put and what's round the page fades in.
    <section className={`review-board ${from ? "no-page-in" : ""}`} data-flight={from ? "" : undefined}>
      <div className="mb-2 flex flex-col items-center text-center">
        {reviewedAt !== null && <p className="label-mono mb-2 text-ink-2">{reviewedPhrase(reviewedAt)}</p>}
        <h1 className="font-serif text-[18px] tracking-[-0.01em] text-ink-2 md:text-[20px]">
          ATS checks:<span className="sr-only"> {VERDICT_WORDS[verdict].toLowerCase()}</span>
        </h1>
        <CloudWord lines={[VERDICT_WORDS[verdict]]} className="hidden w-[min(440px,70vw)] sm:block" />
        <CloudWord lines={NARROW_LINES[verdict]} className="w-[min(300px,80vw)] sm:hidden" />
      </div>
      <div className="relative mx-auto w-full max-w-[700px]">
        <div className="review-side">
          {/* Said beside the page only when the review isn't of the page as it came, or not all of it was checked. */}
          {caveats.length > 0 && <p className="review-bubble">{caveats.join(" ")}</p>}
          {withAi && (
            <AiNotes
              state={state}
              onAsk={() => {
                retried.current = true
                retry()
              }}
              showing={shown === "ai"}
              onShow={() => {
                chose.current = true
                show("ai")
              }}
              open={open}
              onOpen={setOpen}
              onPick={pick}
            />
          )}
        </div>
        <div className="review-card">
          {/* The switch in the middle, and the checks' score beside it, so the switch stays put as it's switched. */}
          <div className="review-card-head grid items-center gap-x-3 gap-y-1.5 px-3 pb-3 pt-2.5 text-center text-[16px] text-[#1d3fa8] sm:grid-cols-[1fr_auto_1fr]">
            {withAi && (
              <div role="group" aria-label="Notes on the page" className="review-switch justify-self-center sm:col-start-2">
                <button
                  type="button"
                  aria-pressed={shown === "ai"}
                  onClick={() => {
                    chose.current = true
                    show("ai")
                  }}
                >
                  AI Reviews
                </button>
                <button
                  type="button"
                  aria-pressed={shown === "checks"}
                  onClick={() => {
                    chose.current = true
                    show("checks")
                  }}
                >
                  ATS Checks
                </button>
              </div>
            )}
            {shown === "checks" && (
              <p
                className={`flex items-baseline justify-center gap-x-2 ${withAi ? "sm:col-start-3 sm:justify-self-start sm:text-left" : "sm:col-start-2"}`}
              >
                <span className="font-medium">{score.total}/100</span>
                {counts.notes > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{countsLabel(counts)}</span>
                  </>
                )}
              </p>
            )}
          </div>
          <MarkedPages pages={pages} drawing={drawing} notes={notes} open={open} onOpen={setOpen} from={from} />
        </div>
      </div>
      <div className="review-dock">
        {pill && <Pill onClose={() => setPill(null)}>{pill}</Pill>}
        <div className="review-dock-keys">
          <button type="button" onClick={onFix} className="review-dock-main">
            <PenLine aria-hidden="true" />
            Fix it in the editor
          </button>
          <button type="button" onClick={onAnother} className="review-dock-other">
            <RotateCcw aria-hidden="true" />
            Review another
          </button>
        </div>
      </div>
    </section>
  )
}

/** "Reviewed just now", "Reviewed 5 min ago", "Reviewed 2 Oct". */
function reviewedPhrase(at: number): string {
  const when = ago(new Date(at).toISOString())
  return `Reviewed ${when === "Just now" || when === "Yesterday" ? when.toLowerCase() : when}`
}

const COULDNT_DELETE = "That couldn’t be deleted. Try again."

/** The page's address names the past review that's open, so it opens again on reload; the drop zone's has none. */
function showPast(id: string | null) {
  const url = new URL(window.location.href)
  if (id) url.searchParams.set("past", id)
  else url.searchParams.delete("past")
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url)
}

/**
 * Keeps a review as a past review, with its file, or updates the one it was
 * opened from: the name, the score, and the AI's notes so far (`notesNow`).
 * Resolves to its id, or null if it couldn't be kept. Notes that come later
 * join it as they come (ReviewPage).
 */
async function keep(file: File, result: Review, past: PastReview | null, notesNow: () => SavedNote[] | null): Promise<string | null> {
  try {
    // A past review's file is kept already.
    const bytes = past ? undefined : await file.arrayBuffer()
    const id = past?.id ?? (await idOf(bytes!))
    const kept = await keepPastReview(
      id,
      (before) => ({
        id,
        title: result.title,
        fileName: file.name,
        type: file.type,
        total: result.score.total,
        // Opened again, it keeps the day it was reviewed; dropped again, it's reviewed today.
        savedAt: past ? (before?.savedAt ?? past.savedAt) : Date.now(),
        notes: notesNow() ?? before?.notes ?? null,
        ...(before?.resumeId && { resumeId: before.resumeId }),
      }),
      bytes,
    )
    return kept ? id : null
  } catch {
    // No crypto.subtle (a page not served securely), or the file can't be read again: it's just not kept.
    return null
  }
}

/**
 * The review page: drop a resume, and see what a recruiter would skip, marked
 * on the page, with a score from the editor's checks. While it's read, its own
 * page takes the sample's place and a recruiter's eyes go over it; the AI is
 * asked as soon as its pages are read, and the result opens with its notes.
 * "Fix it in the editor" adds it to this browser's resumes and opens it in Check.
 */
export default function ReviewPage() {
  const router = useRouter()
  const ai = useAiNotes()
  const [state, setState] = useState<State>({ step: "idle" })
  const [dragging, setDragging] = useState(false)
  // Whether to say, before a file is dropped, that the AI turned this tab away moments ago.
  // Read after the first paint: the page is prerendered, with no tab to ask.
  const [paused, setPaused] = useState(false)
  // The past reviews kept in this browser, which the drop zone lists; null until they're read.
  const [past, setPast] = useState<PastReview[] | null>(null)
  // Why a past review couldn't be deleted, said under the list.
  const [pastProblem, setPastProblem] = useState<string | null>(null)
  // The running review being kept as a past review, resolving to its id (null if it couldn't be): "Fix it in the editor" waits for it.
  const keeping = useRef<Promise<string | null> | null>(null)
  // The AI's notes on the running review, once they're back, for what's kept as they're read.
  const answered = useRef<SavedNote[] | null>(null)
  answered.current = ai.answer?.step === "done" ? ai.answer.notes : null
  const fileInput = useRef<HTMLInputElement>(null)
  const running = useRef<AbortController | null>(null)
  // The page being read, which the result's first page flies from.
  const reading = useRef<HTMLDivElement>(null)
  // The review's drawn pages, freed once it's left.
  const drawn = useRef<readonly DrawnPage[] | null>(null)
  const { start: askAi, stop: stopAi } = ai

  const leave = useCallback(() => {
    running.current?.abort()
    running.current = null
    stopAi()
    freePages(drawn.current)
    drawn.current = null
  }, [stopAi])

  // Reviews `file`, or a past review's file opened again (`past`), and keeps it as a past review once it's done.
  const review = async (file: File, past: PastReview | null = null) => {
    leave()
    showPast(past?.id ?? null)
    keeping.current = null
    const current = new AbortController()
    running.current = current
    const live = () => running.current === current
    setState({ step: "working", done: new Set(), asIs: reviewedAsIs(file), page: null, gaze: null, eyesFrom: null, rest: false })
    window.scrollTo({ top: 0 })
    const asked = { answer: null as Promise<void> | null, at: 0 }
    // All the pages, and page 1 alone, which is all the result needs to open: the rest join it as they're drawn.
    let drawing: Promise<readonly DrawnPage[] | null> = Promise.resolve(null)
    let first: Promise<DrawnPage | null> = Promise.resolve(null)
    // Whether drawing's over, all the pages drawn or as many as could be.
    let drawnAll = false
    try {
      // What reviews a file loads only once there's one to review.
      const { reviewFile } = await import("@/lib/review/review")
      const result = await reviewFile(
        file,
        current.signal,
        (step) => {
          if (live()) setState((state) => (state.step === "working" ? { ...state, done: new Set([...state.done, step]) } : state))
        },
        // Printed: the AI is asked now, while the spelling's still checked, and the page is drawn to take the sample's place.
        ({ pdf, reading: read, view }) => {
          if (!live()) return
          asked.answer = askAi(unitsToSend(view, read), past?.notes)
          asked.at = Date.now()
          let firstDrawn: (page: DrawnPage | null) => void = () => {}
          first = new Promise((resolve) => (firstDrawn = resolve))
          drawing = drawPages(pdf, current.signal, (page, index) => {
            if (index > 0 || !live()) return
            const still = reducedMotion()
            const gaze = read && !still ? gazeOf(read.lines, page) : []
            const eyesFrom = gaze.length > 0 ? performance.now() + GAZE_DELAY : null
            setState((state) => (state.step === "working" ? { ...state, page, gaze, eyesFrom } : state))
            firstDrawn(page)
          }).then((pages) => {
            // Left while it drew, the drawing stopped and freed its pages.
            if (live()) drawn.current = pages
            else freePages(pages)
            firstDrawn(null)
            drawnAll = true
            return pages
          })
        },
      )
      // The result waits for the AI's notes, and for page 1 to fly in from, though not for ever:
      // past the wait, a page still being drawn joins the result once it is.
      const until = () => wait(asked.at + AI_PATIENCE_MS - Date.now())
      if (asked.answer) await Promise.race([asked.answer, until()])
      const page = await Promise.race([first, until().then(() => null)])
      if (!live()) return
      // The review stays the running one until it's left, which stops its drawing if that's still going.
      const box = page && reading.current?.getBoundingClientRect()
      setState({
        step: "done",
        review: result,
        pages: page ? [page] : null,
        drawing: !drawnAll,
        from: box ? { left: box.left, top: box.top, width: box.width, radius: SHEET_RADIUS } : null,
        pastId: null,
        reviewedAt: past?.savedAt ?? null,
      })
      window.scrollTo({ top: 0 })
      keeping.current = keep(file, result, past, () => (live() ? answered.current : null))
      void keeping.current.then((id) => {
        if (!id || !live()) return
        showPast(id)
        setState((state) => (state.step === "done" && state.review === result ? { ...state, pastId: id } : state))
      })
      void drawing.then((pages) => {
        if (live()) setState((state) => (state.step === "done" && state.review === result ? { ...state, pages, drawing: false } : state))
      })
    } catch (error) {
      if (!live()) return
      leave()
      const [{ OpenFileError }, { failureOf, PdfError }] = await Promise.all([import("@/lib/import/open"), import("@/lib/typst/compile")])
      const message =
        error instanceof OpenFileError
          ? error.message
          : error instanceof PdfError && failureOf(error) === "connection"
            ? "The checker couldn’t download. Check your connection and try again."
            : "Something went wrong reviewing this file. Try again, or try a PDF or Word copy of it."
      if (!(error instanceof OpenFileError)) console.error("Couldn't review the file:", error)
      setState({ step: "problem", message })
    }
  }
  const reviewRef = useRef(review)
  reviewRef.current = review

  // Opens a past review: its file, reviewed again, with the notes the AI gave it.
  const reopen = async (id: string) => {
    const past = await pastReview(id)
    if (!past) {
      setPast((list) => list?.filter((each) => each.id !== id) ?? null)
      showPast(null)
      setState({ step: "problem", message: "That review isn’t kept in this browser any more." })
      return
    }
    await reviewRef.current(new File([past.bytes], past.review.fileName, { type: past.review.type }), past.review)
  }
  const reopenRef = useRef(reopen)
  reopenRef.current = reopen

  // A link to a past review (/review?past=…, from the editor) opens it. Read once the page is in the browser: it's prerendered.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("past")
    if (id) void reopenRef.current(id)
  }, [])

  // The AI's notes join the past review as they come, and again if it's asked again.
  const pastId = state.step === "done" ? state.pastId : null
  const notes = ai.answer?.step === "done" ? ai.answer.notes : null
  useEffect(() => {
    if (pastId && notes) void keepPastReview(pastId, (before) => before && { ...before, notes })
  }, [pastId, notes])

  // The past reviews, read on the drop zone, and again when it's come back to.
  const atDropZone = state.step === "idle" || state.step === "problem"
  useEffect(() => {
    if (!atDropZone) return
    let current = true
    void pastReviews().then((reviews) => {
      if (current) setPast(reviews)
    })
    return () => {
      current = false
    }
  }, [atDropZone])

  // Leaving the page stops a review on its way, and frees its pages.
  useEffect(() => leave, [leave])

  // The eyes let go after their seven seconds, and the rest of the wait is the AI's.
  const eyesFrom = state.step === "working" ? state.eyesFrom : null
  useEffect(() => {
    if (eyesFrom === null) return
    const timer = setTimeout(
      () => setState((state) => (state.step === "working" ? { ...state, rest: true } : state)),
      eyesFrom + GAZE_MS - performance.now(),
    )
    return () => clearTimeout(timer)
  }, [eyesFrom])

  // Dropping a file anywhere on the page reviews it.
  useEffect(() => {
    let depth = 0
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files")
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth++
      setDragging(true)
    }
    const onOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault()
    }
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth = 0
      setDragging(false)
      const file = event.dataTransfer?.files[0]
      if (file) void reviewRef.current(file)
    }
    window.addEventListener("dragenter", onEnter)
    window.addEventListener("dragover", onOver)
    window.addEventListener("dragleave", onLeave)
    window.addEventListener("drop", onDrop)
    return () => {
      window.removeEventListener("dragenter", onEnter)
      window.removeEventListener("dragover", onOver)
      window.removeEventListener("dragleave", onLeave)
      window.removeEventListener("drop", onDrop)
    }
  }, [])

  // Read on the drop zone, again when the tab comes back into view, and once more when the pause ends.
  useEffect(() => {
    if (state.step !== "idle" && state.step !== "problem") return
    const check = () => setPaused(aiPaused())
    check()
    const left = aiPausedUntil() - Date.now()
    const timer = left > 0 ? setTimeout(check, left) : undefined
    document.addEventListener("visibilitychange", check)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", check)
    }
  }, [state.step])

  const chooseFile = () => fileInput.current?.click()

  // Gone from the list once it's gone from storage, which is a moment: a page closed straight after would otherwise list it again.
  const deletePast = async (review: PastReview) => {
    const deleted = await deletePastReview(review.id)
    setPastProblem(deleted ? null : COULDNT_DELETE)
    if (deleted) setPast((list) => list?.filter((each) => each.id !== review.id) ?? null)
  }
  const deleteAllPast = async () => {
    const deleted = await deleteAllPastReviews()
    setPastProblem(deleted ? null : COULDNT_DELETE)
    if (deleted) setPast([])
  }

  // Adds the reviewed resume to this browser's, unless it's here already as
  // it is, and opens it in the editor's Check, where the notes are. The AI's
  // notes, if it was asked, go with it: the editor finds them by its id.
  // A past review that was opened in the editor before opens the resume it
  // became, as it's been edited since, with the notes it has now.
  const fix = async (reviewed: Review, hash: string | null) => {
    const [{ openResumes }, { copyHere }, { saveMode }] = await Promise.all([
      import("@/context/ResumeContext"),
      import("@/lib/resumeStore"),
      import("@/components/editor/CheckContext"),
    ])
    const store = openResumes()
    const { resumes } = store.getState()
    // Waited for, so a resume opened straight away is still tied to its past review.
    const pastId = await keeping.current
    const became = pastId ? (await pastReview(pastId))?.review.resumeId : undefined
    let id: string
    if (became && Object.hasOwn(resumes, became)) id = became
    else {
      const here = copyHere(resumes, reviewed.content)
      // A different version of a resume that's here is added beside it, as a copy.
      id = here?.unchanged ? here.resume.id! : store.importResume(reviewed.content, reviewed.title, { keepId: !here })
      if (hash) tieToResume(hash, id)
    }
    // With the notes as they are now: the page is left before it would add notes that came since it was kept.
    const notes = answered.current
    if (pastId) await keepPastReview(pastId, (before) => before && { ...before, notes: notes ?? before.notes, resumeId: id })
    saveMode("check")
    router.push(`/create/new/${id}`)
  }

  const working = state.step === "working" ? state : null
  return (
    // Isolated, so the haze (z-index -1) is drawn over the sky but under everything else.
    <div className="desk isolate flex min-h-screen flex-col">
      <div aria-hidden="true" className="review-haze" />
      <SiteHeader />
      <main className="relative flex flex-1 flex-col [--sheet:min(576px,88vw)]">
        {state.step === "done" ? (
          <Result
            review={state.review}
            pages={state.pages}
            drawing={state.drawing}
            ai={ai}
            from={state.from}
            reviewedAt={state.reviewedAt}
            onFix={() => void fix(state.review, ai.hash)}
            onAnother={() => {
              leave()
              showPast(null)
              setState({ step: "idle" })
              chooseFile()
            }}
          />
        ) : (
          <section className="no-page-in relative flex min-h-[calc(100svh-84px)] flex-col items-center px-4 pb-24 pt-[calc(var(--sheet)*0.62)] text-center">
            <Backdrop
              // The scan reads the page until the eyes take over, and again once they're done with it.
              scanning={!!working && (working.eyesFrom === null || working.rest)}
              page={working?.page}
              gaze={working?.gaze}
              pageRef={reading}
            />
            <div className="page-in relative flex flex-col items-center">
              {working ? (
                <ReadingWords
                  done={working.done}
                  asIs={working.asIs}
                  asking={ai.answer?.step === "asking"}
                  eyesFrom={working.eyesFrom}
                  rest={working.rest}
                />
              ) : (
                <>
                  <h1
                    className={`${headlineFont.className} text-[clamp(44px,6.4vw,72px)] leading-[1.02] tracking-[-0.02em] text-[#3a3e46] [text-wrap:balance]`}
                  >
                    Your resume has 7 seconds. <br className="hidden sm:inline" />
                    Will it make the cut?
                  </h1>
                  <p className="mt-[18px] text-pretty text-[17px] text-ink-2 sm:whitespace-nowrap">
                    Drop it here, and see what a recruiter would skip, marked right on the page.
                  </p>
                  {state.step === "problem" && (
                    <p role="alert" className="mt-6 max-w-md rounded-2xl bg-white/80 px-4 py-3 text-[15px] text-alert">
                      {state.message}
                    </p>
                  )}
                  {dragging ? (
                    <div className="review-drop mt-8">
                      <Upload className="h-6 w-6 text-accent" aria-hidden="true" />
                      <span className="text-[18px] font-medium text-[#2a2e35]">Drop it here</span>
                      <span className="text-[13.5px] text-ink-2">PDF or Word</span>
                    </div>
                  ) : (
                    <button type="button" className="review-key glass glass-solid mt-8" onClick={chooseFile}>
                      <Upload aria-hidden="true" />
                      {state.step === "problem" ? "Try another file" : "Review my resume"}
                    </button>
                  )}
                  <p className="mt-[22px] text-[12px] text-ink-2">
                    PDF or Word · Free · Resume is sent to AI for review, and{" "}
                    <Link href="/private-resume-builder" className="underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                      kept only in this browser
                    </Link>
                    .
                  </p>
                  {past && (
                    <PastReviews
                      reviews={past}
                      onOpen={(review) => void reopen(review.id)}
                      problem={pastProblem}
                      onDelete={(review) => void deletePast(review)}
                      onDeleteAll={() => void deleteAllPast()}
                    />
                  )}
                  {paused && (
                    <div className="review-pill-float">
                      <Pill onClose={() => setPaused(false)}>AI notes are paused for a few minutes. You’ll still get the ATS checks.</Pill>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}
      </main>
      <SiteFooter bare />
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_FILES}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) void review(file)
        }}
      />
    </div>
  )
}
