// The browser's side of /api/jobs: finds which resume fits a job posting.
// Each resume's profile is reused while its text is the same, and made again,
// five at a time, only for those that changed, as a new posting is matched.
// Then the posting is matched to the profiles, and each resume scored here.

import type { ResumeWithId } from "@/lib/resume"
import { REVIEWER_HEADER, reviewerId } from "@/lib/review/ai/reviewer"
import { graduationFit, graduationOf } from "./graduation"
import { examplesTextOf, fingerprintOf, groupLines, GROUPS, hasSource, profileSourceOf, readProfile, type ResumeProfile } from "./profile"
import {
  linkOf,
  matchAnswerOf,
  MOST_PER_PROFILES,
  MOST_PROFILES,
  postingProblem,
  scoreAnswerOf,
  sendable,
  wireId,
  type MatchAnswer,
} from "./request"
import { blendedScore, coreOf, foundOf, keywordsOf, missingScreening, onResume, ranked, type Parts, type Requirement } from "./score"
import { readSavedProfile, saveProfile, type Job, type JobMatch } from "./storage"
import { sendableTailor, tailorAnswerOf, tailorSourceOf, type TailorAnswer, type TailorSource } from "./tailor"

export type JobsProblem =
  "off" | "limit" | "busy" | "empty" | "short" | "not-posting" | "link" | "bad-link" | "answer" | "connection" | "other"

export const JOBS_PROBLEMS: Record<JobsProblem, string> = {
  short: "That’s too short to be a job posting. Paste the job’s whole description, or give its link.",
  "not-posting": "That doesn’t look like a job posting. Paste the job’s description, or give its link.",
  link: "Couldn’t read a job posting at that link. Some sites, like LinkedIn and Indeed, don’t let it be read: paste the description instead.",
  "bad-link": "That link isn’t a web address. Check it, or paste the description instead.",
  answer: "The AI’s answer came back incomplete, so nothing was saved. Try again.",
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
    const known: JobsProblem[] = ["off", "limit", "busy", "short", "not-posting", "link", "bad-link", "answer"]
    throw new JobsError(known.includes(reason as JobsProblem) ? (reason as JobsProblem) : "other")
  }
  return answer
}

/** What `step` says the page is doing, for its live status line. */
export type Step = { kind: "profiles"; done: number; of: number } | { kind: "match" } | { kind: "link" }

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
      // The route only answers with every profile whole (profilesAnswerOf); one missing isn't made up here.
      if (!profile) throw new JobsError("answer")
      profiles.set(resume.id, profile)
      saveProfile(storage, resume.id, { hash, madeAt: new Date().toISOString(), profile })
    })
  }
  return profiles
}

/** The resume's name as the list shows it. */
const titleOf = (resume: ResumeWithId) => resume.resumeTitle?.trim() || resume.profileSection?.fullName?.trim() || "Untitled resume"

// The resume's text the keywords are looked for in: what its profile is made
// from, which is most of what hiring software would read of it.
const textOf = (resume: ResumeWithId) => {
  const source = profileSourceOf(resume)
  return GROUPS.flatMap((group) => groupLines(source, group)).join("\n")
}

/**
 * How many of a resume's jobs and projects show a requirement: those whose
 * text has its keyword or its name, word for word. Counted here rather than
 * by the AI, which only sees each resume's profile.
 */
export function examplesOf(requirement: Requirement, examples: readonly string[]): number {
  const terms = [requirement.keyword, requirement.name].filter(Boolean)
  return examples.filter((text) => terms.some((term) => onResume(term, text))).length
}

/** The resumes kept with a job, best first: the rest aren't worth sending. */
export const MOST_MATCHES = 5

/** The MOST_MATCHES resumes that fit the job best, scored from the AI's answer (score.ts). */
export function matchesOf(answer: MatchAnswer, matched: readonly ResumeWithId[]): JobMatch[] {
  const { requirements } = answer.job
  const scored = matched.flatMap((resume, index) => {
    const given = answer.resumes[wireId(index)]
    if (!given) return []
    const text = textOf(resume)
    const shown = examplesTextOf(resume)
    const evidence = given.evidence.map((found, at) => ({ ...found, examples: examplesOf(requirements[at], shown) }))
    const graduation = answer.job.graduation ? graduationFit(answer.job.graduation, graduationOf(resume)) : null
    const parts: Parts = {
      core: coreOf(requirements, evidence),
      projects: given.projects,
      experience: given.experience,
      domain: given.domain,
      keywords: keywordsOf(requirements, text),
      narrative: given.narrative,
    }
    const missedScreening = missingScreening(requirements, evidence)
    const proven = requirements.filter((_, at) => given.evidence[at].strength !== "none").map((requirement) => requirement.name)
    return [
      {
        resumeId: resume.id,
        resumeTitle: titleOf(resume),
        // A graduation date outside the window counts as a must-have missed.
        score: blendedScore(parts, missedScreening + (graduation === "outside" ? 1 : 0)),
        parts,
        missedScreening,
        graduation,
        graduationDate: graduationOf(resume) ?? "",
        tailoredFrom: null,
        scoredHash: "",
        evidence: evidence.map((found, at) => ({
          ...found,
          examples: found.examples,
          onResume: onResume(requirements[at].keyword || requirements[at].name, text),
        })),
        found: foundOf(given.evidence),
        matched: proven,
        missing: requirements.filter((_, at) => given.evidence[at].strength === "none").map((requirement) => requirement.name),
        reason: given.reason,
        updatedAt: resume.updatedAt,
      },
    ]
  })
  return ranked(scored)
    .slice(0, MOST_MATCHES)
    .map(({ updatedAt: _, ...match }) => match)
}

