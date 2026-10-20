"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, PenLine, RotateCcw, Upload } from "lucide-react"
import SiteFooter from "@/components/site/SiteFooter"
import SiteHeader from "@/components/site/SiteHeader"
import { headlineFont } from "@/components/site/headlineFont"
import { keptNotesOf, notesOf } from "@/lib/review/ai/answer"
import type { Problem } from "@/lib/review/ai/askForNotes"
import { aiPaused, aiPausedUntil } from "@/lib/review/ai/paused"
import { sentOf } from "@/lib/review/ai/request"
import { hashOf, saveNotes, savedByHash, tieToResume, type SavedNote } from "@/lib/review/ai/saved"
import { unitsToSend } from "@/lib/review/ai/units"
import type { Review, ReviewStep } from "@/lib/review/review"
import { countsLabel, countsOf, foundSentence, reasonOf, verdictOf, VERDICT_WORDS, type Verdict } from "@/lib/review/verdict"
import CloudWord from "./CloudWord"
import AiNotes, { Pill, PILL_WORDS, type AiState } from "./AiNotes"
import MarkedPages from "./MarkedPages"
import { aiNotesOf, checkNotesOf } from "./notes"
import { measurer, type Note } from "./PageMarks"
import { circle, highlight, underline, type Box } from "./rough"

const ACCEPTED_FILES =
  ".pdf,.docx,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/json"

type State =
  | { step: "idle" }
  | { step: "working"; done: ReadonlySet<ReviewStep> }
  | { step: "done"; review: Review }
  | { step: "problem"; message: string }

const STEPS: { step: ReviewStep; label: string }[] = [
  { step: "open", label: "Open your file" },
  { step: "read", label: "Read it the way hiring software does" },
  { step: "spell", label: "Check spelling and grammar" },
]

// How each verdict breaks on a phone.
const NARROW_LINES: Record<Verdict, string[]> = { ready: ["Ready", "to send"], almost: ["Almost", "there"], drafts: ["Back to", "drafts"] }

// The sample resume on the first screen (Jake's template's picture), and
// where its marks go, in the picture's pixels.
const SAMPLE = { src: "/previews/jakes-resume-template.webp", width: 1280, height: 1656 }
const SAMPLE_MARKS: { kind: "circle" | "highlight" | "underline"; box: Box }[] = [
  { kind: "circle", box: [84, 222, 348, 248] },
  { kind: "highlight", box: [742, 517, 1005, 542] },
  { kind: "underline", box: [145, 549, 1092, 570] },
  { kind: "circle", box: [145, 679, 334, 702] },
]

