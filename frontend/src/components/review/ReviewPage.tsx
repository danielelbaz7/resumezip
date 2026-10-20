"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PenLine, RotateCcw, Upload } from "lucide-react"
import { Squares } from "@/components/site/Loader"
import SiteFooter from "@/components/site/SiteFooter"
import SiteHeader from "@/components/site/SiteHeader"
import { headlineFont } from "@/components/site/headlineFont"
import { notesOf } from "@/lib/review/ai/answer"
import { aiPaused, aiPausedUntil } from "@/lib/review/ai/paused"
import { tieToResume } from "@/lib/review/ai/saved"
import { unitsToSend } from "@/lib/review/ai/units"
import type { Review, ReviewStep } from "@/lib/review/review"
import { countsLabel, countsOf, foundSentence, reasonOf, verdictOf, VERDICT_WORDS, type Verdict } from "@/lib/review/verdict"
import AiNotes, { Pill, PILL_WORDS, type AiState } from "./AiNotes"
import Backdrop, { GAZE_DELAY, SHEET_RADIUS } from "./Backdrop"
import CloudWord from "./CloudWord"
import { drawPages, freePages, type DrawnPage } from "./drawPages"
import { GAZE_MS, gazeOf, type Stop } from "./gaze"
import MarkedPages, { type Flight } from "./MarkedPages"
import { aiNotesOf, checkNotesOf } from "./notes"
import { measurer, type Note } from "./PageMarks"
import { useAiNotes, type AiNotes as Ai } from "./useAiNotes"

const ACCEPTED_FILES =
  ".pdf,.docx,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/json"

type State =
  | { step: "idle" }
  | {
      step: "working"
      done: ReadonlySet<ReviewStep>
      /** Page 1 of the resume as printed, once it's drawn, which takes the sample's place. */
      page: DrawnPage | null
      gaze: readonly Stop[] | null
      /** When the eyes start on the page (performance.now()), or null when there are none to show. */
      eyesFrom: number | null
      /** The eyes are done: the rest of the wait is the AI's. */
      rest: boolean
    }
  | { step: "done"; review: Review; pages: readonly DrawnPage[] | null; from: Flight | null }
  | { step: "problem"; message: string }

// The result waits this long for the AI's notes, from when it's asked, before it shows the checks' and lets the notes join it.
// The AI usually answers in 4 to 12 seconds; the route gives up after 55.
const AI_PATIENCE_MS = 25_000

// How each verdict breaks on a phone.
const NARROW_LINES: Record<Verdict, string[]> = { ready: ["Ready", "to send"], almost: ["Almost", "there"], drafts: ["Back to", "drafts"] }

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)))

/** Re-renders every `every` ms while `on`, for words that count. */
function useTicking(on: boolean, every = 100) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!on) return
    const timer = setInterval(() => setTick((tick) => tick + 1), every)
    return () => clearInterval(timer)
  }, [on, every])
}

/**
 * The words while a resume is read: what's going on, and once its page is up,
 * the seven seconds a recruiter gives it, counted while the eyes move over it.
 * A screen reader hears the headline once and each step as it starts, not the count.
 */