/** A job matched, and what the page should say besides: "link-unread" when its link couldn't be read and only the pasted text was matched. */
export interface Matched {
  job: Job
  note: "link-unread" | ""
}

/**
 * Matches a posting to the resumes and says how each one fits, as a job to
 * save. The posting is the text pasted, the one at `link`, or both, which
 * the route reads and puts together. Throws a JobsError when it can't; or,
 * once `signal` is aborted, whatever stopped it.
 */
export async function matchJob(
  pasted: string,
  typedLink: string,
  resumes: readonly ResumeWithId[],
  storage: Storage | null,
  { signal, onStep }: { signal?: AbortSignal; onStep?: (step: Step) => void } = {},
): Promise<Matched> {
  // Said before anything's sent: a link that isn't one, and, with no link, a word or a name that isn't a posting.
  const link = linkOf(typedLink)
  if (link === null) throw new JobsError("bad-link")
  const posting = pasted.trim()
  if (!link) {
    const problem = postingProblem(posting)
    if (problem) throw new JobsError(problem)
  }
  const profiles = await profilesFor(resumes, storage, { signal, onStep })
  // The ones edited last, when there are more than one request takes.
  const matched = resumes
    .filter((resume) => profiles.has(resume.id))
    .sort((a, b) => (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0))
    .slice(0, MOST_PROFILES)
  if (matched.length === 0) throw new JobsError("empty")
  onStep?.({ kind: link ? "link" : "match" })
  const answer = await post(
    { kind: "match", posting, link, profiles: matched.map((resume, index) => ({ id: wireId(index), ...profiles.get(resume.id)! })) },
    signal,
  )
  // What was matched: the paste and the link's page together, as the route put them.
  if (typeof answer.posting !== "string" || !answer.posting) throw new JobsError("answer")
  const match = matchAnswerOf(
    answer.match,
    matched.map((_, index) => wireId(index)),
    answer.posting,
  )
  if (!match) throw new JobsError("answer")
  if (!match.isPosting) throw new JobsError("not-posting")
  return {
    job: {
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      link,
      posting: answer.posting,
      ...match.job,
      matches: matchesOf(match, matched),
      chosenResumeId: null,
      status: "saved",
      appliedAt: null,
      tailorings: [],
    },
    note: answer.note === "link-unread" ? "link-unread" : "",
  }
}

/**
 * Asks the AI to tailor `resume` for `job` (tailor.ts): the skills to add
 * that its jobs and projects show, and its gaps. Throws a JobsError when it
 * can't; or, once `signal` is aborted, whatever stopped it.
 */
export async function tailorFor(
  job: Job,
  resume: ResumeWithId,
  { signal }: { signal?: AbortSignal } = {},
): Promise<{ answer: TailorAnswer; source: TailorSource }> {
  if (!job.posting.trim()) throw new JobsError("short")
  const source = sendableTailor(tailorSourceOf(resume))
  const requirements = job.requirements.map(({ name, tier, keyword }) => ({ name, tier, keyword }))
  const answer = await post({ kind: "tailor", posting: job.posting, requirements, resume: source }, signal)
  const tailoring = tailorAnswerOf(answer.tailoring, source, job.posting)
  if (!tailoring) throw new JobsError("answer")
  return { answer: tailoring, source }
}

/**
 * Scores one resume for a job against the requirements it was matched on,
 * as a copy tailored for it is (tailor.ts), so its score is comparable with
 * the others': its profile is made if it has none up to date, then the AI
 * judges it against those requirements, and it's scored as matching scores.
 * Throws a JobsError when it can't; or, once `signal` is aborted, whatever
 * stopped it.
 */
export async function scoreFor(
  job: Job,
  resume: ResumeWithId,
  storage: Storage | null,
  { tailoredFrom, signal }: { tailoredFrom: string; signal?: AbortSignal },
): Promise<JobMatch> {
  if (!job.posting.trim()) throw new JobsError("short")
  const profile = (await profilesFor([resume], storage, { signal })).get(resume.id)
  if (!profile) throw new JobsError("empty")
  const requirements = job.requirements.map(({ name, tier, keyword }) => ({ name, tier, keyword }))
  const id = wireId(0)
  const answer = await post({ kind: "score", posting: job.posting, requirements, profiles: [{ id, ...profile }] }, signal)
  const resumes = scoreAnswerOf(answer, [id], requirements.length)
  if (!resumes) throw new JobsError("answer")
  const { title, company, location, level, role, domain, advice, graduation } = job
  const [match] = matchesOf(
    {
      isPosting: true,
      job: { title, company, location, level, role, domain, requirements: job.requirements, advice, graduation },
      resumes,
    },
    [resume],
  )
  if (!match) throw new JobsError("answer")
  return { ...match, tailoredFrom, scoredHash: fingerprintOf(profileSourceOf(resume)) }
}
