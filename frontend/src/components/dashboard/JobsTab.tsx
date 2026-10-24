"use client"

// The dashboard's Jobs tab: paste a job posting and see which resume fits it
// best (lib/jobs), then keep the job in a list with the resume used and where
// the application stands. The list is saved in this browser, apart from the
// resumes (lib/jobs/storage.ts).

import { useEffect, useId, useRef, useState } from "react"
import { ExternalLink, Loader2, Trash2 } from "lucide-react"
import { BLUE_PILL, sheetPill, TEXT_PILL } from "@/components/pills"
import { JOBS_PROBLEMS, JobsError, matchJob, type Step } from "@/lib/jobs/match"
import { MOST_POSTING_CHARS } from "@/lib/jobs/request"
import {
  forgetProfiles,
  JOBS_KEY,
  readJobs,
  saveJobs,
  STATUS_NAMES,
  STATUSES,
  type Job,
  type JobMatch,
  type Status,
} from "@/lib/jobs/storage"
import type { Strength, Tier } from "@/lib/jobs/score"
import type { ResumeWithId } from "@/lib/resume"
import { getStorage } from "@/lib/resumeKeys"

const FIELD =
  "w-full rounded-[6px] border border-rule bg-sheet px-4 py-3 text-[15px] leading-normal text-ink outline-none transition-colors placeholder:text-ink-2/50 focus:border-ink/30"

const dateOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })

// A link as typed, made one the browser can open; "" when it isn't one.
function hrefOf(link: string): string {
  const typed = /^https?:\/\//i.test(link) ? link : `https://${link}`
  return URL.canParse(typed) && /^https?:$/.test(new URL(typed).protocol) ? typed : ""
}

// A score's layers, as the list shows them, in the order they count for: one the job didn't have to score is left out.
const partsText = (parts: NonNullable<JobMatch["parts"]>) =>
  [
    parts.core !== null && `Core ${parts.core}`,
    `Projects ${parts.projects}`,
    `Experience ${parts.experience}`,
    `Domain ${parts.domain}`,
    parts.keywords !== null && `Keywords ${parts.keywords}`,
    `Story ${parts.narrative}`,
  ].filter(Boolean)

const TIER_NAMES: Record<Tier, string> = { 1: "must-have", 2: "strong signal", 3: "nice to have" }
const STRENGTH_NAMES: Record<Strength, string> = { strong: "Strong proof", good: "Shown", weak: "Only listed", none: "Not shown" }

const stepText = (step: Step) =>
  step.kind === "link"
    ? "Reading the posting at its link, then matching it to your resumes…"
    : step.kind === "match"
      ? "Matching the job to your resumes…"
      : `Summing up ${step.of === 1 ? "a resume" : `${step.of} resumes`} that changed since the last job…`

interface JobsTabProps {
  /** The resumes in this browser, without one just deleted. */
  resumes: ResumeWithId[]
  loaded: boolean
  onOpen: (id: string) => void
}