/** The sample resume, marked, going soft into the fog the words stand on. */
function Backdrop({ scanning }: { scanning: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="review-sheet review-fading absolute left-1/2 top-0 w-[var(--sheet)] -translate-x-1/2">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- decoration at a fixed size, which next/image would only resize */}
          <img src={SAMPLE.src} alt="" width={SAMPLE.width} height={SAMPLE.height} className="block h-auto w-full" />
          <svg viewBox={`0 0 ${SAMPLE.width} ${SAMPLE.height}`} className="absolute inset-0 h-full w-full overflow-visible">
            {SAMPLE_MARKS.map(({ kind, box }, index) =>
              kind === "highlight" ? (
                <path key={index} d={highlight(box, index + 5)} fill="rgb(168 185 242 / 0.55)" style={{ mixBlendMode: "multiply" }} />
              ) : (
                <path
                  key={index}
                  d={kind === "circle" ? circle(box, index + 5, 8) : underline(box, index + 5, 2)}
                  fill="none"
                  stroke="#2e5be6"
                  strokeWidth={4.5}
                  strokeLinecap="round"
                  opacity={0.88}
                />
              ),
            )}
          </svg>
          {scanning && <div className="review-scan" />}
        </div>
      </div>
      <div className="review-fog top-[calc(var(--sheet)*0.22)] bottom-0">
        {[0.6, 1.2, 2.4, 4.8, 9.6, 19.2].map((blur, index) => (
          <span
            key={blur}
            style={{ "--blur": `${blur}px`, "--from": `${index * 12}%`, "--to": `${index * 12 + 14}%` } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * What the review found, as crackedresume shows it: the verdict in cloud on
 * the sky, then the resume itself in a frosted frame, scribbled on where each
 * note is, with the note beside the pen when it's pointed at.
 */
/** Which notes the page is marked with: the AI's, or the checks'. */
type Shown = "ai" | "checks"

function Result({ review, onFix, onAnother }: { review: Review; onFix: (hash: string | null) => void; onAnother: () => void }) {
  const { report, score, reading, pdf } = review
  const verdict = verdictOf(score.total)
  const counts = countsOf(report)
  const measure = useMemo(() => measurer(), [])
  const checked = useMemo(() => checkNotesOf(report.view, report.findings, reading, measure), [report, reading, measure])
  // The lines the AI is sent and points at; without one, there's nothing to ask about.
  const units = useMemo(() => unitsToSend(report.view, reading), [report, reading])
  // The AI is asked as soon as the resume is read, and its notes are what the page opens on.
  const [ai, setAi] = useState<AiState>({ step: "asking" })
  const [shown, setShown] = useState<Shown>(units ? "ai" : "checks")
  const [open, setOpen] = useState<string | null>(null)
  // Why the AI notes couldn't be had, said over the dock while the page shows the checks instead.
  const [pill, setPill] = useState<string | null>(null)
  // The printed lines' hash, which the AI's notes are saved by in this browser.
  const [hash, setHash] = useState<string | null>(null)
  const asking = useRef<AbortController | null>(null)
  const notes = shown === "checks" ? checked : ai.step === "done" ? ai.notes : []

  // Whether the person has chosen a view with the switch: an answer that arrives later doesn't take them off it.
  const chose = useRef(false)

  const show = useCallback((which: Shown) => {
    setShown(which)
    setOpen(null)
  }, [])
  const showAi = useCallback(
    (saved: SavedNote[], reveal: boolean) => {
      if (!units) return
      setAi({ step: "done", notes: aiNotesOf(notesOf({ notes: saved }, units), measure) })
      if (reveal) show("ai")
    },
    [units, measure, show],
  )
  const fail = useCallback(
    (reason: Problem, message: string) => {
      setAi({ step: "problem", reason, message })
      show("checks")
      if (reason !== "off") setPill(PILL_WORDS[reason])
    },
    [show],
  )

  const ask = useCallback(
    /** `asked`: the person asked (Try again), so the answer is shown whichever view they're on. */
    async (hashed: string, asked = false) => {
      if (!units) return
      asking.current?.abort()
      const current = new AbortController()
      asking.current = current
      setAi({ step: "asking" })
      setPill(null)
      try {
        const { askForNotes, AiReviewError } = await import("@/lib/review/ai/askForNotes")
        try {
          const saved = keptNotesOf(await askForNotes(units, current.signal), units)
          if (asking.current !== current) return
          saveNotes(hashed, saved)
          showAi(saved, asked || !chose.current)
        } catch (error) {
          if (current.signal.aborted) return
          if (!(error instanceof AiReviewError)) console.error("Couldn't get AI notes:", error)
          if (error instanceof AiReviewError) fail(error.reason, error.message)
          else fail("other", "Something went wrong getting AI notes. Try again in a minute.")
        }
      } catch {
        if (!current.signal.aborted) fail("other", "The AI notes couldn’t load. Check your connection and try again.")
      }
    },
    [units, showAi, fail],
  )

  // A resume reviewed in this browser before shows the AI's notes it got then, without asking again.
  // Otherwise the AI is asked, unless it turned this tab away moments ago.
  useEffect(() => {
    if (!units) return
    let live = true
    void hashOf(sentOf(units)).then((hashed) => {
      if (!live) return
      setHash(hashed)
      const saved = savedByHash(hashed)
      if (saved) showAi(saved.notes, !chose.current)
      else if (aiPaused()) fail("limit", "You’ve asked for a lot of AI notes in a short time. Try again in a few minutes.")
      else void ask(hashed)
    })
    return () => {
      live = false
    }
  }, [units, showAi, fail, ask])

  // Leaving the result stops the AI on its way.
  useEffect(() => () => asking.current?.abort(), [])

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
  const red = ai.step === "done" ? ai.notes.filter((note) => note.ink === "red").length : 0
  const green = ai.step === "done" ? ai.notes.length - red : 0

  return (
    <section className="review-board">
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
          {units && !(ai.step === "problem" && ai.reason === "off") && (
            <AiNotes
              state={ai}
              onAsk={() => {
                if (hash) void ask(hash, true)
              }}
              open={open}
              onOpen={setOpen}
              onPick={pick}
            />
          )}
        </div>
        <div className="review-card">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-3 pb-3 pt-2.5 text-center text-[16px] text-[#1d3fa8]">
            {units && !(ai.step === "problem" && ai.reason === "off") && (
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
            {shown === "ai" && ai.step === "done" ? (
              <p>
                {red} red {red === 1 ? "flag" : "flags"}
                <span aria-hidden="true"> · </span>
                {green} green {green === 1 ? "flag" : "flags"}
              </p>
            ) : shown === "ai" ? (
              <p>{ai.step === "asking" ? "Reading it like a recruiter…" : "No AI notes yet"}</p>
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
          <MarkedPages pdf={pdf} notes={notes} open={open} onOpen={setOpen} />
        </div>
      </div>
      <div className="review-dock">
        {pill && <Pill onClose={() => setPill(null)}>{pill}</Pill>}
        <div className="review-dock-keys">
          <button type="button" onClick={() => onFix(hash)} className="review-dock-main">
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
 * on the page, with the score the editor's Check gives it. "Fix it in the
 * editor" adds it to this browser's resumes and opens it in Check.
 */
export default function ReviewPage() {
  const router = useRouter()
  const [state, setState] = useState<State>({ step: "idle" })
  const [dragging, setDragging] = useState(false)
  // Whether to say, before a file is dropped, that the AI turned this tab away moments ago.
  // Read after the first paint: the page is prerendered, with no tab to ask.
  const [paused, setPaused] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const running = useRef<AbortController | null>(null)

  const review = async (file: File) => {
    running.current?.abort()
    const current = new AbortController()
    running.current = current
    setState({ step: "working", done: new Set() })
    window.scrollTo({ top: 0 })
    try {
      // What reviews a file loads only once there's one to review.
      const { reviewFile } = await import("@/lib/review/review")
      const result = await reviewFile(file, current.signal, (step) => {
        if (running.current === current)
          setState((state) => (state.step === "working" ? { step: "working", done: new Set([...state.done, step]) } : state))
      })
      if (running.current !== current) return
      running.current = null
      setState({ step: "done", review: result })
      window.scrollTo({ top: 0 })
    } catch (error) {
      if (running.current !== current) return
      running.current = null
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

  // Leaving the page stops a review on its way.
  useEffect(() => () => running.current?.abort(), [])

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

  const working = state.step === "working"
  return (
    // Isolated, so the haze (z-index -1) is drawn over the sky but under everything else.
    <div className="desk isolate flex min-h-screen flex-col">
      <div aria-hidden="true" className="review-haze" />
      <SiteHeader />
      <main className="relative flex flex-1 flex-col [--sheet:min(576px,88vw)]">
        {state.step === "done" ? (
          <Result
            review={state.review}
            onFix={(hash) => void fix(state.review, hash)}
            onAnother={() => {
              setState({ step: "idle" })
              chooseFile()
            }}
          />
        ) : (
          <section className="no-page-in relative flex min-h-[calc(100svh-84px)] flex-col items-center px-4 pb-24 pt-[calc(var(--sheet)*0.62)] text-center">
            <Backdrop scanning={working} />
            <div className="page-in relative flex flex-col items-center">
              {working ? (
                <div role="status" className="flex flex-col items-center">
                  <h1 className={`${headlineFont.className} text-[clamp(40px,5.8vw,66px)] leading-none tracking-[-0.02em] text-[#3a3e46]`}>
                    Reading it like a recruiter…
                  </h1>
                  <p className="mt-4 text-[17px] text-ink-2">Recruiters take 7 seconds. The first review takes a little longer.</p>
                  <ul className="mt-9 flex flex-col items-start gap-3 text-left text-[15px]">
                    {STEPS.map(({ step, label }) => {
                      // Reading the PDF and checking the text both start once the file is open.
                      const now = state.done.has(step) ? "done" : step === "open" || state.done.has("open") ? "running" : "waiting"
                      return (
                        <li key={step} className={`flex items-center gap-3 ${now === "running" ? "text-ink" : "text-ink-2"}`}>
                          <span
                            aria-hidden="true"
                            className={`flex h-5 w-5 items-center justify-center rounded-full ${
                              now === "done"
                                ? "bg-white shadow-[0_0_0_4px_rgb(255_255_255/0.5)]"
                                : now === "running"
                                  ? "bg-accent shadow-[0_0_0_4px_rgb(46_91_230/0.18)]"
                                  : "bg-white/60 shadow-[inset_0_0_0_1.5px_#c8ccd4]"
                            }`}
                          >
                            {now === "done" && <Check className="h-3 w-3 text-accent" strokeWidth={3} />}
                            {now === "running" && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                          </span>
                          {label}
                          <span className="sr-only">{now === "done" ? ": done" : now === "running" ? ": in progress" : ": waiting"}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
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
