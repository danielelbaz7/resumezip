// What the Jobs tab sends /api/jobs and what comes back, checked where it's
// read: the route checks requests, since anyone can send anything there, and
// the page checks answers, which come from an AI. Resumes go by ids made for
// the request ("r1", "r2"), not their own, which can be any text.

import { GROUPS, LEVELS, MOST_TERM_CHARS, readProfile, type Level, type ProfileSource, type ResumeProfile } from "./profile"
import { MOST_REQUIREMENTS, ROLE_KINDS } from "./prompt"
import { placeOf, ratingOf, strengthOf, tierOf, type Evidence, type Requirement } from "./score"

export type RoleKind = (typeof ROLE_KINDS)[number]

/** Resumes summed up in one request; more are sent in several. */
export const MOST_PER_PROFILES = 5
/** Profiles a posting is matched against at once. */
export const MOST_PROFILES = 50
export const MOST_POSTING_CHARS = 20_000
// A long resume's four groups are about 80 lines and 6,000 characters.
const MOST_LINES = 150
const MOST_LINE_CHARS = 1_000
const MOST_RESUME_CHARS = 16_000
const MOST_REASON_CHARS = 300

/**
 * A resume's groups cut to what a request may hold (sourceOf), so a long
 * resume is sent in part rather than turned away: each line to its length,
 * and lines past the resume's length left off, the later groups' first.
 */
export function sendable(source: ProfileSource): ProfileSource {
  let left = MOST_RESUME_CHARS
  const sent = {} as ProfileSource
  for (const group of GROUPS) {
    sent[group] = []
    for (const line of source[group].slice(0, MOST_LINES)) {
      const cut = line.slice(0, Math.min(MOST_LINE_CHARS, left))
      if (!cut) break
      sent[group].push(cut)
      left -= cut.length
    }
  }
  return sent
}

/** The id a resume goes by in a request: its place in it, from 1. */
export const wireId = (index: number) => `r${index + 1}`
const WIRE_ID = /^r\d{1,3}$/

export type ProfilesRequest = { kind: "profiles"; resumes: ({ id: string } & ProfileSource)[] }
export type MatchRequest = { kind: "match"; posting: string; profiles: ({ id: string } & ResumeProfile)[] }

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)

function sourceOf(value: unknown): ({ id: string } & ProfileSource) | null {
  if (!isRecord(value) || typeof value.id !== "string" || !WIRE_ID.test(value.id)) return null
  let chars = 0
  const source = { id: value.id } as { id: string } & ProfileSource
  for (const group of GROUPS) {
    const lines = value[group]
    if (!Array.isArray(lines) || lines.length > MOST_LINES) return null
    for (const line of lines) {
      if (typeof line !== "string" || line.length > MOST_LINE_CHARS) return null
      chars += line.length
    }
    if (chars > MOST_RESUME_CHARS) return null
    source[group] = lines as string[]
  }
  return source
}

/** A request's body as the route takes it, or null if it isn't one the page would send. */
export function jobsRequestOf(body: unknown): ProfilesRequest | MatchRequest | null {
  if (!isRecord(body)) return null
  if (body.kind === "profiles") {
    const resumes = Array.isArray(body.resumes) ? body.resumes.map(sourceOf) : null
    if (!resumes || resumes.length === 0 || resumes.length > MOST_PER_PROFILES || resumes.some((resume) => !resume)) return null
    return { kind: "profiles", resumes: resumes as ProfilesRequest["resumes"] }
  }
  if (body.kind === "match") {
    const { posting, profiles } = body
    if (typeof posting !== "string" || !posting.trim() || posting.length > MOST_POSTING_CHARS) return null
    if (!Array.isArray(profiles) || profiles.length === 0 || profiles.length > MOST_PROFILES) return null
    const read: MatchRequest["profiles"] = []
    for (const item of profiles) {
      // A profile is cut to its limits as it's read, so it can't be made long.
      const profile = readProfile(item)
      if (!profile || !isRecord(item) || typeof item.id !== "string" || !WIRE_ID.test(item.id)) return null
      read.push({ id: item.id, ...profile })
    }
    return { kind: "match", posting, profiles: read }
  }
  return null
}