export default function JobsTab({ resumes, loaded, onOpen }: JobsTabProps) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [posting, setPosting] = useState("")
  const [link, setLink] = useState("")
  const [step, setStep] = useState<Step | null>(null)
  const [problem, setProblem] = useState("")
  // What the last match has to say besides, as a link that couldn't be read.
  const [notice, setNotice] = useState("")
  const [openJob, setOpenJob] = useState<string | null>(null)
  const matching = useRef<AbortController | null>(null)
  const postingId = useId()
  const noteId = useId()

  // The list as saved, and again when another tab changes it.
  useEffect(() => {
    const storage = getStorage()
    setJobs(readJobs(storage))
    const onStorage = (event: StorageEvent) => {
      if (event.key === JOBS_KEY || event.key === null) setJobs(readJobs(storage))
    }
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener("storage", onStorage)
      matching.current?.abort()
    }
  }, [])

  // A deleted resume's profile isn't needed again.
  useEffect(() => {
    if (loaded) forgetProfiles(getStorage(), new Set(resumes.map((resume) => resume.id)))
  }, [loaded, resumes])

  const save = (next: Job[]) => {
    setJobs(next)
    if (!saveJobs(getStorage(), next)) setProblem("This browser wouldn’t save the job list. It may be full.")
  }
  const change = (id: string, edit: (job: Job) => Job) => save(jobs.map((job) => (job.id === id ? edit(job) : job)))

  const find = async () => {
    if ((!posting.trim() && !link.trim()) || step) return
    matching.current?.abort()
    const current = new AbortController()
    matching.current = current
    setProblem("")
    setNotice("")
    try {
      const { job, note } = await matchJob(posting, link, resumes, getStorage(), { signal: current.signal, onStep: setStep })
      if (current.signal.aborted) return
      if (note === "link-unread") setNotice("Couldn’t read the link, so only the description you pasted was matched.")
      // Read again, in case another tab saved a job meanwhile.
      save([job, ...readJobs(getStorage())])
      setOpenJob(job.id)
      setPosting("")
      setLink("")
    } catch (error) {
      if (current.signal.aborted) return
      if (!(error instanceof JobsError)) console.error("Couldn't match the job:", error)
      setProblem(error instanceof JobsError ? error.message : JOBS_PROBLEMS.other)
    } finally {
      if (matching.current === current) {
        matching.current = null
        setStep(null)
      }
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-10">
      <form
        className="mx-auto flex w-full max-w-[720px] flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void find()
        }}
      >
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-[28px] leading-tight tracking-[-0.02em] text-ink">Which resume fits this job?</h2>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Give a job posting’s link, paste its description, or both. Each resume is scored in layers: how directly it proves the job’s
            core requirements, then how relevant its projects, experience and domain are, whether the job’s keywords are on it, and whether
            it tells one story for the role. A must-have with no evidence costs a share of the score.
          </p>
        </div>
        <label htmlFor={postingId} className="label-mono text-ink-2">
          Job posting
        </label>
        <textarea
          id={postingId}
          value={posting}
          onChange={(event) => setPosting(event.target.value)}
          readOnly={step !== null}
          rows={8}
          maxLength={MOST_POSTING_CHARS}
          aria-describedby={noteId}
          placeholder="Paste the job’s title, company and description, or leave it empty and give the link…"
          className={`${FIELD} resize-y`}
        />
        <label className="flex flex-col gap-2">
          <span className="label-mono text-ink-2">Link</span>
          {/* Text rather than type="url", which won't take an address typed without https://. */}
          <input
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={link}
            onChange={(event) => setLink(event.target.value)}
            readOnly={step !== null}
            placeholder="jobs.example.com/backend-engineer"
            className={FIELD}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={(!posting.trim() && !link.trim()) || step !== null || !loaded || resumes.length === 0}
            className={BLUE_PILL}
          >
            {step && <Loader2 className="animate-spin" aria-hidden="true" />}
            Find the best resume
          </button>
          {step && (
            <button type="button" onClick={() => matching.current?.abort()} className={TEXT_PILL}>
              Cancel
            </button>
          )}
        </div>
        <p role="status" className="min-h-[1lh] text-[14px] leading-normal text-ink-2">
          {step ? stepText(step) : loaded && resumes.length === 0 ? "Make a resume first, then match jobs to it." : notice}
        </p>
        {problem && (
          <p role="alert" className="border-l-2 border-alert pl-3 text-[14px] leading-normal text-ink">
            {problem}
          </p>
        )}
        <p id={noteId} className="text-[13px] leading-normal text-ink-3">
          A link is read by resumezip’s server, which can’t log in: some sites, like LinkedIn and Indeed, don’t let it read their postings.
          The posting, and the experience, projects, skills and coursework of every resume here, go to the AI to be matched. A resume that
          hasn’t changed since the last job isn’t sent again. Jobs are saved in this browser only.
        </p>
      </form>

      <section aria-labelledby={`${postingId}-list`} className="mx-auto flex w-full max-w-[720px] flex-col gap-3">
        <h2 id={`${postingId}-list`} className="label-mono text-ink-2">
          {jobs.length === 0 ? "No jobs yet" : `Jobs · ${jobs.length}`}
        </h2>
        <ul className="flex flex-col gap-3">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              open={openJob === job.id}
              resumes={resumes}
              onToggle={() => setOpenJob(openJob === job.id ? null : job.id)}
              onStatus={(status) =>
                change(job.id, (saved) => ({
                  ...saved,
                  status,
                  appliedAt: saved.appliedAt ?? (status === "saved" ? null : new Date().toISOString()),
                }))
              }
              onChoose={(resumeId) => change(job.id, (saved) => ({ ...saved, chosenResumeId: resumeId }))}
              onDelete={() => save(jobs.filter((saved) => saved.id !== job.id))}
              onOpen={onOpen}
            />
          ))}
        </ul>
      </section>
    </div>
  )
}

