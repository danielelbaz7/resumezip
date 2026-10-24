// The Jobs tab's own localStorage: each resume's profile, under its own key
// so the resumes' format and files don't change, and the list of jobs. Each
// job keeps everything the list shows, so the list needs no AI and still
// reads after a resume is deleted. Saved data is untrusted: it's read
// defensively, and records in the wrong shape are dropped.

import { LEVELS, MOST_TERM_CHARS, readProfile, type Level, type ResumeProfile } from "./profile"
import { MOST_REQUIREMENTS } from "./prompt"
import { requirementOf, roleKindOf, type RoleKind } from "./request"
import { placeOf, ratingOf, strengthOf, type Parts, type Place, type Requirement, type Strength } from "./score"

export const PROFILE_PREFIX = "resumezip.jobProfile:"
export const JOBS_KEY = "resumezip.jobs"
const VERSION = 1
/** Jobs kept; past it, the oldest only saved go first (keptJobs). */
export const MOST_JOBS = 200

export interface SavedProfile {
  /** The fingerprint of what it was made from (profile.ts). */
  hash: string
  madeAt: string
  profile: ResumeProfile
}

export const STATUSES = ["saved", "applied", "interviewing", "offer", "rejected"] as const
export type Status = (typeof STATUSES)[number]
/** Each status as the list shows it. */
export const STATUS_NAMES: Record<Status, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
}

export interface JobMatch {
  resumeId: string
  /** The resume's name when it was matched, shown if it's renamed or deleted since. */
  resumeTitle: string
  /** The whole score, 0 to 100 (blendedScore). */
  score: number
  /**
   * Its layers, each 0 to 100 (score.ts). Null for a job matched before the
   * score was layered, whose score was worked out another way.
   */
  parts: Parts | null
  /** How many tier 1 requirements it has no evidence of, each taking a share off its score. */
  missedScreening: number
  /** For each of the job's requirements, in their order: how directly it's proven, where, and whether its term is on the resume. */
  evidence: { strength: Strength; place: Place; onResume: boolean }[]
  found: { experience: number; projects: number; skills: number; coursework: number; missing: number }
  matched: string[]
  missing: string[]
  reason: string
}

export interface Job {
  id: string
  savedAt: string
  /** "" when none was given. */
  link: string
  /** The posting as pasted, so it can be matched again. */
  posting: string
  title: string
  company: string
  location: string
  level: Level | ""
  /** The kind of role, as the AI classified it; "other" for a job saved before. */
  role: RoleKind
  /** The field the work is in; "" when it isn't clear. */
  domain: string
  requirements: Requirement[]
  /** Which projects, from any resume, would make the strongest lineup; "" when none is given. */
  advice: string
  /** Best first, as scored when it was matched. */
  matches: JobMatch[]
  chosenResumeId: string | null
  status: Status
  /** When it was first marked applied or past it. */
  appliedAt: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
const text = (value: unknown, most = 2_000) => (typeof value === "string" ? value.slice(0, most) : "")
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0)
const date = (value: unknown) => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null)
const names = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, MOST_TERM_CHARS)) : []

const ratingOrNull = (value: unknown) => (value === null ? null : ratingOf(value))

// Only the layered score's parts: a match saved with another score's has none.
function partsOf(value: unknown): Parts | null {
  if (!isRecord(value) || !("narrative" in value)) return null
  return {
    core: ratingOrNull(value.core),
    projects: ratingOf(value.projects),
    experience: ratingOf(value.experience),
    domain: ratingOf(value.domain),
    keywords: ratingOrNull(value.keywords),
    narrative: ratingOf(value.narrative),
  }
}

function matchOf(value: unknown): JobMatch | null {
  if (!isRecord(value) || typeof value.resumeId !== "string") return null
  const found = isRecord(value.found) ? value.found : {}
  return {
    resumeId: value.resumeId,
    resumeTitle: text(value.resumeTitle, 200),
    score: Math.min(100, count(value.score)),
    parts: partsOf(value.parts),
    missedScreening: count(value.missedScreening),
    evidence: (Array.isArray(value.evidence) ? value.evidence : []).slice(0, MOST_REQUIREMENTS).map((item) => {
      const given = isRecord(item) ? item : {}
      return { strength: strengthOf(given.strength), place: placeOf(given.place), onResume: given.onResume === true }
    }),
    found: {
      experience: count(found.experience),
      projects: count(found.projects),
      skills: count(found.skills),
      coursework: count(found.coursework),
      missing: count(found.missing),
    },
    matched: names(value.matched),
    missing: names(value.missing),
    reason: text(value.reason, 300),
  }
}