/** The profiles in an answer, by the request's ids; ones it left out, or for ids it wasn't sent, aren't there. */
export function profilesAnswerOf(answer: unknown, ids: readonly string[]): Record<string, ResumeProfile> {
  const items = isRecord(answer) && Array.isArray(answer.profiles) ? answer.profiles : []
  const profiles: Record<string, ResumeProfile> = {}
  for (const item of items) {
    const profile = readProfile(item)
    if (profile && isRecord(item) && typeof item.id === "string" && ids.includes(item.id) && !profiles[item.id]) profiles[item.id] = profile
  }
  return profiles
}

export interface PostedJob {
  title: string
  company: string
  location: string
  /** "" when the posting doesn't say. */
  level: Level | ""
  /** The kind of role it is, one of ROLE_KINDS. */
  role: RoleKind
  /** The field the work is in; "" when it isn't clear. */
  domain: string
  requirements: Requirement[]
  /** Which projects, from any resume, would make the strongest lineup; "" when one resume already is. */
  advice: string
}

/** What the AI said of one resume for the job: its evidence for each requirement, in their order, and its other layers (score.ts). */
export interface ResumeAnswer {
  evidence: Evidence[]
  projects: number
  experience: number
  domain: number
  narrative: number
  reason: string
}

export interface MatchAnswer {
  job: PostedJob
  /** By the request's ids. */
  resumes: Record<string, ResumeAnswer>
}

/**
 * A match as the route hands it back: in the shape the AI answers in, a list
 * of resumes each with its id, so the page reads it with matchAnswerOf too.
 */
export const answerShapeOf = (match: MatchAnswer) => ({
  job: match.job,
  resumes: Object.entries(match.resumes).map(([id, resume]) => ({ id, ...resume })),
})

const text = (value: unknown, most: number) => (typeof value === "string" ? value.trim().slice(0, most) : "")

/** A requirement as the AI or storage gave it, read defensively; one with no name is nothing. */
export function requirementOf(value: unknown): Requirement | null {
  if (!isRecord(value)) return null
  const name = text(value.name, MOST_TERM_CHARS)
  return name ? { name, tier: tierOf(value.tier, value.must), keyword: text(value.keyword, MOST_TERM_CHARS) } : null
}

/** The job and the matches in an answer, read defensively; null when it has no job. */
export function matchAnswerOf(answer: unknown, ids: readonly string[]): MatchAnswer | null {
  if (!isRecord(answer) || !isRecord(answer.job)) return null
  const { job } = answer
  const requirements = (Array.isArray(job.requirements) ? job.requirements : [])
    .map(requirementOf)
    .filter((requirement) => requirement !== null)
    .slice(0, MOST_REQUIREMENTS)
  const resumes: MatchAnswer["resumes"] = {}
  for (const item of Array.isArray(answer.resumes) ? answer.resumes : []) {
    if (!isRecord(item) || typeof item.id !== "string" || !ids.includes(item.id) || resumes[item.id]) continue
    const evidence = Array.isArray(item.evidence) ? item.evidence : []
    resumes[item.id] = {
      evidence: requirements.map((_, index) => {
        const given = isRecord(evidence[index]) ? evidence[index] : {}
        return { strength: strengthOf(given.strength), place: placeOf(given.place) }
      }),
      projects: ratingOf(item.projects),
      experience: ratingOf(item.experience),
      domain: ratingOf(item.domain),
      narrative: ratingOf(item.narrative),
      reason: text(item.reason, MOST_REASON_CHARS),
    }
  }
  return {
    job: {
      title: text(job.title, 200),
      company: text(job.company, 200),
      location: text(job.location, 200),
      level: LEVELS.includes(job.level as Level) ? (job.level as Level) : "",
      role: roleKindOf(job.role),
      domain: text(job.domain, 200),
      requirements,
      advice: text(job.advice, 500),
    },
    resumes,
  }
}

/** A kind of role as the AI or storage gave it, "other" when it isn't one. */
export const roleKindOf = (value: unknown): RoleKind => (ROLE_KINDS.includes(value as RoleKind) ? (value as RoleKind) : "other")