interface JobCardProps {
  job: Job
  open: boolean
  resumes: ResumeWithId[]
  onToggle: () => void
  onStatus: (status: Status) => void
  onChoose: (resumeId: string) => void
  onDelete: () => void
  onOpen: (id: string) => void
}

function JobCard({ job, open, resumes, onToggle, onStatus, onChoose, onDelete, onOpen }: JobCardProps) {
  const [deleting, setDeleting] = useState(false)
  const panelId = useId()
  const statusId = useId()
  const here = new Set(resumes.map((resume) => resume.id))
  const best = job.matches[0]
  const chosen = job.matches.find((match) => match.resumeId === job.chosenResumeId)
  const heading = job.title || "Untitled job"
  const place = [job.company, job.location].filter(Boolean).join(" · ")
  const href = hrefOf(job.link)

  return (
    <li className="rounded-[18px] border border-rule bg-sheet">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-[1_1_260px] flex-col items-start gap-0.5 text-left"
        >
          <span className="text-[16px] font-medium text-ink">{heading}</span>
          <span className="text-[14px] text-ink-2">{[place, `Saved ${dateOf(job.savedAt)}`].filter(Boolean).join(" · ")}</span>
          <span className="text-[14px] text-ink-2">
            {chosen
              ? `Sent: ${chosen.resumeTitle} · ${chosen.score}`
              : best
                ? `Best fit: ${best.resumeTitle} · ${best.score}`
                : "No resume matched"}
          </span>
        </button>
        <div className="flex items-center gap-2">
          <label htmlFor={statusId} className="sr-only">
            Status of {heading}
          </label>
          <select
            id={statusId}
            value={job.status}
            onChange={(event) => onStatus(event.target.value as Status)}
            className="h-9 rounded-full border border-rule bg-sheet px-3 text-[14px] text-ink"
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_NAMES[status]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {open && (
        <div id={panelId} className="flex flex-col gap-5 border-t border-hairline px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-ink-2">
            {href && (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-accent hover:underline"
              >
                Open the posting <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            )}
            {job.appliedAt && <span>Applied {dateOf(job.appliedAt)}</span>}
            {job.level && <span>Level: {job.level}</span>}
            {job.role !== "other" && <span>Role: {job.role}</span>}
            {job.domain && <span>Domain: {job.domain}</span>}
          </div>
          {job.advice && <p className="text-[14px] leading-normal text-ink">{job.advice}</p>}

          {job.requirements.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="label-mono text-ink-2">What it asks for</h3>
              <ul className="flex flex-wrap gap-1.5">
                {job.requirements.map((requirement) => (
                  <li
                    key={requirement.name}
                    title={requirement.quote ? `From the posting: “${requirement.quote}”` : undefined}
                    className="rounded-full bg-fill px-2.5 py-1 text-[13px] text-ink"
                  >
                    {requirement.name}
                    <span className="text-ink-3"> · {TIER_NAMES[requirement.tier]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h3 className="label-mono text-ink-2">Your resumes, best fit first</h3>
            <ol className="flex flex-col gap-3">
              {job.matches.map((match) => {
                const where = [
                  match.found.experience && `${match.found.experience} in experience`,
                  match.found.projects && `${match.found.projects} in projects`,
                  match.found.skills && `${match.found.skills} in skills`,
                  match.found.coursework && `${match.found.coursework} in coursework`,
                  match.found.missing && `${match.found.missing} missing`,
                ].filter(Boolean)
                const isChosen = match.resumeId === job.chosenResumeId
                return (
                  <li key={match.resumeId} className="flex flex-col gap-1 border-l-2 border-rule pl-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[15px] font-medium text-ink">
                        {match.resumeTitle}
                        {!here.has(match.resumeId) && <span className="font-normal text-ink-3"> · deleted</span>}
                      </span>
                      <span className="font-mono text-[14px] tabular-nums text-ink" aria-label={`Score ${match.score} out of 100`}>
                        {match.score}
                      </span>
                    </div>
                    {match.parts && <p className="font-mono text-[12px] tabular-nums text-ink-2">{partsText(match.parts).join(" · ")}</p>}
                    {where.length > 0 && <p className="text-[13px] text-ink-2">{where.join(" · ")}</p>}
                    {match.reason && <p className="text-[14px] leading-normal text-ink">{match.reason}</p>}
                    {match.missedScreening > 0 && (
                      <p className="text-[13px] text-alert">
                        Missing {match.missedScreening === 1 ? "a must-have" : `${match.missedScreening} must-haves`}:{" "}
                        {job.requirements
                          .filter((requirement, at) => requirement.tier === 1 && match.evidence[at]?.strength === "none")
                          .map((requirement) => requirement.name)
                          .join(", ")}
                      </p>
                    )}
                    {match.missing.length > 0 && <p className="text-[13px] text-ink-3">Missing: {match.missing.join(", ")}</p>}
                    {match.evidence.length === job.requirements.length && match.evidence.length > 0 && (
                      <details className="text-[13px]">
                        <summary className="cursor-pointer text-ink-2">Requirement by requirement</summary>
                        <ul className="mt-2 flex flex-col gap-1">
                          {job.requirements.map((requirement, at) => {
                            const { strength, place, onResume } = match.evidence[at]
                            return (
                              <li key={requirement.name} className="flex flex-wrap justify-between gap-x-3 text-ink">
                                <span>
                                  {requirement.name} <span className="text-ink-3">· {TIER_NAMES[requirement.tier]}</span>
                                </span>
                                <span className="text-ink-2">
                                  {STRENGTH_NAMES[strength]}
                                  {strength !== "none" && place !== "nowhere" ? ` in ${place}` : ""} ·{" "}
                                  {onResume ? "keyword on it" : "keyword not on it"}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      </details>
                    )}
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onChoose(match.resumeId)}
                        aria-pressed={isChosen}
                        className={sheetPill(isChosen ? "blue" : "white", "h-8 px-3.5 text-[13px]")}
                      >
                        {isChosen ? "Using this one" : "Use this one"}
                      </button>
                      {here.has(match.resumeId) && (
                        <button type="button" onClick={() => onOpen(match.resumeId)} className={sheetPill("text", "h-8 px-3 text-[13px]")}>
                          Open it
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>

          <div className="flex justify-end gap-2">
            {deleting ? (
              <>
                <span className="self-center text-[14px] text-ink" role="status">
                  Delete this job?
                </span>
                <button type="button" onClick={() => setDeleting(false)} className={sheetPill("white", "h-8 px-3.5 text-[13px]")}>
                  Keep
                </button>
                <button type="button" onClick={onDelete} className={sheetPill("danger", "h-8 px-3.5 text-[13px]")}>
                  Delete
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setDeleting(true)} className={sheetPill("text", "h-8 px-3 text-[13px]")}>
                <Trash2 aria-hidden="true" />
                Delete job
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