/** A saved job, read defensively; null when it has no id or date to be listed by. */
export function jobOf(value: unknown): Job | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id) return null
  const savedAt = date(value.savedAt)
  if (!savedAt) return null
  const status = STATUSES.includes(value.status as Status) ? (value.status as Status) : "saved"
  return {
    id: value.id,
    savedAt,
    link: text(value.link, 2_000),
    posting: text(value.posting, 20_000),
    title: text(value.title, 200),
    company: text(value.company, 200),
    location: text(value.location, 200),
    level: LEVELS.includes(value.level as Level) ? (value.level as Level) : "",
    role: roleKindOf(value.role),
    domain: text(value.domain, 200),
    // A job saved before requirements had tiers has must-haves, read as tier 1, and the rest tier 3.
    requirements: (Array.isArray(value.requirements) ? value.requirements : [])
      .map(requirementOf)
      .filter((requirement) => requirement !== null)
      .slice(0, MOST_REQUIREMENTS),
    advice: text(value.advice, 500),
    matches: (Array.isArray(value.matches) ? value.matches : []).map(matchOf).filter((match) => match !== null),
    chosenResumeId: typeof value.chosenResumeId === "string" ? value.chosenResumeId : null,
    status,
    appliedAt: date(value.appliedAt),
  }
}

/** The saved jobs, newest first; none when there are none or they can't be read. */
export function readJobs(storage: Storage | null): Job[] {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(JOBS_KEY) ?? "null")
    const jobs = isRecord(saved) && Array.isArray(saved.jobs) ? saved.jobs.map(jobOf).filter((job) => job !== null) : []
    return [...new Map(jobs.map((job) => [job.id, job])).values()].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
  } catch {
    return []
  }
}

/**
 * At most MOST_JOBS, newest first: past it, the oldest that are only saved
 * are let go first, since the ones applied to are the record worth keeping.
 */
export function keptJobs(jobs: readonly Job[]): Job[] {
  const newest = [...jobs].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
  let over = newest.length - MOST_JOBS
  if (over <= 0) return newest
  const dropped = new Set<string>()
  for (const job of [...newest].reverse()) {
    if (over > 0 && job.status === "saved") {
      dropped.add(job.id)
      over--
    }
  }
  return newest.filter((job) => !dropped.has(job.id)).slice(0, MOST_JOBS)
}

/** Saves the jobs; false when the browser won't, as when it's full. */
export function saveJobs(storage: Storage | null, jobs: readonly Job[]): boolean {
  try {
    storage?.setItem(JOBS_KEY, JSON.stringify({ version: VERSION, jobs: keptJobs(jobs) }))
    return !!storage
  } catch {
    return false
  }
}

/** A resume's saved profile, or null when it has none that can be read. */
export function readSavedProfile(storage: Storage | null, resumeId: string): SavedProfile | null {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(PROFILE_PREFIX + resumeId) ?? "null")
    if (!isRecord(saved) || typeof saved.hash !== "string") return null
    const profile = readProfile(saved.profile)
    const madeAt = date(saved.madeAt)
    return profile && madeAt ? { hash: saved.hash, madeAt, profile } : null
  } catch {
    return null
  }
}

export function saveProfile(storage: Storage | null, resumeId: string, saved: SavedProfile): void {
  try {
    storage?.setItem(PROFILE_PREFIX + resumeId, JSON.stringify({ version: VERSION, ...saved }))
  } catch {
    // A profile that isn't kept is only made again next time.
  }
}

/** Clears the profiles of resumes that aren't here any more. */
export function forgetProfiles(storage: Storage | null, resumeIds: ReadonlySet<string>): void {
  if (!storage) return
  try {
    const gone: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(PROFILE_PREFIX) && !resumeIds.has(key.slice(PROFILE_PREFIX.length))) gone.push(key)
    }
    for (const key of gone) storage.removeItem(key)
  } catch {
    // Left for next time.
  }
}
