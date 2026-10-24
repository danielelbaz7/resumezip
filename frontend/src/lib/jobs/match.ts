// The browser's side of /api/jobs: finds which resume fits a job posting.
// Each resume's profile is reused while its text is the same, and made again,
// five at a time, only for those that changed, as a new posting is matched.
// Then the posting is matched to the profiles, and each resume scored here.

import type { ResumeWithId } from "@/lib/resume"
import { REVIEWER_HEADER, reviewerId } from "@/lib/review/ai/reviewer"
import { fingerprintOf, hasSource, profileSourceOf, readProfile, type ResumeProfile } from "./profile"
import { matchAnswerOf, MOST_PER_PROFILES, MOST_PROFILES, sendable, wireId, type MatchAnswer } from "./request"
import { blendedScore, levelFitOf, ranked, scoreOf } from "./score"
import { readSavedProfile, saveProfile, type Job, type JobMatch } from "./storage"

export type JobsProblem = "off" | "limit" | "busy" | "empty" | "connection" | "other"

export const JOBS_PROBLEMS: Record<JobsProblem, string> = {
  off: "Matching jobs needs the AI, and it isn’t switched on here.",
  limit: "You’ve matched a lot of jobs in a short time. Try again in a few minutes.",
  busy: "The AI is busy right now. Try again in a minute.",
  empty: "None of your resumes has experience, projects, skills or coursework to match yet.",
  connection: "Couldn’t reach the AI. Check your connection and try again.",
  other: "Something went wrong matching this job. Try again in a minute.",
}

/** Why a job couldn't be matched, worded for the person. */
export class JobsError extends Error {
  constructor(readonly reason: JobsProblem) {
    super(JOBS_PROBLEMS[reason])
  }
}

async function post(body: object, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const reviewer = reviewerId()
  let response: Response
  try {
    response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json", ...(reviewer && { [REVIEWER_HEADER]: reviewer }) },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new JobsError("connection")
  }
  const answer = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok || !answer) {
    // The firewall's rate limit turns a request away before the route runs, so its 429 has no { error }.
    if (response.status === 429) throw new JobsError("limit")
    const reason = answer?.error
    throw new JobsError(reason === "off" || reason === "limit" || reason === "busy" ? reason : "other")
  }
  return answer
}

/** What `step` says the page is doing, for its live status line. */
export type Step = { kind: "profiles"; done: number; of: number } | { kind: "match" }

/**
 * Each resume's profile, by its id: the saved one while its text is the same,
 * or a new one, which is saved. A resume with nothing to match on has none,
 * and neither has one the AI left out of its answer.
 */
export async function profilesFor(
  resumes: readonly ResumeWithId[],
  storage: Storage | null,
  { signal, onStep }: { signal?: AbortSignal; onStep?: (step: Step) => void } = {},
): Promise<Map<string, ResumeProfile>> {
  const profiles = new Map<string, ResumeProfile>()
  const changed: { resume: ResumeWithId; source: ReturnType<typeof profileSourceOf>; hash: string }[] = []
  for (const resume of resumes) {
    const source = profileSourceOf(resume)
    if (!hasSource(source)) continue
    const hash = fingerprintOf(source)
    const saved = readSavedProfile(storage, resume.id)
    if (saved?.hash === hash) profiles.set(resume.id, saved.profile)
    else changed.push({ resume, source, hash })
  }
  for (let start = 0; start < changed.length; start += MOST_PER_PROFILES) {
    onStep?.({ kind: "profiles", done: start, of: changed.length })
    const batch = changed.slice(start, start + MOST_PER_PROFILES)
    const answer = await post(
      { kind: "profiles", resumes: batch.map(({ source }, index) => ({ id: wireId(index), ...sendable(source) })) },
      signal,
    )
    // The route hands back each profile by its id in the request (route.ts), read again here as the AI's.
    const made = answer.profiles && typeof answer.profiles === "object" ? (answer.profiles as Record<string, unknown>) : {}
    batch.forEach(({ resume, hash }, index) => {
      const profile = Object.hasOwn(made, wireId(index)) ? readProfile(made[wireId(index)]) : null
      if (!profile) return
      profiles.set(resume.id, profile)
      saveProfile(storage, resume.id, { hash, madeAt: new Date().toISOString(), profile })
    })
  }
  return profiles
}

/** The resume's name as the list shows it. */
const titleOf = (resume: ResumeWithId) => resume.resumeTitle?.trim() || resume.profileSection?.fullName?.trim() || "Untitled resume"

/** Each resume scored for the job, best first, from the AI's answer and each resume's profile, by its id. */
export function matchesOf(answer: MatchAnswer, matched: readonly ResumeWithId[], profiles: ReadonlyMap<string, ResumeProfile>): JobMatch[] {
  const { requirements, level } = answer.job
  const scored = matched.flatMap((resume, index) => {
    const found = answer.resumes[wireId(index)]
    const profile = profiles.get(resume.id)
    if (!found || !profile) return []
    const { score: met, found: places, matched: kept, missing } = scoreOf(requirements, found.places)
    const parts = {
      requirements: requirements.length > 0 ? met : null,
      role: found.role,
      level: levelFitOf(profile.level, level),
      overall: found.overall,
    }
    return [
      {
        resumeId: resume.id,
        resumeTitle: titleOf(resume),
        score: blendedScore(parts.requirements, parts),
        parts,
        found: places,
        matched: kept,
        missing,
        reason: found.reason,
        updatedAt: resume.updatedAt,
      },
    ]
  })
  return ranked(scored).map(({ updatedAt: _, ...match }) => match)
}

/**
 * Matches a posting to the resumes and says how each one fits, as a job to
 * save. Throws a JobsError when it can't; or, once `signal` is aborted,
 * whatever stopped it.
 */
export async function matchJob(
  posting: string,
  link: string,
  resumes: readonly ResumeWithId[],
  storage: Storage | null,
  { signal, onStep }: { signal?: AbortSignal; onStep?: (step: Step) => void } = {},
): Promise<Job> {
  const profiles = await profilesFor(resumes, storage, { signal, onStep })
  // The ones edited last, when there are more than one request takes.
  const matched = resumes
    .filter((resume) => profiles.has(resume.id))
    .sort((a, b) => (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0))
    .slice(0, MOST_PROFILES)
  if (matched.length === 0) throw new JobsError("empty")
  onStep?.({ kind: "match" })
  const answer = await post(
    { kind: "match", posting, profiles: matched.map((resume, index) => ({ id: wireId(index), ...profiles.get(resume.id)! })) },
    signal,
  )
  const match = matchAnswerOf(
    answer.match,
    matched.map((_, index) => wireId(index)),
  )
  if (!match) throw new JobsError("other")
  return {
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    link: link.trim(),
    posting,
    ...match.job,
    matches: matchesOf(match, matched, profiles),
    chosenResumeId: null,
    status: "saved",
    appliedAt: null,
  }
}