function ReadingWords({
  done,
  asking,
  eyesFrom,
  rest,
}: {
  done: ReadonlySet<ReviewStep>
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
      ? "Printing it the way hiring software reads it"
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
  ai,
  from,
  onFix,
  onAnother,
}: {
  review: Review
  pages: readonly DrawnPage[] | null
  ai: Ai
  /** Where page 1 was as it was read, which it flies from. */
  from: Flight | null
  onFix: () => void
  onAnother: () => void
}) {
  const { report, score, reading } = review
  const { units, answer, retry } = ai
  const verdict = verdictOf(score.total)
  const counts = countsOf(report)
  const measure = useMemo(() => measurer(), [])
  const checked = useMemo(() => checkNotesOf(report.view, report.findings, reading, measure), [report, reading, measure])
  const state = useMemo<AiState | null>(
    () =>
      !answer
        ? null
        : answer.step === "done"
          ? { step: "done", notes: units ? aiNotesOf(notesOf({ notes: answer.notes }, units), measure) : [] }
          : answer,
    [answer, units, measure],
  )
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
  // When the page shows the checks, it's switched to the AI's notes first, and the mark is looked for once they're drawn.
  const pick = useCallback(
    (note: Note) => {
      const focus = () => {
        const mark = document.querySelector<HTMLElement>(`[data-note="${CSS.escape(note.key)}"]`)
        if (!mark) return
        mark.focus({ preventScroll: true })
        mark.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
      }
      if (shown === "ai") return focus()
      show("ai")
      requestAnimationFrame(() => requestAnimationFrame(focus))
    },
    [shown, show],
  )
  const red = state?.step === "done" ? state.notes.filter((note) => note.ink === "red").length : 0
  const green = state?.step === "done" ? state.notes.length - red : 0
  const withAi = units && state && !(state.step === "problem" && state.reason === "off")

  return (
    // Arriving with the page that was read flying into it, the board stays put and what's round the page fades in.
    <section className={`review-board ${from ? "no-page-in" : ""}`} data-flight={from ? "" : undefined}>
      <div className="mb-3 flex flex-col items-center text-center">
        <h1 className="font-serif text-[20px] tracking-[-0.01em] text-ink-2 md:text-[24px]">
          Your resume is<span className="sr-only"> {VERDICT_WORDS[verdict].toLowerCase()}</span>
        </h1>
        <CloudWord lines={[VERDICT_WORDS[verdict]]} className="hidden w-[min(600px,80vw)] sm:block" />
        <CloudWord lines={NARROW_LINES[verdict]} className="w-[min(300px,80vw)] sm:hidden" />
      </div>
      <div className="relative mx-auto w-full max-w-[700px]">
        <div className="review-side">
          <p className="review-bubble">
            {reasonOf(score, report)}{" "}
            {counts.notes > 0 && (
              <>
                {foundSentence(counts)} <span className="pointer-coarse:hidden">Hover over a scribble to see why.</span>
                <span className="hidden pointer-coarse:inline">Tap a scribble to see why.</span>
              </>
            )}
            {!reading && " The printed copy couldn’t be read back, so how hiring software reads it isn’t scored."}
            {!review.spelled && " Spelling wasn’t checked: the spelling checker couldn’t load."}
          </p>
          {withAi && (
            <AiNotes
              state={state}
              onAsk={() => {
                retried.current = true
                retry()
              }}
              open={open}
              onOpen={setOpen}
              onPick={pick}
            />
          )}
        </div>
        <div className="review-card">
          <div className="review-card-head flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-3 pb-3 pt-2.5 text-center text-[16px] text-[#1d3fa8]">
            {withAi && (
              <div role="group" aria-label="Notes on the page" className="review-switch">
                <button
                  type="button"
                  aria-pressed={shown === "ai"}
                  onClick={() => {
                    chose.current = true
                    show("ai")
                  }}
                >
                  AI notes
                </button>
                <button
                  type="button"
                  aria-pressed={shown === "checks"}
                  onClick={() => {
                    chose.current = true
                    show("checks")
                  }}
                >
                  ATS checks
                </button>
              </div>
            )}
            {shown === "ai" && state?.step === "done" ? (
              <p>
                {red} red {red === 1 ? "flag" : "flags"}
                <span aria-hidden="true"> · </span>
                {green} green {green === 1 ? "flag" : "flags"}
              </p>
            ) : shown === "ai" ? (
              <p>{state?.step === "asking" ? "Getting notes from AI…" : "No AI notes yet"}</p>
            ) : (
              <p className="flex items-baseline gap-x-2">
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
          <MarkedPages pages={pages} notes={notes} open={open} onOpen={setOpen} from={from} />
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

/**
 * The review page: drop a resume, and see what a recruiter would skip, marked
 * on the page, with the score the editor's Check gives it. While it's read,
 * its own page takes the sample's place and a recruiter's eyes go over it; the
 * AI is asked as soon as it's printed, and the result opens with its notes.
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

  const review = async (file: File) => {
    leave()
    const current = new AbortController()
    running.current = current
    const live = () => running.current === current
    setState({ step: "working", done: new Set(), page: null, gaze: null, eyesFrom: null, rest: false })
    window.scrollTo({ top: 0 })
    const asked = { answer: null as Promise<void> | null, at: 0 }
    // All the pages, and page 1 alone, which is all the result needs to open: the rest join it as they're drawn.
    let drawing: Promise<readonly DrawnPage[] | null> = Promise.resolve(null)
    let first: Promise<DrawnPage | null> = Promise.resolve(null)
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
          asked.answer = askAi(unitsToSend(view, read))
          asked.at = Date.now()
          let firstDrawn: (page: DrawnPage | null) => void = () => {}
          first = new Promise((resolve) => (firstDrawn = resolve))
          drawing = drawPages(pdf, current.signal, (page, index) => {
            if (index > 0 || !live()) return
            const still = matchMedia("(prefers-reduced-motion: reduce)").matches
            const gaze = read && !still ? gazeOf(read.lines, page) : []
            const eyesFrom = gaze.length > 0 ? performance.now() + GAZE_DELAY : null
            setState((state) => (state.step === "working" ? { ...state, page, gaze: gaze.length > 0 ? gaze : null, eyesFrom } : state))
            firstDrawn(page)
          }).then((pages) => {
            // Left while it drew, the drawing stopped and freed its pages.
            if (live()) drawn.current = pages
            else freePages(pages)
            firstDrawn(null)
            return pages
          })
        },
      )
      // The result waits for the AI's notes, though not for ever.
      if (asked.answer) await Promise.race([asked.answer, wait(asked.at + AI_PATIENCE_MS - Date.now())])
      const page = await first
      if (!live()) return
      // The review stays the running one until it's left, which stops its drawing if that's still going.
      const box = page && reading.current?.getBoundingClientRect()
      setState({
        step: "done",
        review: result,
        pages: page ? [page] : await drawing,
        from: box ? { left: box.left, top: box.top, width: box.width, radius: SHEET_RADIUS } : null,
      })
      window.scrollTo({ top: 0 })
      void drawing.then((pages) => {
        if (live()) setState((state) => (state.step === "done" && state.review === result ? { ...state, pages } : state))
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

  // Adds the reviewed resume to this browser's, unless it's here already as
  // it is, and opens it in the editor's Check, where the notes are. The AI's
  // notes, if it was asked, go with it: the editor finds them by its id.
  const fix = async (reviewed: Review, hash: string | null) => {
    const [{ openResumes }, { copyHere }, { saveMode }] = await Promise.all([
      import("@/context/ResumeContext"),
      import("@/lib/resumeStore"),
      import("@/components/editor/CheckContext"),
    ])
    const store = openResumes()
    const here = copyHere(store.getState().resumes, reviewed.content)
    // A different version of a resume that's here is added beside it, as a copy.
    const id = here?.unchanged ? here.resume.id! : store.importResume(reviewed.content, reviewed.title, { keepId: !here })
    if (hash) tieToResume(hash, id)
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
            ai={ai}
            from={state.from}
            onFix={() => void fix(state.review, ai.hash)}
            onAnother={() => {
              leave()
              setState({ step: "idle" })
              chooseFile()
            }}
          />
        ) : (
          <section className="no-page-in relative flex min-h-[calc(100svh-84px)] flex-col items-center px-4 pb-24 pt-[calc(var(--sheet)*0.62)] text-center">
            <Backdrop
              // The scan reads the page while it's printed, and again once the eyes are done with it.
              scanning={!!working && (working.eyesFrom === null || working.rest)}
              page={working?.page}
              gaze={working?.gaze}
              pageRef={reading}
            />
            <div className="page-in relative flex flex-col items-center">
              {working ? (
                <ReadingWords done={working.done} asking={ai.answer?.step === "asking"} eyesFrom={working.eyesFrom} rest={working.rest} />
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
                    PDF or Word · Free · Resume is sent to AI for review.{" "}
                    <Link href="/private-resume-builder" className="underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                      Nothing is kept
                    </Link>
                    .
                  </p>
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
