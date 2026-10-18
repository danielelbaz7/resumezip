"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, PenLine, RotateCcw, Upload } from "lucide-react"
import SiteFooter from "@/components/site/SiteFooter"
import SiteHeader from "@/components/site/SiteHeader"
import { marksOf } from "@/lib/review/marks"
import type { Review, ReviewStep } from "@/lib/review/review"
import { countsOf, reasonOf, verdictOf, VERDICT_WORDS, type Verdict } from "@/lib/review/verdict"
import CloudWord from "./CloudWord"
import MarkedPages, { type Note } from "./MarkedPages"
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

// How much of each verdict blows away (CloudWord), and how it breaks on a phone.
const DRIFT: Record<Verdict, number> = { ready: 0, almost: 0.4, drafts: 1 }
const NARROW_LINES: Record<Verdict, string[]> = { ready: ["Ready", "to send"], almost: ["Almost", "there"], drafts: ["Back to", "drafts"] }

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

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

/** The score's ring, filled to the score. */
function Ring({ score }: { score: number }) {
  const r = 14
  const around = 2 * Math.PI * r
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true" className="shrink-0">
      <circle cx="17" cy="17" r={r} fill="#fff" stroke="rgb(17 19 24 / 0.13)" strokeWidth="4" />
      <circle
        cx="17"
        cy="17"
        r={r}
        fill="none"
        stroke="#2e5be6"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${(around * score) / 100} ${around}`}
        transform="rotate(-90 17 17)"
      />
    </svg>
  )
}

/** What the review found: the verdict on the sky, then the notes on a sheet. */
function Result({ review, onFix, onAnother }: { review: Review; onFix: () => void; onAnother: () => void }) {
  const { report, score, reading, pdf } = review
  const verdict = verdictOf(score.total)
  const { notes, mustFixes } = countsOf(report)
  const marked = useMemo(() => {
    const marks = marksOf(report.view, report.findings, reading)
    return report.findings.map((finding, index): Note => ({ finding, mark: marks[index] }))
  }, [report, reading])

  return (
    <>
      <section className="relative flex flex-col items-center px-4 pb-16 pt-4 text-center md:pt-8">
        <h1 className="font-serif text-[22px] tracking-[-0.01em] text-ink-2 md:text-[28px]">
          Your resume is<span className="sr-only"> {VERDICT_WORDS[verdict].toLowerCase()}</span>
        </h1>
        <CloudWord lines={[VERDICT_WORDS[verdict]]} drift={DRIFT[verdict]} className="mt-2 hidden w-[min(1040px,92vw)] sm:block" />
        <CloudWord lines={NARROW_LINES[verdict]} drift={DRIFT[verdict]} className="mt-2 w-[min(340px,86vw)] sm:hidden" />
        <p className="mt-6 max-w-xl text-pretty text-[17px] text-ink-2 md:text-[19px]">{reasonOf(score, report)}</p>
        <p className="review-score mt-6 text-[14px] text-ink-2">
          <Ring score={score.total} />
          <span className="font-serif text-[22px] leading-none text-ink">
            {score.total}
            <span className="text-[13px] text-ink-3">/100</span>
          </span>
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-ink/25" />
          <span>
            {count(notes, "note")} · {count(mustFixes, "must-fix", "must-fixes")}
          </span>
        </p>
        {(!reading || !review.spelled) && (
          <p className="mt-3 max-w-md text-[13px] text-ink-2">
            {!reading && "The printed copy couldn’t be read back, so how hiring software reads it isn’t scored. "}
            {!review.spelled && "Spelling wasn’t checked: the spelling checker couldn’t load."}
          </p>
        )}
        <div className="mt-9 flex flex-wrap items-center justify-center gap-x-8 gap-y-5">
          <button type="button" className="halo-button" onClick={onFix}>
            <PenLine aria-hidden="true" />
            Fix it in the editor
          </button>
          <button type="button" onClick={onAnother} className="inline-flex items-center gap-2 text-[16px] text-ink-2 hover:text-ink">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Review another
          </button>
        </div>
      </section>

      <section
        aria-labelledby="notes"
        className="review-notes mx-auto mb-4 w-[calc(100%-24px)] max-w-[1320px] px-5 pb-14 pt-10 md:mb-8 md:w-[calc(100%-48px)] md:px-12 md:pt-14"
      >
        <p className="label-mono text-ink-3">Review · {count(notes, "note")}</p>
        <h2 id="notes" className="mt-2 font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-ink md:text-[44px]">
          Notes on your resume
        </h2>
        <p className="mt-3 max-w-2xl text-pretty text-[16px] text-ink-2">
          {notes > 0
            ? "Each scribble is a note, drawn where it is on the page: point at one, or tab to it, to see what it says. They’re waiting in Check when you fix it in the editor."
            : "Nothing to note. A recruiter has nothing to trip on."}
        </p>
        <div className="mx-auto mt-8 max-w-[700px]">
          <MarkedPages pdf={pdf} view={report.view} notes={marked} />
        </div>
        <div className="mt-14 flex flex-col items-center gap-5 border-t border-hairline pt-12 text-center">
          <p className="font-serif text-[28px] leading-[1.1] tracking-[-0.02em] text-ink md:text-[36px]">
            Fix it in resumezip.
            <br />
            Your notes come with you.
          </p>
          <button type="button" className="halo-button" onClick={onFix}>
            <PenLine aria-hidden="true" />
            Open it in the editor
          </button>
          <p className="text-[13px] text-ink-3">Read in your browser. Nothing was uploaded.</p>
        </div>
      </section>
    </>
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

  const chooseFile = () => fileInput.current?.click()

  // Adds the reviewed resume to this browser's, unless it's here already as
  // it is, and opens it in the editor's Check, where the notes are.
  const fix = async (reviewed: Review) => {
    const [{ openResumes }, { copyHere }, { saveMode }] = await Promise.all([
      import("@/context/ResumeContext"),
      import("@/lib/resumeStore"),
      import("@/components/editor/CheckContext"),
    ])
    const store = openResumes()
    const here = copyHere(store.getState().resumes, reviewed.content)
    // A different version of a resume that's here is added beside it, as a copy.
    const id = here?.unchanged ? here.resume.id! : store.importResume(reviewed.content, reviewed.title, { keepId: !here })
    saveMode("check")
    router.push(`/create/new/${id}`)
  }

  const working = state.step === "working"
  return (
    // Isolated, so the haze (z-index -1) is drawn over the sky but under everything else.
    <div className="desk isolate flex min-h-screen flex-col">
      <div aria-hidden="true" className="review-haze" />
      <SiteHeader />
      <main className="relative flex flex-1 flex-col [--sheet:min(640px,88vw)]">
        {state.step === "done" ? (
          <Result
            review={state.review}
            onFix={() => void fix(state.review)}
            onAnother={() => {
              setState({ step: "idle" })
              chooseFile()
            }}
          />
        ) : (
          <section className="relative flex min-h-[calc(100svh-84px)] flex-col items-center px-4 pb-24 pt-[calc(var(--sheet)*0.62)] text-center">
            <Backdrop scanning={working} />
            <div className="relative flex flex-col items-center">
              {working ? (
                <div role="status" className="flex flex-col items-center">
                  <h1 className="font-serif text-[clamp(34px,5vw,56px)] font-medium leading-none tracking-[-0.025em] text-[#3a3e46]">
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
                  <h1 className="font-serif text-[clamp(38px,5.4vw,66px)] font-medium leading-none tracking-[-0.025em] text-[#3a3e46] [text-wrap:balance]">
                    Your resume has 7 seconds. <br className="hidden sm:inline" />
                    Will it make the cut?
                  </h1>
                  <p className="mt-5 max-w-[38rem] text-pretty text-[17px] text-ink-2 md:text-[19px]">
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
                      <span className="text-[13.5px] text-ink-2">PDF or Word, read in your browser</span>
                    </div>
                  ) : (
                    <button type="button" className="halo-button mt-9" onClick={chooseFile}>
                      <Upload aria-hidden="true" />
                      {state.step === "problem" ? "Try another file" : "Review my resume"}
                    </button>
                  )}
                  <p className="mt-6 text-[13px] text-ink-2">PDF or Word · Free · Read in your browser, never uploaded</p>
                </>
              )}
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
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
